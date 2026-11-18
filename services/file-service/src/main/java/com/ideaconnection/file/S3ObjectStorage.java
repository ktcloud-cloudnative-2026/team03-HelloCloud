package com.ideaconnection.file;

import com.ideaconnection.common.error.ApiException;
import java.net.URI;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@Component
class S3ObjectStorage implements ObjectStorage, AutoCloseable {
  static final Duration URL_LIFETIME = Duration.ofMinutes(5);
  private final S3Client client;
  private final S3Presigner signer;
  private final String bucket;

  S3ObjectStorage(
      @Value("${file.s3.endpoint}") URI endpoint,
      @Value("${file.s3.public-endpoint}") URI publicEndpoint,
      @Value("${file.s3.region}") String region,
      @Value("${file.s3.bucket}") String bucket,
      @Value("${file.s3.access-key}") String accessKey,
      @Value("${file.s3.secret-key}") String secretKey) {
    var credentials =
        StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey));
    var config = S3Configuration.builder().pathStyleAccessEnabled(true).build();
    client =
        S3Client.builder()
            .endpointOverride(endpoint)
            .region(Region.of(region))
            .credentialsProvider(credentials)
            .serviceConfiguration(config)
            .httpClientBuilder(
                UrlConnectionHttpClient.builder()
                    .connectionTimeout(Duration.ofSeconds(2))
                    .socketTimeout(Duration.ofSeconds(5)))
            .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofSeconds(10)))
            .build();
    signer =
        S3Presigner.builder()
            .endpointOverride(publicEndpoint)
            .region(Region.of(region))
            .credentialsProvider(credentials)
            .serviceConfiguration(config)
            .build();
    this.bucket = bucket;
  }

  @Override
  public String uploadUrl(FileRecord file) {
    var request =
        PutObjectRequest.builder()
            .bucket(bucket)
            .key(file.storageKey)
            .contentType(file.contentType)
            .contentLength(file.sizeBytes)
            .build();
    return signer
        .presignPutObject(p -> p.signatureDuration(URL_LIFETIME).putObjectRequest(request))
        .url()
        .toString();
  }

  @Override
  public String readUrl(FileRecord file, boolean preview) {
    String disposition =
        (preview ? ContentDisposition.inline() : ContentDisposition.attachment())
            .filename(file.name, java.nio.charset.StandardCharsets.UTF_8)
            .build()
            .toString();
    var request =
        GetObjectRequest.builder()
            .bucket(bucket)
            .key(file.storageKey)
            .responseContentDisposition(disposition)
            .responseContentType(file.contentType)
            .build();
    return signer
        .presignGetObject(p -> p.signatureDuration(URL_LIFETIME).getObjectRequest(request))
        .url()
        .toString();
  }

  @Override
  public long size(String key) {
    try {
      return client.headObject(r -> r.bucket(bucket).key(key)).contentLength();
    } catch (S3Exception e) {
      if (e.statusCode() == 404)
        throw new ApiException(HttpStatus.CONFLICT, "UPLOAD_NOT_FOUND", "업로드한 파일이 없습니다.");
      throw unavailable();
    } catch (SdkException e) {
      throw unavailable();
    }
  }

  @Override
  public void delete(String key) {
    try {
      client.deleteObject(r -> r.bucket(bucket).key(key));
    } catch (SdkException e) {
      throw unavailable();
    }
  }

  private ApiException unavailable() {
    return new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", "파일 저장소를 사용할 수 없습니다.");
  }

  @Override
  public void close() {
    client.close();
    signer.close();
  }
}
