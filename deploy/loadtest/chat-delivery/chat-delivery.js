// #240 US-06 채팅 실시간 전달 성능 측정
import http from 'k6/http';
import { fail } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { WebSocket } from 'k6/websockets';
import { setTimeout, clearTimeout } from 'k6/timers';

const BASE_URL = __ENV.BASE_URL || 'http://10.10.24.101';
const HTTP_URL = __ENV.CHAT_HTTP_URL || BASE_URL;
const WS_URL = __ENV.WS_URL ||
  BASE_URL.replace(/^http/, 'ws') + '/api/chat/ws';

const REALM = __ENV.KC_REALM || 'hellocloud';
const CLIENT_ID = __ENV.KC_CLIENT_ID || 'k6-loadtest';
const ORG_ID = __ENV.ORG_ID || '7';
const CHANNEL_ID = __ENV.CHANNEL_ID;
const COUNT = Number(__ENV.MESSAGE_COUNT || 100);
const TARGET_MS = 1000;
const TIMEOUT_MS = 10000;

const TOKEN_URL =
  `${BASE_URL}/realms/${REALM}/protocol/openid-connect/token`;

const deliveryMs = new Trend('chat_delivery_ms', true);
const e2eMs = new Trend('chat_e2e_ms', true);
const sent = new Counter('chat_sent');
const received = new Counter('chat_received');
const missing = new Counter('chat_missing');
const duplicate = new Counter('chat_duplicate');
const late = new Counter('chat_over_1s');
const invalid = new Counter('chat_invalid_timestamp');
const failed = new Counter('chat_test_failed');

export const options = {
  scenarios: {
    delivery: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    chat_sent: [`count==${COUNT}`],
    chat_received: [`count==${COUNT}`],
    chat_delivery_ms: ['max<=1000'],
    chat_missing: ['count==0'],
    chat_duplicate: ['count==0'],
    chat_over_1s: ['count==0'],
    chat_invalid_timestamp: ['count==0'],
    chat_test_failed: ['count==0'],
  },
  summaryTrendStats: [
    'min', 'avg', 'med', 'p(95)', 'p(99)', 'max',
  ],
};

function login(prefix) {
  const username = __ENV[`${prefix}_USERNAME`];
  const password = __ENV[`${prefix}_PASSWORD`];

  if (!username || !password) {
    fail(`${prefix} 인증 정보가 없습니다`);
  }

  const res = http.post(
    TOKEN_URL,
    {
      grant_type: 'password',
      client_id: CLIENT_ID,
      username,
      password,
    },
    {
      tags: { name: 'token' },
      redirects: 0,
      timeout: '10s',
    },
  );

  if (res.status !== 200) {
    fail(`${prefix} 토큰 발급 실패: ${res.status}`);
  }

  const token = res.json('access_token');

  if (!token) {
    fail(`${prefix} access token이 없습니다`);
  }

  return token;
}

function auth(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    redirects: 0,
    timeout: '10s',
  };
}

function getJson(token, path) {
  const res = http.get(
    `${BASE_URL}${path}`,
    auth(token),
  );

  if (res.status !== 200) {
    fail(`${path} 조회 실패: ${res.status}`);
  }

  return res.json();
}

function inOrg(token) {
  const orgs = getJson(
    token,
    '/api/orgs?page=0&size=100',
  );

  return (orgs.items || []).some(
    (org) => String(org.id) === ORG_ID,
  );
}

function hasChannel(token) {
  const result = getJson(
    token,
    `/api/chat/channels?orgId=${ORG_ID}`,
  );

  const channels = result?.items ?? result;

  if (!Array.isArray(channels)) {
    fail('채널 목록 응답이 배열 형식이 아닙니다');
  }

  return channels.some(
    (channel) => String(channel?.id) === CHANNEL_ID,
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function messageId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 3) | 8;
      return v.toString(16);
    });
}

export function setup() {
  if (!CHANNEL_ID) {
    fail('테스트 전용 CHANNEL_ID를 지정해야 합니다');
  }

  if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 100) {
    fail('MESSAGE_COUNT는 1~100 사이의 정수여야 합니다');
  }

  if (!__ENV.CHAT_HTTP_URL || !__ENV.WS_URL || !__ENV.SENDER_WS_URL) {
    fail('송신 HTTP 및 송신·수신 WebSocket 주소를 모두 지정해야 합니다');
  }

  const httpHost = HTTP_URL.match(/^https?:\/\/([^/]+)/)?.[1];
  const senderHost = __ENV.SENDER_WS_URL.match(/^wss?:\/\/([^/]+)/)?.[1];
  const receiverHost = WS_URL.match(/^wss?:\/\/([^/]+)/)?.[1];

  if (!httpHost || !senderHost || !receiverHost) {
    fail('HTTP 또는 WebSocket 주소 형식이 올바르지 않습니다');
  }

  if (httpHost !== senderHost) {
    fail('HTTP 전송과 송신 WebSocket은 같은 Pod를 지정해야 합니다');
  }

  if (senderHost === receiverHost) {
    fail('송신자와 수신자는 서로 다른 Pod 주소를 지정해야 합니다');
  }

  const sender = login('OWNER');
  const receiver = login('MEMBER');

  const senderUser = getJson(sender, '/api/users/me');
  const receiverUser = getJson(receiver, '/api/users/me');

  if (String(senderUser.id) === String(receiverUser.id)) {
    fail('송신자와 수신자가 동일한 계정입니다');
  }

  if (!inOrg(sender) || !inOrg(receiver)) {
    fail('두 계정 모두 테스트 조직에 속해야 합니다');
  }

  if (!hasChannel(sender) || !hasChannel(receiver)) {
    fail('테스트 채널 접근 권한을 확인하세요');
  }

  console.log(`조직: ${ORG_ID}`);
  console.log(`채널: ${CHANNEL_ID}`);
  console.log(`측정 메시지: ${COUNT}건`);
  console.log('송신자 및 수신자 인증 확인 완료');

  return {
    sender,
    receiver,
  };
}

function openSenderSocket(token) {
  const url = __ENV.SENDER_WS_URL;

  if (!url || url === WS_URL) {
    throw new Error('송신·수신 WebSocket 주소를 분리해야 합니다');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const state = { ws, closed: false, error: false };

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('송신자 WebSocket 구독 시간 초과'));
    }, TIMEOUT_MS);

    ws.onmessage = (event) => {
      let msg;

      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!msg || typeof msg !== 'object') {
        return;
      }

      if (msg.type === 'ERROR') {
        state.error = true;
        clearTimeout(timer);

        const reason =
          `송신자 WebSocket 오류: ${msg.code || 'UNKNOWN'}`;

        console.error(reason);
        reject(new Error(reason));
        ws.close();
        return;
      }

      if (msg.type === 'AUTH_REQUIRED') {
        ws.send(JSON.stringify({
          type: 'AUTH',
          token,
        }));
      }

      if (msg.type === 'AUTH_OK') {
        ws.send(JSON.stringify({
          type: 'SUBSCRIBE',
          channelId: CHANNEL_ID,
        }));
      }

      if (
        msg.type === 'SUBSCRIBED' &&
        String(msg.channelId) === CHANNEL_ID
      ) {
        clearTimeout(timer);
        console.log(`송신자 WebSocket 구독 완료: ${url}`);
        resolve(state);
      }
    };

    ws.onerror = () => {
      state.error = true;
      clearTimeout(timer);
      ws.close();
      reject(new Error('송신자 WebSocket 오류'));
    };

    ws.onclose = () => {
      state.closed = true;
      clearTimeout(timer);
      reject(new Error('송신자 WebSocket 종료'));
    };
  });
}

export default async function (data) {
  const testId = messageId();
  const expected = new Map();
  const delivered = new Map();

  let sentCount = 0;
  let duplicateCount = 0;
  let lateCount = 0;
  let invalidCount = 0;
  let errorCount = 0;
  let subscribed = false;
  let closed = false;
  let closing = false;
  let ws;
  let senderSocket;
  let startedAt = 0;

  try {
    await new Promise((resolve, reject) => {
      ws = new WebSocket(WS_URL);

      const timer = setTimeout(() => {
        reject(new Error('WebSocket 구독 시간 초과'));
      }, TIMEOUT_MS);

      ws.onmessage = (event) => {
        const receivedAt = Date.now();

        let msg;

        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (!msg || typeof msg !== 'object') {
          return;
        }

        if (msg.type === 'ERROR') {
          errorCount++;
          clearTimeout(timer);

          const reason =
            `수신자 WebSocket 오류: ${msg.code || 'UNKNOWN'}`;

          console.error(reason);
          reject(new Error(reason));
          ws.close();
          return;
        }

        if (msg.type === 'AUTH_REQUIRED') {
          ws.send(JSON.stringify({
            type: 'AUTH',
            token: data.receiver,
          }));

          return;
        }

        if (msg.type === 'AUTH_OK') {
          ws.send(JSON.stringify({
            type: 'SUBSCRIBE',
            channelId: CHANNEL_ID,
          }));

          return;
        }

        if (
          msg.type === 'SUBSCRIBED' &&
          String(msg.channelId) === CHANNEL_ID
        ) {
          subscribed = true;
          clearTimeout(timer);
          resolve();
          return;
        }

        if (
          msg.type !== 'MESSAGE_CREATED' ||
          String(msg.channelId) !== CHANNEL_ID
        ) {
          return;
        }

        const id = msg.data?.clientMessageId;

        if (!expected.has(id)) {
          return;
        }

        if (delivered.has(id)) {
          duplicateCount++;
          return;
        }

        delivered.set(id, receivedAt);

        const serverSentAt = Date.parse(msg.sentAt);
        const latency = receivedAt - serverSentAt;

        e2eMs.add(receivedAt - expected.get(id));

        if (!Number.isFinite(latency) || latency < 0) {
          invalidCount++;
          return;
        }

        deliveryMs.add(latency);

        if (latency > TARGET_MS) {
          lateCount++;
        }
      };

      ws.onerror = () => {
        errorCount++;
        clearTimeout(timer);

        if (!subscribed) {
          reject(new Error('WebSocket 연결 오류'));
        }
      };

      ws.onclose = () => {
        closed = true;
        clearTimeout(timer);

        if (!closing) {
          errorCount++;

          if (!subscribed) {
            reject(new Error('WebSocket 연결 종료'));
          }
        }
      };
    });

    console.log(`수신자 WebSocket 구독 완료: ${WS_URL}`);

    senderSocket = await openSenderSocket(data.sender);

    console.log('두 계정 WebSocket 연결 완료');
    console.log('Pod별 연결 지표 확인을 위해 60초 대기');

    await delay(60000);

    if (closed || senderSocket.closed || senderSocket.error) {
      throw new Error('측정 시작 전 WebSocket 연결 이상');
    }

    startedAt = Date.now();

    for (let i = 1; i <= COUNT; i++) {
      if (closed || senderSocket.closed || senderSocket.error) {
        throw new Error('측정 중 WebSocket 연결 이상');
      }

      const id = messageId();

      const body = JSON.stringify({
        clientMessageId: id,
        text: `[S5 TEST ${testId}] ${i}/${COUNT}`,
        attachments: [],
      });

      expected.set(id, Date.now());

      // 비동기 HTTP 요청으로 WebSocket 수신 처리를 막지 않는다.
      const res = await http.asyncRequest(
        'POST',
        `${HTTP_URL}/api/chat/channels/${CHANNEL_ID}/messages`,
        body,
        auth(data.sender),
      );

      if (res.status !== 201) {
        throw new Error(
          `${i}번째 메시지 전송 실패: HTTP ${res.status}`,
        );
      }

      sentCount++;

      if (i % 10 === 0 || i === COUNT) {
        console.log(
          `전송 ${sentCount}/${COUNT}, ` +
          `수신 ${delivered.size}/${COUNT}`,
        );
      }
    }

    const deadline = Date.now() + TIMEOUT_MS;

    while (
      delivered.size < COUNT &&
      Date.now() < deadline &&
      !closed
    ) {
      await delay(50);
    }

    // 추가 중복 수신 여부 확인
    await delay(1000);

  } catch (error) {
    errorCount++;
    console.error(`측정 오류: ${error.message}`);

  } finally {
    const unsentCount = COUNT - sentCount;
    const missingCount = Math.max(0, sentCount - delivered.size);
    const withinTarget =
      delivered.size - lateCount - invalidCount;

    const passed =
      sentCount === COUNT &&
      delivered.size === COUNT &&
      missingCount === 0 &&
      duplicateCount === 0 &&
      lateCount === 0 &&
      invalidCount === 0 &&
      errorCount === 0 &&
      !closed &&
      senderSocket &&
      !senderSocket.closed &&
      !senderSocket.error;

    sent.add(sentCount);
    received.add(delivered.size);
    missing.add(missingCount);
    duplicate.add(duplicateCount);
    late.add(lateCount);
    invalid.add(invalidCount);
    failed.add(passed ? 0 : 1);

    console.log('========== S5 측정 결과 ==========');
    console.log(`테스트 ID: ${testId}`);
    console.log(`목표 메시지: ${COUNT}건`);
    console.log(`HTTP 전송 성공: ${sentCount}건`);
    console.log(`미전송(HTTP 성공 미확인): ${unsentCount}건`);
    console.log(`WebSocket 수신: ${delivered.size}건`);
    console.log(`1초 이내 전달: ${withinTarget}건`);
    console.log(`1초 초과: ${lateCount}건`);
    console.log(`누락: ${missingCount}건`);
    console.log(`중복: ${duplicateCount}건`);
    console.log(`잘못된 시간값: ${invalidCount}건`);
    console.log(`오류: ${errorCount}건`);
    console.log(
      `1초 이내 전달 비율: ` +
      `${(withinTarget / COUNT * 100).toFixed(2)}%`,
    );
    console.log(
      `전체 관찰 시간: ` +
      `${startedAt ? Date.now() - startedAt : 0}ms`,
    );
    console.log(`측정 결과: ${passed ? 'PASS' : 'FAIL'}`);
    console.log('==================================');

    closing = true;

    if (senderSocket && !senderSocket.closed) {
      senderSocket.ws.close();
    }

    if (ws && !closed) {
      ws.close();
    }
  }
}