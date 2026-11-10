package com.ideaconnection.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.security.web.firewall.RequestRejectedHandler;
import org.springframework.web.servlet.HandlerExceptionResolver;

/** 보안 필터에서 난 401, 403도 컨트롤러 에러와 같은 형식으로 응답하게 넘긴다. */
public class ProblemSecurityHandlers
    implements AuthenticationEntryPoint, AccessDeniedHandler, RequestRejectedHandler {

  private final HandlerExceptionResolver resolver;

  public ProblemSecurityHandlers(
      @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
    this.resolver = resolver;
  }

  @Override
  public void commence(
      HttpServletRequest request,
      HttpServletResponse response,
      AuthenticationException authException) {
    // 표준 진입점은 닫아 둔 메타데이터 주소를 헤더에 항상 넣으므로 쓰지 않는다.
    response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
    resolver.resolveException(request, response, null, authException);
  }

  @Override
  public void handle(
      HttpServletRequest request,
      HttpServletResponse response,
      AccessDeniedException accessDeniedException) {
    resolver.resolveException(request, response, null, accessDeniedException);
  }

  @Override
  public void handle(
      HttpServletRequest request,
      HttpServletResponse response,
      RequestRejectedException requestRejectedException) {
    resolver.resolveException(request, response, null, requestRejectedException);
  }
}
