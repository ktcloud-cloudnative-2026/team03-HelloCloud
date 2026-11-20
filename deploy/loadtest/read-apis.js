// dev 부하 테스트 (#146): 로그인한 사용자가 화면을 열 때 부르는 읽기 API 3개를 반복한다.
// 클러스터에서는 job.yaml이 실행한다. 비밀번호는 Secret에서 환경 변수로만 받는다.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://10.10.24.101';
const REALM = __ENV.KC_REALM || 'hellocloud';
const CLIENT_ID = __ENV.KC_CLIENT_ID || 'k6-loadtest';
const USERNAME = __ENV.K6_USERNAME;
const PASSWORD = __ENV.K6_PASSWORD;
// 클라이언트를 confidential로 만들면 비밀값도 같이 보내야 토큰이 나온다. public이면 비워 둔다
const CLIENT_SECRET = __ENV.K6_CLIENT_SECRET;
const VUS = Number(__ENV.VUS || 10);
const SMOKE = __ENV.MODE === 'smoke';

const TOKEN_URL = `${BASE_URL}/realms/${REALM}/protocol/openid-connect/token`;

// 워밍업과 마무리 구간은 파드가 막 데워지거나 사용자가 줄어드는 중이라 숫자가 흔들린다.
// 합격 판정은 사용자 수가 일정한 load 구간만 본다.
const fullScenarios = {
  warmup: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '2m', target: VUS }] },
  load: { executor: 'constant-vus', vus: VUS, duration: '5m', startTime: '2m' },
  rampdown: { executor: 'ramping-vus', startVUs: VUS, stages: [{ duration: '1m', target: 0 }], startTime: '7m' },
};

// 본 실행 전에 토큰 · 주소가 맞는지 30초만 확인한다.
const smokeScenarios = {
  load: { executor: 'constant-vus', vus: 1, duration: '30s' },
};

export const options = {
  scenarios: SMOKE ? smokeScenarios : fullScenarios,
  thresholds: {
    'http_req_duration{scenario:load,type:api}': ['p(95)<500'],
    'http_req_failed{scenario:load,type:api}': ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

function login() {
  const form = { grant_type: 'password', client_id: CLIENT_ID, username: USERNAME, password: PASSWORD };
  if (CLIENT_SECRET) {
    form.client_secret = CLIENT_SECRET;
  }
  const res = http.post(TOKEN_URL, form, { tags: { name: 'token', type: 'auth' } });
  if (res.status !== 200) {
    fail(`토큰 발급 실패: ${res.status}`);
  }
  const body = res.json();
  // 테스트 클라이언트의 토큰 수명은 15분으로 늘려 8분 시나리오 동안 다시 로그인하지 않는다.
  // 수명이 짧게 설정돼 있어도 401이 에러율에 섞이지 않게 만료 30초 전에만 다시 받는다.
  return { token: body.access_token, renewAt: Date.now() + (body.expires_in - 30) * 1000 };
}

export function setup() {
  if (!USERNAME || !PASSWORD) {
    fail('K6_USERNAME, K6_PASSWORD 환경 변수가 필요합니다');
  }
  const { token } = login();
  const res = http.get(`${BASE_URL}/api/orgs?page=0&size=20`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'setup-orgs', type: 'setup' },
  });
  const items = res.status === 200 ? res.json('items') : [];
  if (!items || items.length === 0) {
    fail(`테스트 계정이 속한 조직이 없습니다 (status ${res.status})`);
  }
  return { orgId: items[0].id };
}

// 가상 사용자(VU)마다 따로 가진다. VU 하나가 브라우저 하나라고 보면 된다.
// 로그인은 VU마다 처음 한 번만 한다. 매번 하면 user · file이 아니라 Keycloak을 재게 된다.
let session = null;

export default function (data) {
  if (!session || Date.now() > session.renewAt) {
    session = login();
  }
  const params = (name) => ({
    headers: { Authorization: `Bearer ${session.token}` },
    tags: { name, type: 'api' },
  });

  const me = http.get(`${BASE_URL}/api/users/me`, params('GET /api/users/me'));
  const orgs = http.get(`${BASE_URL}/api/orgs?page=0&size=20`, params('GET /api/orgs'));
  const files = http.get(`${BASE_URL}/api/files?orgId=${data.orgId}&page=0&size=20`, params('GET /api/files'));

  check(me, { 'me 200': (r) => r.status === 200 });
  check(orgs, { 'orgs 200': (r) => r.status === 200 });
  check(files, { 'files 200': (r) => r.status === 200 });

  // 사람이 화면을 보는 시간. 없으면 실제보다 훨씬 센 부하가 된다.
  sleep(1);
}
