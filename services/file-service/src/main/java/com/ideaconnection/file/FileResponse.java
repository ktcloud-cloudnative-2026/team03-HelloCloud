package com.ideaconnection.file;

import com.ideaconnection.common.web.ApiTime;

record FileResponse(
    String id,
    String orgId,
    String name,
    String contentType,
    long sizeBytes,
    String uploadedBy,
    String createdAt,
    String completedAt) {
  static FileResponse from(FileRecord file) {
    return new FileResponse(
        file.id.toString(),
        file.orgId.toString(),
        file.name,
        file.contentType,
        file.sizeBytes,
        file.uploadedBy,
        ApiTime.format(file.createdAt),
        file.completedAt == null ? null : ApiTime.format(file.completedAt));
  }
}
