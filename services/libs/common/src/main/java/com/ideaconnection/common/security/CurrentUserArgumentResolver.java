package com.ideaconnection.common.security;

import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    return CurrentUser.class.equals(parameter.getParameterType());
  }

  @Override
  public CurrentUser resolveArgument(
      MethodParameter parameter,
      ModelAndViewContainer mavContainer,
      NativeWebRequest webRequest,
      WebDataBinderFactory binderFactory) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (!(authentication instanceof JwtAuthenticationToken token)) {
      throw new IllegalStateException("로그인 토큰이 필요한 경로에서만 CurrentUser를 받을 수 있다");
    }
    return new CurrentUser(
        token.getToken().getSubject(),
        blankToNull(token.getToken().getClaimAsString("email")),
        displayName(token));
  }

  // Google로 가입한 사람은 Keycloak이 Google 전체 이름(김준형)을 display_name으로 준다.
  // name은 Keycloak이 '이름 성' 순서로 합쳐 한국어 이름이 뒤집히므로(준형 김) display_name을 먼저 쓴다
  private static String displayName(JwtAuthenticationToken token) {
    String displayName = blankToNull(token.getToken().getClaimAsString("display_name"));
    return (displayName != null)
        ? displayName
        : blankToNull(token.getToken().getClaimAsString("name"));
  }

  private static String blankToNull(String value) {
    return StringUtils.hasText(value) ? value : null;
  }
}
