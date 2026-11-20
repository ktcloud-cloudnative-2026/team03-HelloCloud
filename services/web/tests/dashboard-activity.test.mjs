import test from 'node:test'
import assert from 'node:assert/strict'
import { buildActivities, relativeTime } from '../src/pages/dashboard/activity.js'

const now = new Date('2026-11-20T12:00:00Z')
const ago = (ms) => new Date(now.getTime() - ms).toISOString()
const MIN = 60 * 1000
const HOUR = 60 * MIN

const channels = [{ id: 'c1', name: '일반' }]
const nameOf = (id) => ({ u1: '김기선', u2: '나' })[id] ?? '알 수 없는 사용자'
const message = (id, at, text = '안녕하세요', attachments = []) => ({
  id, channelId: 'c1', senderId: 'u1', text, attachments, createdAt: at,
})
const file = (id, at) => ({ id, name: `파일${id}.pdf`, uploadedBy: 'u2', createdAt: at })
const decision = (id, at, text = '결정') => ({ id, text, registeredBy: 'u1', registeredAt: at })

test('상대 시간', () => {
  assert.equal(relativeTime(ago(30 * 1000), now), '방금 전')
  assert.equal(relativeTime(ago(5 * MIN), now), '5분 전')
  assert.equal(relativeTime(ago(3 * HOUR), now), '3시간 전')
  assert.equal(relativeTime(ago(2 * 24 * HOUR), now), '2일 전')
})

test('세 종류를 합쳐 최신 5개', () => {
  const result = buildActivities({
    messages: [message('m1', ago(1 * MIN)), message('m2', ago(3 * MIN)), message('m3', ago(7 * MIN))],
    files: [file('f1', ago(2 * MIN)), file('f2', ago(6 * MIN))],
    decisions: [decision('d1', ago(4 * MIN)), decision('d2', ago(5 * MIN))],
    channels,
    nameOf,
  })
  assert.deepEqual(
    result.map((a) => a.id),
    ['message:m1', 'file:f1', 'message:m2', 'decision:d1', 'decision:d2'],
  )
})

test('문구와 이름', () => {
  const [m] = buildActivities({ messages: [message('m1', ago(MIN))], files: [], decisions: [], channels, nameOf })
  assert.equal(m.kind, 'message')
  assert.equal(m.name, '김기선')
  assert.equal(m.action, '#일반에 메시지를 남겼습니다.')
  assert.equal(m.detail, '안녕하세요')
  const [f] = buildActivities({ messages: [], files: [file('f1', ago(MIN))], decisions: [], channels, nameOf })
  assert.equal(f.name, '나')
  assert.equal(f.action, '파일을 공유했습니다.')
  assert.equal(f.detail, '파일f1.pdf')
  const [d] = buildActivities({ messages: [], files: [], decisions: [decision('d1', ago(MIN))], channels, nameOf })
  assert.equal(d.action, '메시지를 고정했습니다.')
  assert.equal(d.at, ago(MIN))
})

test('주어: 나는 "내가", 다른 사람은 "○○님이"', () => {
  const result = buildActivities({
    messages: [message('m1', ago(MIN))], files: [file('f1', ago(2 * MIN))], decisions: [], channels, nameOf,
  })
  assert.deepEqual(result.map((a) => a.subject), ['김기선님이', '내가'])
})

test('텍스트 없는 메시지', () => {
  const [m] = buildActivities({
    messages: [message('m1', ago(MIN), '', [{ fileId: '5', name: 'a.png' }])],
    files: [], decisions: [], channels, nameOf,
  })
  assert.equal(m.detail, '파일 첨부')
})

test('긴 텍스트 자르기', () => {
  const [m] = buildActivities({
    messages: [message('m1', ago(MIN), '가'.repeat(41))], files: [], decisions: [], channels, nameOf,
  })
  assert.equal(m.detail, `${'가'.repeat(40)}…`)
})

test('종류가 달라도 시간순', () => {
  const result = buildActivities({
    messages: [message('m1', ago(10 * MIN), '같은 글')],
    files: [],
    decisions: [decision('d1', ago(5 * MIN), '같은 글')],
    channels,
    nameOf,
  })
  assert.deepEqual(result.map((a) => a.id), ['decision:d1', 'message:m1'])
})

test('모두 비면 빈 배열', () => {
  assert.deepEqual(buildActivities({ messages: [], files: [], decisions: [], channels: [], nameOf }), [])
})
