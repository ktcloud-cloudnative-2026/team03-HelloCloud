package com.ideaconnection.common.test;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/** 테스트에서 Keycloak 없이 서명된 로그인 토큰을 만든다. */
public final class TestTokens {

  private static final KeyPair KEY = newKeyPair();
  private static final KeyPair OTHER_KEY = newKeyPair();

  private TestTokens() {}

  public static String bearer(String sub, Map<String, Object> claims) {
    return "Bearer " + sign(KEY, sub, claims, Instant.now().plus(Duration.ofMinutes(5)));
  }

  public static String expiredBearer(String sub) {
    // 검증기의 기본 허용 오차 60초보다 충분히 지난 시각이어야 만료로 처리된다.
    return "Bearer " + sign(KEY, sub, Map.of(), Instant.now().minus(Duration.ofMinutes(5)));
  }

  public static String wrongKeyBearer(String sub) {
    return "Bearer " + sign(OTHER_KEY, sub, Map.of(), Instant.now().plus(Duration.ofMinutes(5)));
  }

  public static JwtDecoder jwtDecoder() {
    return NimbusJwtDecoder.withPublicKey((RSAPublicKey) KEY.getPublic()).build();
  }

  private static String sign(KeyPair key, String sub, Map<String, Object> claims, Instant expiry) {
    JWTClaimsSet.Builder builder =
        new JWTClaimsSet.Builder().subject(sub).expirationTime(Date.from(expiry));
    claims.forEach(builder::claim);
    SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), builder.build());
    try {
      jwt.sign(new RSASSASigner(key.getPrivate()));
    } catch (JOSEException e) {
      throw new IllegalStateException(e);
    }
    return jwt.serialize();
  }

  private static KeyPair newKeyPair() {
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      return generator.generateKeyPair();
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
