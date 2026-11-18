package com.ideaconnection.file;

import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.common.web.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/files")
class FileController {
  private final FileService files;

  FileController(FileService files) {
    this.files = files;
  }

  @GetMapping
  PageResponse<FileResponse> list(
      CurrentUser user,
      @RequestParam Long orgId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      HttpServletRequest request) {
    return files.list(
        orgId, user.id(), token(request), requestId(request), PageQuery.of(page, size));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  FileService.UploadResponse initiate(
      CurrentUser user, @RequestBody FileService.UploadRequest body, HttpServletRequest request) {
    return files.initiate(body, user.id(), token(request), requestId(request));
  }

  @PostMapping("/{id}/complete")
  FileResponse complete(CurrentUser user, @PathVariable Long id, HttpServletRequest request) {
    return files.complete(id, user.id(), token(request), requestId(request));
  }

  @GetMapping("/{id}/download-url")
  FileService.UrlResponse download(
      CurrentUser user, @PathVariable Long id, HttpServletRequest request) {
    return files.readUrl(id, user.id(), token(request), requestId(request), false);
  }

  @GetMapping("/{id}/preview-url")
  FileService.UrlResponse preview(
      CurrentUser user, @PathVariable Long id, HttpServletRequest request) {
    return files.readUrl(id, user.id(), token(request), requestId(request), true);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(CurrentUser user, @PathVariable Long id, HttpServletRequest request) {
    files.delete(id, user.id(), token(request), requestId(request));
  }

  private String token(HttpServletRequest request) {
    return request.getHeader("Authorization");
  }

  private String requestId(HttpServletRequest request) {
    return org.slf4j.MDC.get(com.ideaconnection.common.web.RequestIdFilter.MDC_KEY);
  }
}
