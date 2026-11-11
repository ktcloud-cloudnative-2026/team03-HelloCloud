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
        blankToNull(token.getToken().getClaimAsString("name")));
  }

  private static String blankToNull(String value) {
    return StringUtils.hasText(value) ? value : null;
  }
}
