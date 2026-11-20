import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatConnection } from '../src/pages/chat/chatConnection.js'

// 서버 대신 쓰는 가짜 WebSocket. 보낸 메시지를 모아 두고, 서버 메시지와 끊김을 흉내 낸다
function fakeSockets() {
  const sockets = []
  class FakeSocket {
    static OPEN = 1
    constructor(url) {
      this.url = url
      this.readyState = 1
      this.sent = []
      sockets.push(this)
    }
    send(data) { this.sent.push(JSON.parse(data)) }
    close() { this.readyState = 3 }
    server(message) { this.onmessage({ data: JSON.stringify(message) }) }
    drop(reason = '') { this.readyState = 3; this.onclose({ code: 1006, reason }) }
  }
  return { FakeSocket, sockets }
}

function token(expSeconds) {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')
  return `h.${payload}.s`
}

function setup(overrides = {}) {
  const { FakeSocket, sockets } = fakeSockets()
  const timers = []
  const events = []
  const connection = createChatConnection({
    url: 'ws://test/api/chat/ws',
    getToken: async () => token(1_000_000),
    WebSocketImpl: FakeSocket,
    onStatus: (s) => events.push(`status:${s}`),
    onSubscribed: (c) => events.push(`subscribed:${c}`),
    onMessage: (c, data) => events.push(`message:${c}:${data.id}`),
    onRevoked: () => events.push('revoked'),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearTimer: () => {},
    now: () => 0,
    ...overrides,
  })
  return { connection, sockets, timers, events }
}

const tick = () => new Promise((r) => setImmediate(r))

test('AUTH 후 구독 중인 채널을 SUBSCRIBE하고 새 메시지를 넘긴다', async () => {
  const { connection, sockets, events } = setup()
  connection.subscribe('c1')
  const ws = sockets[0]
  ws.server({ type: 'AUTH_REQUIRED' })
  await tick()
  assert.equal(ws.sent[0].type, 'AUTH')
  ws.server({ type: 'AUTH_OK' })
  assert.deepEqual(ws.sent[1], { type: 'SUBSCRIBE', channelId: 'c1' })
  ws.server({ type: 'SUBSCRIBED', channelId: 'c1' })
  ws.server({ type: 'MESSAGE_CREATED', channelId: 'c1', data: { id: 'm1' } })
  assert.deepEqual(events.filter((e) => !e.startsWith('status')), ['subscribed:c1', 'message:c1:m1'])
})

test('끊기면 다시 연결해 같은 채널을 다시 구독한다(놓친 메시지는 SUBSCRIBED 때 채움)', async () => {
  const { connection, sockets, timers, events } = setup()
  connection.subscribe('c1')
  sockets[0].server({ type: 'AUTH_REQUIRED' })
  await tick()
  sockets[0].server({ type: 'AUTH_OK' })

  sockets[0].drop()
  const reconnect = timers.at(-1)
  assert.equal(reconnect.ms, 1000)
  reconnect.fn()

  const ws = sockets[1]
  ws.server({ type: 'AUTH_REQUIRED' })
  await tick()
  ws.server({ type: 'AUTH_OK' })
  assert.deepEqual(ws.sent.at(-1), { type: 'SUBSCRIBE', channelId: 'c1' })
  assert.ok(events.includes('status:reconnecting'))
})

test('다시 연결 간격은 늘어나고 10초를 넘지 않는다', () => {
  const { sockets, timers } = setup()
  const delays = []
  for (let i = 0; i < 6; i += 1) {
    sockets.at(-1).drop()
    delays.push(timers.at(-1).ms)
    timers.at(-1).fn()
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 10000, 10000])
})

test('조직에서 내보내지면 다시 연결하지 않는다', () => {
  const { sockets, timers, events } = setup()
  sockets[0].drop('Membership revoked')
  assert.equal(timers.length, 0)
  assert.ok(events.includes('revoked'))
  assert.ok(events.includes('status:revoked'))
})

test('토큰 만료 1분 전에 새 토큰으로 AUTH를 다시 보낸다', async () => {
  const { sockets, timers } = setup({ getToken: async () => token(600) })
  sockets[0].server({ type: 'AUTH_REQUIRED' })
  await tick()
  const refresh = timers.at(-1)
  assert.equal(refresh.ms, 540_000)
  refresh.fn()
  await tick()
  assert.equal(sockets[0].sent.filter((m) => m.type === 'AUTH').length, 2)
})

test('채널을 바꾸면 이전 채널을 UNSUBSCRIBE한다', async () => {
  const { connection, sockets } = setup()
  sockets[0].server({ type: 'AUTH_REQUIRED' })
  await tick()
  sockets[0].server({ type: 'AUTH_OK' })
  connection.subscribe('c1')
  connection.unsubscribe('c1')
  connection.subscribe('c2')
  assert.deepEqual(sockets[0].sent.slice(1).map((m) => `${m.type}:${m.channelId}`), [
    'SUBSCRIBE:c1', 'UNSUBSCRIBE:c1', 'SUBSCRIBE:c2',
  ])
})

test('MESSAGE_UPDATED도 메시지로 넘겨 화면이 바꿔 끼우게 한다', () => {
  const { sockets, events } = setup()
  sockets[0].server({ type: 'MESSAGE_UPDATED', channelId: 'c1', data: { id: 'm1' } })
  assert.ok(events.includes('message:c1:m1'))
})
