package com.ideaconnection.file;

import static org.assertj.core.api.Assertions.*;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class S3ObjectStorageTest {
  @Test
  void signsBrowserEndpointWithPathStyleAndFiveMinuteExpiry() {
    try (var storage =
        new S3ObjectStorage(
            URI.create("http://internal:8333"),
            URI.create("https://files.example.test"),
            "us-east-1",
            "chat-attachments",
            "test-key",
            "test-secret")) {
      var file = new FileRecord(1L, "기획서.pdf", "application/pdf", 42L, "orgs/1/test", "u1");
      var upload = URI.create(storage.uploadUrl(file));
      assertThat(upload.getHost()).isEqualTo("files.example.test");
      assertThat(upload.getPath()).isEqualTo("/chat-attachments/orgs/1/test");
      String query = URLDecoder.decode(upload.getRawQuery(), StandardCharsets.UTF_8);
      assertThat(query).contains("X-Amz-Expires=300", "X-Amz-Signature=", "content-length");
      var download = URLDecoder.decode(storage.readUrl(file, false), StandardCharsets.UTF_8);
      var preview = URLDecoder.decode(storage.readUrl(file, true), StandardCharsets.UTF_8);
      assertThat(download)
          .contains(
              "response-content-disposition=attachment", "response-content-type=application/pdf");
      assertThat(preview).contains("response-content-disposition=inline");
    }
  }
}
