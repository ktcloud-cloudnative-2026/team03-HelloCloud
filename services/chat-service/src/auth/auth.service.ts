import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose';

type VerifiedUser = {
  userId: string;
  expiresAt: number;
  claims: JWTPayload;
};

const DEFAULT_ALLOWED_CLIENTS = ['hellocloud-web'];

/**
 * 토큰을 받아 줄 Keycloak 클라이언트(azp) 목록.
 * OIDC_ALLOWED_CLIENTS(쉼표로 구분)가 없거나 비면 웹 클라이언트만 허용한다.
 */
export function parseAllowedClients(raw: string | undefined): Set<string> {
  const clients = (raw ?? '')
    .split(',')
    .map((client) => client.trim())
    .filter((client) => client.length > 0);

  return new Set(clients.length > 0 ? clients : DEFAULT_ALLOWED_CLIENTS);
}

@Injectable()
export class AuthService {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly allowedClients: ReadonlySet<string>;

  constructor() {
    const issuer = process.env.OIDC_ISSUER_URI;

    if (!issuer) {
      throw new Error('OIDC_ISSUER_URI 환경변수가 필요합니다.');
    }

    this.issuer = issuer.replace(/\/$/, '');

    const jwksUri =
        process.env.OIDC_JWKS_URI ??
        `${this.issuer}/protocol/openid-connect/certs`;

    this.jwks = createRemoteJWKSet(new URL(jwksUri));
    this.allowedClients = parseAllowedClients(process.env.OIDC_ALLOWED_CLIENTS);
  }

  async verifyToken(token: string): Promise<VerifiedUser> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'azp'],
      });

      if (
        typeof payload.azp !== 'string' ||
        !this.allowedClients.has(payload.azp)
      ) {
        throw new Error('허용되지 않은 Keycloak 클라이언트입니다.');
      }

      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new Error('사용자 ID가 없습니다.');
      }

      return {
        userId: payload.sub,
        // requiredClaims로 exp가 있음을 확인했다
        expiresAt: (payload.exp as number) * 1000,
        claims: payload,
      };
    } catch (error) {
      console.error(
        '[JWT 검증 실패]',
        error instanceof Error ? error.name : 'UnknownError',
        error instanceof Error ? error.message : '',
      );

      throw new UnauthorizedException(
        '유효하지 않은 로그인 토큰입니다.',
      );
    }
  }
}