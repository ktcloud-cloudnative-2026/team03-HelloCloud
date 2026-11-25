import { UnauthorizedException } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { AuthService, parseAllowedClients } from './auth.service';

describe('parseAllowedClients', () => {
  it('값이 없으면 웹 클라이언트만 허용한다', () => {
    expect([...parseAllowedClients(undefined)]).toEqual(['hellocloud-web']);
    expect([...parseAllowedClients('')]).toEqual(['hellocloud-web']);
    expect([...parseAllowedClients(' , ')]).toEqual(['hellocloud-web']);
  });

  it('쉼표로 나눈 클라이언트를 공백 없이 받는다', () => {
    const clients = parseAllowedClients(' hellocloud-web , k6-loadtest ');

    expect(clients.has('hellocloud-web')).toBe(true);
    expect(clients.has('k6-loadtest')).toBe(true);
    expect(clients.size).toBe(2);
  });

  it('목록에 없는 클라이언트는 허용하지 않는다', () => {
    const clients = parseAllowedClients('hellocloud-web');

    expect(clients.has('k6-loadtest')).toBe(false);
  });
});

describe('AuthService.verifyToken', () => {
  const issuer = 'https://test.example.com/realms/hellocloud';
  const originalEnv = { ...process.env };

  let server: Server;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let jwksUri: string;

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;

    const jwk = await exportJWK(keys.publicKey);

    server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }],
      }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address() as AddressInfo;
    jwksUri = `http://127.0.0.1:${address.port}/jwks`;
  });

  beforeEach(() => {
    process.env.OIDC_ISSUER_URI = issuer;
    process.env.OIDC_JWKS_URI = jwksUri;
    delete process.env.OIDC_ALLOWED_CLIENTS;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  async function createToken(
    azp?: string,
    tokenIssuer = issuer,
    expiration = '5m',
  ) {
    return new SignJWT(azp === undefined ? {} : { azp })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(tokenIssuer)
      .setSubject('test-user')
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(privateKey);
  }

  it('기본 설정에서 웹 클라이언트를 허용한다', async () => {
    const auth = new AuthService();
    const token = await createToken('hellocloud-web');

    await expect(auth.verifyToken(token)).resolves.toMatchObject({
      userId: 'test-user',
    });
  });

  it('기본 설정에서 k6-loadtest를 거부한다', async () => {
    const auth = new AuthService();
    const token = await createToken('k6-loadtest');

    await expect(auth.verifyToken(token))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('dev 설정에서 웹 클라이언트와 k6-loadtest를 허용한다', async () => {
    process.env.OIDC_ALLOWED_CLIENTS = 'hellocloud-web,k6-loadtest';
    const auth = new AuthService();

    for (const client of ['hellocloud-web', 'k6-loadtest']) {
      const token = await createToken(client);

      await expect(auth.verifyToken(token)).resolves.toMatchObject({
        userId: 'test-user',
      });
    }
  });

  it('dev 설정에서도 미등록 클라이언트를 거부한다', async () => {
    process.env.OIDC_ALLOWED_CLIENTS = 'hellocloud-web,k6-loadtest';
    const auth = new AuthService();
    const token = await createToken('unknown-client');

    await expect(auth.verifyToken(token))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('azp가 없는 토큰을 거부한다', async () => {
    const auth = new AuthService();
    const token = await createToken();

    await expect(auth.verifyToken(token))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issuer가 다른 토큰을 거부한다', async () => {
    const auth = new AuthService();
    const token = await createToken(
      'hellocloud-web',
      'https://invalid.example.com',
    );

    await expect(auth.verifyToken(token))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('만료된 토큰을 거부한다', async () => {
    const auth = new AuthService();
    const token = await createToken('hellocloud-web', issuer, '-1m');

    await expect(auth.verifyToken(token))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
