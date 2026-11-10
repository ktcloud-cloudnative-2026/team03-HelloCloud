package com.ideaconnection.common.security;

/** 로그인 토큰에서 꺼낸 사용자. {@code email}과 {@code name}은 토큰에 없으면 null이다. */
public record CurrentUser(String id, String email, String name) {}
