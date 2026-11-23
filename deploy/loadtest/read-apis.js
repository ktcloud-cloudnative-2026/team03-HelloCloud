// dev 부하 테스트 (#146): 로그인한 사용자가 화면을 열 때 부르는 읽기 API 3개를 반복한다.
// 클러스터에서는 job.yaml이 실행한다. 비밀번호는 Secret에서 환경 변수로만 받는다.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://10.10.24.101';
const REALM = __ENV.KC_REALM || 'hellocloud';
const CLIENT_ID = __ENV.KC_CLIENT_ID || 'k6-loadtest';
const USERNAME = __ENV.K6_USERNAME;
const PASSWORD = __ENV.K6_PASSWORD;
// 클라이언트를 confidential로 만들면 비밀값도 같이 보내야 토큰이 나온다. public이면 비워 둔다
const CLIENT_SECRET = __ENV.K6_CLIENT_SECRET;
const VUS = Number(__ENV.VUS || 10);
const MODE = __ENV.MODE || 'full';
// 테스트 조직을 정해 두면 그 조직의 파일 목록을 부른다. 비우면 계정이 속한 첫 조직을 쓴다
const ORG_ID = __ENV.ORG_ID;
// 한 번 돌고 쉬는 시간(초). 사람이 화면을 보는 시간이라 기본 1초. 줄이면 같은 사람 수로 더 센 부하가 된다(#146 병목 찾기 B)
const THINK_SECONDS = Number(__ENV.THINK_SECONDS ?? 1);
if (!(THINK_SECONDS >= 0)) {
  throw new Error(`THINK_SECONDS는 0 이상의 숫자입니다: ${__ENV.THINK_SECONDS}`);
}

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

// 병목 찾기: 사람 수를 계단처럼 올리며 p95가 꺾여 오르거나 에러가 생기는 칸을 찾는다.
// 그 칸의 사람 수가 본 실행(MODE=full)의 VUS가 된다
const STEPS = (__ENV.STEPS || '10,30,50,100,200').split(',').map(Number);
const STEP_SECONDS = Number(__ENV.STEP_SECONDS || 120);
// 새 가상 사용자가 한꺼번에 로그인하면 Keycloak CPU가 튄다. 30초에 걸쳐 나눠서 늘린다
const RISE_SECONDS = 30;
const stepScenarios = {
  step: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: STEPS.flatMap((target) => [
      { duration: `${RISE_SECONDS}s`, target },
      { duration: `${STEP_SECONDS - RISE_SECONDS}s`, target },
    ]).concat([{ duration: '30s', target: 0 }]),
  },
};

// 칸마다 따로 p95와 에러율이 요약에 나오게 한다. 에러가 5%를 넘는 칸이 생기면 dev를 지키려고 바로 멈춘다
function stepThresholds() {
  const t = {};
  for (const target of STEPS) {
    t[`http_req_duration{scenario:step,type:api,step:${target}}`] = ['p(95)<500'];
    t[`http_req_failed{scenario:step,type:api,step:${target}}`] = [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
    ];
  }
  return t;
}

const loadThresholds = {
  'http_req_duration{scenario:load,type:api}': ['p(95)<500'],
  'http_req_failed{scenario:load,type:api}': ['rate<0.01'],
};

const scenariosByMode = { smoke: smokeScenarios, full: fullScenarios, step: stepScenarios };
if (!scenariosByMode[MODE]) {
  throw new Error(`MODE는 smoke, full, step 중 하나입니다: ${MODE}`);
}

export const options = {
  scenarios: scenariosByMode[MODE],
  thresholds: MODE === 'step' ? stepThresholds() : loadThresholds,
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

// 지금 몇 번째 칸인지. 칸이 바뀌는 처음 30초(사람이 늘어나는 중)도 그 칸으로 센다
function currentStep() {
  if (MODE !== 'step') {
    return undefined;
  }
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  const index = Math.floor(elapsed / STEP_SECONDS);
  // 마지막 칸 뒤 사람이 줄어드는 30초는 따로 센다. 섞이면 마지막 칸 성적이 흐려진다
  if (index >= STEPS.length) {
    return 'down';
  }
  return String(STEPS[index]);
}

// Grafana에서 칸마다 시간 범위를 맞추려고, 칸이 바뀔 때 시각을 한 줄 남긴다(가상 사용자 1번만)
let lastLoggedStep = null;
function logStepStart(step) {
  if (step === undefined || step === lastLoggedStep || exec.vu.idInTest !== 1) {
    return;
  }
  lastLoggedStep = step;
  const position = step === 'down' ? STEPS.length : STEPS.indexOf(Number(step));
  const planned = new Date(exec.scenario.startTime + position * STEP_SECONDS * 1000);
  // Grafana는 브라우저 시간(한국)으로 보여서 한국 시각으로 찍는다
  const kst = new Date(planned.getTime() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');
  const label = step === 'down' ? '줄이기' : `${step}명`;
  console.log(`step ${label} 시작 ${kst}`);
}

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
  if (ORG_ID && !items.some((o) => String(o.id) === String(ORG_ID))) {
    fail(`테스트 계정이 조직 ${ORG_ID}에 속해 있지 않습니다`);
  }
  return { orgId: ORG_ID || items[0].id };
}

// 가상 사용자(VU)마다 따로 가진다. VU 하나가 브라우저 하나라고 보면 된다.
// 로그인은 VU마다 처음 한 번만 한다. 매번 하면 user · file이 아니라 Keycloak을 재게 된다.
let session = null;

export default function (data) {
  if (!session || Date.now() > session.renewAt) {
    session = login();
  }
  const step = currentStep();
  logStepStart(step);
  const params = (name) => ({
    headers: { Authorization: `Bearer ${session.token}` },
    tags: step ? { name, type: 'api', step } : { name, type: 'api' },
  });

  const me = http.get(`${BASE_URL}/api/users/me`, params('GET /api/users/me'));
  const orgs = http.get(`${BASE_URL}/api/orgs?page=0&size=20`, params('GET /api/orgs'));
  const files = http.get(`${BASE_URL}/api/files?orgId=${data.orgId}&page=0&size=20`, params('GET /api/files'));

  check(me, { 'me 200': (r) => r.status === 200 });
  check(orgs, { 'orgs 200': (r) => r.status === 200 });
  check(files, { 'files 200': (r) => r.status === 200 });

  // 사람이 화면을 보는 시간. 없으면 실제보다 훨씬 센 부하가 된다.
  sleep(THINK_SECONDS);
}
