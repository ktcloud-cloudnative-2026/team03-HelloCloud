package com.ideaconnection.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

public class RequestIdFilter extends OncePerRequestFilter implements Ordered {

  public static final String HEADER = "X-Request-Id";
  public static final String MDC_KEY = "request_id";

  // 외부에서 온 값이 로그에 그대로 들어가므로 줄바꿈 같은 문자를 막는다.
  private static final Pattern VALID_ID = Pattern.compile("[A-Za-z0-9._-]{1,128}");

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String requestId = resolve(request.getHeader(HEADER));
    MDC.put(MDC_KEY, requestId);
    response.setHeader(HEADER, requestId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      MDC.remove(MDC_KEY);
    }
  }

  private String resolve(String candidate) {
    if (candidate != null && VALID_ID.matcher(candidate).matches()) {
      return candidate;
    }
    return UUID.randomUUID().toString();
  }

  @Override
  public int getOrder() {
    return Ordered.HIGHEST_PRECEDENCE;
  }
}
