package com.ideaconnection.file;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.web.*;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class FileService {
  static final long MAX_BYTES = 100_000_000L;
  private final FileRepository files;
  private final MembershipClient memberships;
  private final ObjectStorage storage;

  FileService(FileRepository files, MembershipClient memberships, ObjectStorage storage) {
    this.files = files;
    this.memberships = memberships;
    this.storage = storage;
  }

  @Transactional(readOnly = true)
  public PageResponse<FileResponse> list(
      Long orgId, String userId, String token, String requestId, PageQuery query) {
    validOrg(orgId);
    memberships.requireMember(orgId, userId, token, requestId);
    var page =
        files.findByOrgIdAndStatus(
            orgId,
            "COMPLETED",
            PageRequest.of(
                query.page(), query.size(), Sort.by(Sort.Direction.DESC, "createdAt", "id")));
    return new PageResponse<>(
        page.map(FileResponse::from).getContent(),
        query.page(),
        query.size(),
        page.getTotalElements());
  }

  @Transactional
  public UploadResponse initiate(
      UploadRequest request, String userId, String token, String requestId) {
    validOrg(request.orgId());
    memberships.requireMember(request.orgId(), userId, token, requestId);
    if (request.sizeBytes() == null || request.sizeBytes() < 1) throw badRequest();
    if (request.sizeBytes() > MAX_BYTES)
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "FILE_TOO_LARGE", "파일은 최대 100MB까지 업로드할 수 있습니다.");
    if (request.name() == null
        || request.name().isBlank()
        || request.name().length() > 255
        || request.name().chars().anyMatch(c -> Character.isISOControl(c))) throw badRequest();
    if (request.contentType() == null
        || request.contentType().length() > 255
        || !request.contentType().matches("[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+"))
      throw badRequest();
    var file =
        files.saveAndFlush(
            new FileRecord(
                request.orgId(),
                request.name(),
                request.contentType().toLowerCase(java.util.Locale.ROOT),
                request.sizeBytes(),
                "orgs/" + request.orgId() + "/" + UUID.randomUUID(),
                userId));
    return new UploadResponse(file.id.toString(), storage.uploadUrl(file), expiresAt());
  }

  @Transactional
  public FileResponse complete(Long id, String userId, String token, String requestId) {
    var file = requireFileForUpdate(id);
    memberships.requireMember(file.orgId, userId, token, requestId);
    if (!file.uploadedBy.equals(userId)) throw forbidden();
    if ("COMPLETED".equals(file.status)) return FileResponse.from(file);
    if (storage.size(file.storageKey) != file.sizeBytes)
      throw new ApiException(HttpStatus.CONFLICT, "UPLOAD_SIZE_MISMATCH", "업로드한 파일 크기가 다릅니다.");
    file.status = "COMPLETED";
    file.completedAt = Instant.now();
    return FileResponse.from(file);
  }

  @Transactional(readOnly = true)
  public UrlResponse readUrl(
      Long id, String userId, String token, String requestId, boolean preview) {
    var file = requireFile(id);
    memberships.requireMember(file.orgId, userId, token, requestId);
    if (!"COMPLETED".equals(file.status))
      throw new ApiException(HttpStatus.CONFLICT, "FILE_NOT_READY", "업로드가 완료되지 않았습니다.");
    if (preview
        && !java.util.Set.of(
                "image/png",
                "image/jpeg",
                "image/gif",
                "image/webp",
                "image/avif",
                "application/pdf")
            .contains(file.contentType))
      throw new ApiException(HttpStatus.CONFLICT, "PREVIEW_NOT_SUPPORTED", "미리보기를 지원하지 않는 형식입니다.");
    return new UrlResponse(storage.readUrl(file, preview), expiresAt());
  }

  @Transactional
  public void delete(Long id, String userId, String token, String requestId) {
    var file = requireFileForUpdate(id);
    String role = memberships.requireMember(file.orgId, userId, token, requestId);
    if (!file.uploadedBy.equals(userId) && !"OWNER".equals(role)) throw forbidden();
    storage.delete(file.storageKey);
    files.delete(file);
  }

  private FileRecord requireFileForUpdate(Long id) {
    return files
        .findForUpdate(id)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "파일을 찾을 수 없습니다."));
  }

  private FileRecord requireFile(Long id) {
    return files
        .findById(id)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "파일을 찾을 수 없습니다."));
  }

  private void validOrg(Long id) {
    if (id == null || id < 1) throw badRequest();
  }

  private ApiException badRequest() {
    return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "파일 정보를 확인해 주세요.");
  }

  private ApiException forbidden() {
    return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "파일을 처리할 권한이 없습니다.");
  }

  private String expiresAt() {
    return ApiTime.format(Instant.now().plus(S3ObjectStorage.URL_LIFETIME));
  }

  record UploadRequest(Long orgId, String name, String contentType, Long sizeBytes) {}

  record UploadResponse(String id, String uploadUrl, String expiresAt) {}

  record UrlResponse(String url, String expiresAt) {}
}
