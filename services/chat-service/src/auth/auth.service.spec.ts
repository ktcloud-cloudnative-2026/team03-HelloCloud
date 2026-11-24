import { parseAllowedClients } from './auth.service';

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
