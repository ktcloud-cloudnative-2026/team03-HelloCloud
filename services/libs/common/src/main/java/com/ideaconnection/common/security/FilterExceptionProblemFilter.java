package com.ideaconnection.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

/** 보안 필터에서 난 예외를 컨트롤러 에러와 같은 형식으로 응답하게 넘긴다. 그대로 두면 Tomcat의 /error 요청이 토큰 검사에 걸려 장애가 401로 바뀐다. */
public class FilterExceptionProblemFilter extends OncePerRequestFilter {

  private final HandlerExceptionResolver resolver;

  public FilterExceptionProblemFilter(HandlerExceptionResolver resolver) {
    this.resolver = resolver;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    try {
      filterChain.doFilter(request, response);
    } catch (RuntimeException e) {
      if (response.isCommitted()) {
        throw e;
      }
      resolver.resolveException(request, response, null, e);
    }
  }
}
