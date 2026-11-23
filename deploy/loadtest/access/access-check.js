// #173 권한 측정. MODE=revoke: 멤버를 제거한 뒤 user · file · chat이 몇 초 만에 403이 되는지(US-04).
// MODE=isolation: 다른 조직의 데이터를 서비스마다 불러 모두 막히는지(US-05).
// 클러스터에서는 job.yaml이 실행한다. 비밀번호는 Secret에서 환경 변수로만 받는다.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { WebSocket } from 'k6/websockets';
import { setTimeout as wait } from 'k6/timers';

const BASE_URL = __ENV.BASE_URL || 'http://10.10.24.101';
const WS_URL = __ENV.WS_URL || BASE_URL.replace(/^http/, 'ws') + '/api/chat/ws';
const REALM = __ENV.KC_REALM || 'hellocloud';
const CLIENT_ID = __ENV.KC_CLIENT_ID || 'k6-loadtest';
const MODE = __ENV.MODE || 'revoke';
const ORG_ID = __ENV.ORG_ID || '7';
const OTHER_ORG_ID = __ENV.OTHER_ORG_ID || '10';
const ROUNDS = Number(__ENV.ROUNDS || 3);
const POLL_MS = Number(__ENV.POLL_MS || 500);
// 5초 기준을 넘겨도 언제 막히는지는 알아야 해서 15초까지 기다린다
const GIVE_UP_MS = 15000;
// 측정에 필요한 채널 · 메시지 · 파일이 없을 때 만들지. 기본은 만들지 않고 멈춘다(데이터를 바꾸므로)
const CREATE_MISSING = __ENV.CREATE_MISSING === '1';

const TOKEN_URL = `${BASE_URL}/realms/${REALM}/protocol/openid-connect/token`;

if (!['revoke', 'isolation'].includes(MODE)) {
  throw new Error(`MODE는 revoke, isolation 중 하나입니다: ${MODE}`);
}

const revokeMs = new Trend('revoke_ms', true);
const wsCloseMs = new Trend('ws_close_ms', true);
const notBlocked = new Counter('isolation_not_blocked');

export const options = {
  scenarios: {
    [MODE]: { executor: 'per-vu-iterations', vus: 1, iterations: MODE === 'revoke' ? ROUNDS : 1, maxDuration: '10m' },
  },
  thresholds:
    MODE === 'revoke'
      ? {
          'revoke_ms{service:user}': ['max<5000'],
          'revoke_ms{service:file}': ['max<5000'],
          'revoke_ms{service:chat}': ['max<5000'],
        }
      : { isolation_not_blocked: ['count==0'] },
  summaryTrendStats: ['min', 'avg', 'max'],
};

function login(prefix) {
  const username = __ENV[`${prefix}_USERNAME`];
  const password = __ENV[`${prefix}_PASSWORD`];
  if (!username || !password) {
    fail(`${prefix}_USERNAME, ${prefix}_PASSWORD 환경 변수가 필요합니다`);
  }
  const res = http.post(
    TOKEN_URL,
    { grant_type: 'password', client_id: CLIENT_ID, username, password },
    { tags: { name: 'token' } },
  );
  if (res.status !== 200) {
    fail(`${prefix} 토큰 발급 실패: ${res.status}`);
  }
  return res.json('access_token');
}

function auth(token, extra) {
  return Object.assign({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, extra);
}

function getJson(token, path) {
  const res = http.get(`${BASE_URL}${path}`, auth(token, { tags: { name: path.split('?')[0] } }));
  if (res.status !== 200) {
    fail(`${path} 실패: ${res.status}`);
  }
  return res.json();
}

function inOrg(token, orgId) {
  return (getJson(token, '/api/orgs?page=0&size=100').items || []).some((o) => String(o.id) === String(orgId));
}

// 채널 하나(없으면 만든다)와 그 채널의 메시지 하나를 돌려준다
function chatTarget(token, orgId) {
  let channels = getJson(token, `/api/chat/channels?orgId=${orgId}`);
  channels = channels.items || channels;
  let channelId = channels.length ? String(channels[0].id) : null;
  if (!channelId) {
    if (!CREATE_MISSING) fail(`조직 ${orgId}에 chat 채널이 없습니다(CREATE_MISSING=1이면 만듭니다)`);
    const res = http.post(`${BASE_URL}/api/chat/channels`, JSON.stringify({ orgId, name: 'k6-access' }), auth(token));
    if (res.status !== 201) fail(`채널 생성 실패: ${res.status}`);
    channelId = String(res.json('id'));
  }
  let messages = getJson(token, `/api/chat/channels/${channelId}/messages?limit=1`);
  messages = messages.items || messages;
  let messageId = messages.length ? String(messages[0].id) : null;
  if (!messageId) {
    if (!CREATE_MISSING) fail(`조직 ${orgId} 채널에 메시지가 없습니다(CREATE_MISSING=1이면 만듭니다)`);
    const res = http.post(
      `${BASE_URL}/api/chat/channels/${channelId}/messages`,
      JSON.stringify({ clientMessageId: `k6-${Date.now()}`, text: 'k6 권한 측정용 메시지' }),
      auth(token),
    );
    if (res.status !== 201) fail(`메시지 생성 실패: ${res.status}`);
    messageId = String(res.json('id'));
  }
  return { channelId, messageId };
}

function fileTarget(token, orgId) {
  const items = getJson(token, `/api/files?orgId=${orgId}&page=0&size=1`).items || [];
  if (items.length) return String(items[0].id);
  if (!CREATE_MISSING) fail(`조직 ${orgId}에 파일이 없습니다(CREATE_MISSING=1이면 만듭니다)`);
  const body = 'k6 권한 측정용 파일';
  const start = http.post(
    `${BASE_URL}/api/files`,
    JSON.stringify({ orgId, name: 'k6-access.txt', contentType: 'text/plain', sizeBytes: body.length }),
    auth(token),
  );
  if (start.status !== 201) fail(`파일 업로드 시작 실패: ${start.status}`);
  const put = http.put(start.json('uploadUrl'), body, { headers: { 'Content-Type': 'text/plain' } });
  if (put.status !== 200) fail(`파일 올리기 실패: ${put.status}`);
  const done = http.post(`${BASE_URL}/api/files/${start.json('id')}/complete`, null, auth(token));
  if (done.status !== 200) fail(`업로드 완료 실패: ${done.status}`);
  return String(start.json('id'));
}

function invite(ownerToken, memberToken) {
  const res = http.post(`${BASE_URL}/api/orgs/${ORG_ID}/invitations`, null, auth(ownerToken));
  if (res.status !== 201) fail(`초대 링크 생성 실패: ${res.status}`);
  const inviteToken = res.json('inviteUrl').split('/').pop();
  const accept = http.post(`${BASE_URL}/api/invitations/${inviteToken}/accept`, null, auth(memberToken));
  if (accept.status !== 200) fail(`초대 수락 실패: ${accept.status}`);
}

export function setup() {
  if (MODE === 'revoke') {
    const owner = login('OWNER');
    const member = login('MEMBER');
    const memberId = getJson(member, '/api/users/me').id;
    if (!inOrg(owner, ORG_ID)) fail(`OWNER 계정이 조직 ${ORG_ID}에 없습니다`);
    if (!inOrg(member, ORG_ID)) invite(owner, member);
    return { owner, member, memberId, channelId: chatTarget(owner, ORG_ID).channelId };
  }
  const owner = login('OWNER');
  const other = login('OTHER');
  return {
    sides: [
      { name: `조직 ${ORG_ID} → ${OTHER_ORG_ID}`, token: owner, orgId: OTHER_ORG_ID, fileId: fileTarget(other, OTHER_ORG_ID), ...chatTarget(other, OTHER_ORG_ID) },
      { name: `조직 ${OTHER_ORG_ID} → ${ORG_ID}`, token: other, orgId: ORG_ID, fileId: fileTarget(owner, ORG_ID), ...chatTarget(owner, ORG_ID) },
    ],
  };
}

// 멤버 연결을 열고 채널을 구독한다. 닫힌 시각은 state에 남긴다
function openSocket(token, channelId, state) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => reject(new Error('WebSocket 구독 시간 초과')), 5000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'AUTH_REQUIRED') ws.send(JSON.stringify({ type: 'AUTH', token }));
      if (msg.type === 'AUTH_OK') ws.send(JSON.stringify({ type: 'SUBSCRIBE', channelId }));
      if (msg.type === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve(ws);
      }
    };
    ws.onclose = (e) => {
      state.closedAt = Date.now();
      state.reason = e && e.reason;
    };
    ws.onerror = (e) => reject(new Error(`WebSocket 오류: ${e && e.error}`));
  });
}

async function pollOnce(token, channelId) {
  const req = (path) => http.asyncRequest('GET', `${BASE_URL}${path}`, null, auth(token, { tags: { name: path.split('?')[0] } }));
  const [user, file, chat] = await Promise.all([
    req(`/api/orgs/${ORG_ID}/members?page=0&size=1`),
    req(`/api/files?orgId=${ORG_ID}&page=0&size=1`),
    req(`/api/chat/channels/${channelId}/messages?limit=1`),
  ]);
  return { user: user.status, file: file.status, chat: chat.status };
}

async function revokeRound(data) {
  if (!inOrg(data.member, ORG_ID)) invite(data.owner, data.member);
  const socket = {};
  const ws = await openSocket(data.member, data.channelId, socket);

  const before = await pollOnce(data.member, data.channelId);
  if (!check(before, { '제거 전 user · file · chat 200': (s) => s.user === 200 && s.file === 200 && s.chat === 200 })) {
    fail(`제거 전에 이미 막혀 있습니다: ${JSON.stringify(before)}`);
  }

  const del = http.del(`${BASE_URL}/api/orgs/${ORG_ID}/members/${data.memberId}`, null, auth(data.owner));
  if (del.status !== 204) fail(`멤버 제거 실패: ${del.status}`);
  const t0 = Date.now();

  const firstDenied = {};
  while (Object.keys(firstDenied).length < 3 && Date.now() - t0 < GIVE_UP_MS) {
    const s = await pollOnce(data.member, data.channelId);
    for (const svc of ['user', 'file', 'chat']) {
      if (s[svc] === 403 && firstDenied[svc] === undefined) firstDenied[svc] = Date.now() - t0;
    }
    await new Promise((r) => wait(r, POLL_MS));
  }
  while (socket.closedAt === undefined && Date.now() - t0 < GIVE_UP_MS) {
    await new Promise((r) => wait(r, 100));
  }

  // 한 번 막힌 뒤 다시 열리지 않는지(소속 기억이 되살아나지 않는지)
  const after = await pollOnce(data.member, data.channelId);
  check(after, { '제거 후 계속 403': (s) => s.user === 403 && s.file === 403 && s.chat === 403 });

  for (const svc of ['user', 'file', 'chat']) {
    // 15초 안에 안 막히면 15초로 적어 기준(5초)을 넘긴 것으로 남긴다
    revokeMs.add(firstDenied[svc] === undefined ? GIVE_UP_MS : firstDenied[svc], { service: svc });
  }
  const wsMs = socket.closedAt === undefined ? null : socket.closedAt - t0;
  if (wsMs !== null) wsCloseMs.add(wsMs);
  console.log(
    `회차 ${__ITER + 1}: user ${firstDenied.user ?? '15초 넘음'}ms · file ${firstDenied.file ?? '15초 넘음'}ms · ` +
      `chat ${firstDenied.chat ?? '15초 넘음'}ms · WebSocket 닫힘 ${wsMs ?? '안 닫힘'}ms (${socket.reason || '-'})`,
  );
  if (socket.closedAt === undefined) ws.close();
  sleep(1);
}

// 403 · 404면 데이터가 나가지 않으므로 막힌 것으로 본다(#173). 400 · 401 · 5xx는 다른 문제라 실패로 남긴다
const blocked = (r) => r.status === 403 || r.status === 404;

function isolationSide(side) {
  const t = side.token;
  const calls = [
    ['user', 'GET', `/api/orgs/${side.orgId}/members?page=0&size=1`],
    ['file', 'GET', `/api/files?orgId=${side.orgId}&page=0&size=1`],
    ['file', 'GET', `/api/files/${side.fileId}/download-url`],
    ['file', 'GET', `/api/files/${side.fileId}/preview-url`],
    ['chat', 'GET', `/api/chat/channels?orgId=${side.orgId}`],
    ['chat', 'GET', `/api/chat/channels/${side.channelId}/messages?limit=1`],
    ['chat', 'POST', `/api/chat/channels/${side.channelId}/messages`, { clientMessageId: `k6-x-${Date.now()}`, text: '다른 조직에서 보낸 메시지' }],
    ['chat', 'GET', `/api/chat/decisions?orgId=${side.orgId}`],
    // 막히지 않으면 남의 파일이 지워지므로 맨 마지막에 부른다
    ['file', 'DELETE', `/api/files/${side.fileId}`],
  ];
  for (const [svc, method, path, body] of calls) {
    const res = http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, auth(t, { tags: { name: `${method} ${path.split('?')[0]}` } }));
    const ok = check(res, { [`${side.name} ${method} ${path.split('?')[0]} 막힘(403/404)`]: blocked });
    if (!ok) notBlocked.add(1, { service: svc });
    console.log(`${side.name} | ${svc} | ${method} ${path} → ${res.status}${ok ? '' : '  ← 막히지 않음'}`);
  }
}

export default async function (data) {
  if (MODE === 'revoke') {
    await revokeRound(data);
    return;
  }
  for (const side of data.sides) isolationSide(side);
}
