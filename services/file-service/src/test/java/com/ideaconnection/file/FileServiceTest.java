package com.ideaconnection.file;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.web.PageQuery;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;

class FileServiceTest {
  FileRepository files = mock(FileRepository.class);
  MembershipClient memberships = mock(MembershipClient.class);
  ObjectStorage storage = mock(ObjectStorage.class);
  FileService service = new FileService(files, memberships, storage);
  FileRecord file;

  @BeforeEach
  void setup() {
    file = new FileRecord(1L, "test.pdf", "application/pdf", 42, "orgs/1/key", "u1");
    file.id = 5L;
    file.createdAt = Instant.now();
    when(files.findById(5L)).thenReturn(Optional.of(file));
    when(files.findForUpdate(5L)).thenReturn(Optional.of(file));
    when(memberships.requireMember(anyLong(), anyString(), anyString(), any()))
        .thenReturn("MEMBER");
  }

  @Test
  void listFiltersCompletedAndUsesStringIds() {
    file.status = "COMPLETED";
    file.completedAt = Instant.now();
    when(files.findByOrgIdAndStatus(eq(1L), eq("COMPLETED"), any(Pageable.class)))
        .thenReturn(new PageImpl<>(java.util.List.of(file)));
    var response = service.list(1L, "u1", "Bearer token", "trace", PageQuery.of(0, 20));
    assertThat(response.items().get(0).id()).isEqualTo("5");
    assertThat(response.items().get(0).orgId()).isEqualTo("1");
    verify(memberships).requireMember(1L, "u1", "Bearer token", "trace");
  }

  @Test
  void initiateStoresPendingWithGeneratedKey() {
    when(files.saveAndFlush(any()))
        .thenAnswer(
            call -> {
              FileRecord value = call.getArgument(0);
              value.id = 6L;
              return value;
            });
    when(storage.uploadUrl(any())).thenReturn("https://s3/upload");
    var response =
        service.initiate(
            new FileService.UploadRequest(1L, "test.pdf", "application/pdf", 42L),
            "u1",
            "Bearer token",
            null);
    assertThat(response.id()).isEqualTo("6");
    verify(files)
        .saveAndFlush(
            argThat(
                value ->
                    value.status.equals("UPLOADING")
                        && value.storageKey.startsWith("orgs/1/")
                        && !value.storageKey.contains("test.pdf")));
  }

  @Test
  void rejectsOversizeBeforeStoring() {
    assertCode(
        () ->
            service.initiate(
                new FileService.UploadRequest(1L, "x", "text/plain", 100_000_001L),
                "u1",
                "Bearer token",
                null),
        "FILE_TOO_LARGE");
    verifyNoInteractions(storage);
    verify(files, never()).saveAndFlush(any());
  }

  @Test
  void acceptsExactSizeLimit() {
    when(files.saveAndFlush(any()))
        .thenAnswer(
            call -> {
              FileRecord value = call.getArgument(0);
              value.id = 6L;
              return value;
            });
    service.initiate(
        new FileService.UploadRequest(1L, "x", "text/plain", 100_000_000L),
        "u1",
        "Bearer token",
        null);
    verify(storage).uploadUrl(any());
  }

  @Test
  void rejectsInvalidMetadata() {
    for (String name : java.util.List.of("", "a\nb", "a".repeat(256))) {
      assertCode(
          () ->
              service.initiate(
                  new FileService.UploadRequest(1L, name, "text/plain", 1L),
                  "u1",
                  "Bearer token",
                  null),
          "BAD_REQUEST");
    }
    assertCode(
        () ->
            service.initiate(
                new FileService.UploadRequest(1L, "x", "text/plain\r\nx:y", 1L),
                "u1",
                "Bearer token",
                null),
        "BAD_REQUEST");
  }

  @Test
  void completeChecksObjectSizeAndIsIdempotent() {
    when(storage.size(file.storageKey)).thenReturn(42L);
    service.complete(5L, "u1", "Bearer token", null);
    assertThat(file.status).isEqualTo("COMPLETED");
    assertThat(file.completedAt).isNotNull();
    service.complete(5L, "u1", "Bearer token", null);
    verify(storage, times(1)).size(file.storageKey);
  }

  @Test
  void wrongSizeRemainsPending() {
    when(storage.size(file.storageKey)).thenReturn(1L);
    assertCode(() -> service.complete(5L, "u1", "Bearer token", null), "UPLOAD_SIZE_MISMATCH");
    assertThat(file.status).isEqualTo("UPLOADING");
  }

  @Test
  void missingUploadRemainsPending() {
    when(storage.size(file.storageKey))
        .thenThrow(new ApiException(HttpStatus.CONFLICT, "UPLOAD_NOT_FOUND", "missing"));
    assertCode(() -> service.complete(5L, "u1", "Bearer token", null), "UPLOAD_NOT_FOUND");
    assertThat(file.status).isEqualTo("UPLOADING");
  }

  @Test
  void onlyUploaderCanComplete() {
    assertCode(() -> service.complete(5L, "other", "Bearer token", null), "FORBIDDEN");
    verifyNoInteractions(storage);
  }

  @Test
  void pendingCannotBeDownloaded() {
    assertCode(() -> service.readUrl(5L, "u1", "Bearer token", null, false), "FILE_NOT_READY");
    verifyNoInteractions(storage);
  }

  @Test
  void nonMemberCannotAccessOrDelete() {
    when(memberships.requireMember(anyLong(), anyString(), anyString(), any()))
        .thenThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "not member"));
    assertCode(() -> service.readUrl(5L, "u1", "Bearer token", null, false), "FORBIDDEN");
    assertCode(() -> service.delete(5L, "u1", "Bearer token", null), "FORBIDDEN");
    verifyNoInteractions(storage);
  }

  @Test
  void memberCannotDeleteOthersFile() {
    assertCode(() -> service.delete(5L, "other", "Bearer token", null), "FORBIDDEN");
    verifyNoInteractions(storage);
  }

  @Test
  void ownerCanDeleteOthersFile() {
    when(memberships.requireMember(1L, "owner", "Bearer token", null)).thenReturn("OWNER");
    service.delete(5L, "owner", "Bearer token", null);
    var order = inOrder(storage, files);
    order.verify(storage).delete(file.storageKey);
    order.verify(files).delete(file);
  }

  @Test
  void storageFailureDoesNotDeleteMetadata() {
    doThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", "unavailable"))
        .when(storage)
        .delete(any());
    assertCode(() -> service.delete(5L, "u1", "Bearer token", null), "STORAGE_UNAVAILABLE");
    verify(files, never()).delete(any());
  }

  @Test
  void rejectsActiveContentPreviewButAllowsDownload() {
    file.status = "COMPLETED";
    file.contentType = "image/svg+xml";
    assertCode(
        () -> service.readUrl(5L, "u1", "Bearer token", null, true), "PREVIEW_NOT_SUPPORTED");
    service.readUrl(5L, "u1", "Bearer token", null, false);
    verify(storage).readUrl(file, false);
  }

  @Test
  void pdfCanBePreviewed() {
    file.status = "COMPLETED";
    service.readUrl(5L, "u1", "Bearer token", null, true);
    verify(storage).readUrl(file, true);
  }

  private void assertCode(Runnable action, String code) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo(code));
  }
}
