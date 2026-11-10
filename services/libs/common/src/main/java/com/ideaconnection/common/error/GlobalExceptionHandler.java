package com.ideaconnection.common.error;

import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.jwt.JwtDecoderInitializationException;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
  private static final String CODE = "code";
  private static final String INTERNAL_ERROR_DETAIL = "서버 오류가 발생했습니다.";
  private static final URI BLANK_TYPE = URI.create("about:blank");

  @ExceptionHandler(ApiException.class)
  ProblemDetail handleApi(ApiException e) {
    return complete(ProblemDetail.forStatusAndDetail(e.getStatus(), e.getMessage()), e.getCode());
  }

  @ExceptionHandler(AuthenticationException.class)
  ProblemDetail handleAuthentication(AuthenticationException e) {
    return problem(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
  }

  @ExceptionHandler(AccessDeniedException.class)
  ProblemDetail handleAccessDenied(AccessDeniedException e) {
    return problem(HttpStatus.FORBIDDEN, "권한이 없습니다.");
  }

  @ExceptionHandler({AuthenticationServiceException.class, JwtDecoderInitializationException.class})
  ProblemDetail handleAuthServerFailure(Exception e) {
    log.error("로그인 서버를 사용할 수 없습니다", e);
    return problem(HttpStatus.SERVICE_UNAVAILABLE, "로그인 서버를 사용할 수 없습니다.");
  }

  @ExceptionHandler(RequestRejectedException.class)
  ProblemDetail handleRejected(RequestRejectedException e) {
    return problem(HttpStatus.BAD_REQUEST, "잘못된 요청입니다.");
  }

  @ExceptionHandler(Exception.class)
  ProblemDetail handleUnexpected(Exception e) {
    log.error("처리하지 못한 오류", e);
    return problem(HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_ERROR_DETAIL);
  }

  @Override
  protected ResponseEntity<Object> handleExceptionInternal(
      Exception ex,
      Object body,
      HttpHeaders headers,
      HttpStatusCode statusCode,
      WebRequest request) {
    ResponseEntity<Object> response =
        super.handleExceptionInternal(ex, body, headers, statusCode, request);
    if (statusCode.is5xxServerError()) {
      log.error("처리하지 못한 오류", ex);
    }
    if (response != null && response.getBody() instanceof ProblemDetail problem) {
      if (statusCode.value() == HttpStatus.INTERNAL_SERVER_ERROR.value()) {
        problem.setDetail(INTERNAL_ERROR_DETAIL);
      }
      complete(problem, HttpStatus.valueOf(statusCode.value()).name());
    }
    return response;
  }

  private ProblemDetail problem(HttpStatus status, String detail) {
    return complete(ProblemDetail.forStatusAndDetail(status, detail), status.name());
  }

  // Spring은 기본 type을 응답에서 생략하지만 팀 에러 형식에는 항상 있어야 한다.
  private ProblemDetail complete(ProblemDetail problem, String code) {
    problem.setType(BLANK_TYPE);
    problem.setProperty(CODE, code);
    return problem;
  }
}
