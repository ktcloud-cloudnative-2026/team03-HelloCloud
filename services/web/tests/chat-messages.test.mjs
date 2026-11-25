import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAfter, lastSeq, mergeMessages, unknownSenders } from '../src/pages/chat/messages.js'

const m = (id, seq) => ({ id, seq, text: id })

test('HTTP 응답과 WebSocket으로 두 번 온 메시지는 하나만 남기고 seq 순서로 정렬한다', () => {
  const merged = mergeMessages([m('a', 1), m('c', 3)], [m('b', 2), m('c', 3)])
  assert.deepEqual(merged.map((x) => x.id), ['a', 'b', 'c'])
})

test('마지막 seq는 비어 있으면 0, 건너뛴 번호가 있어도 마지막 메시지의 seq', () => {
  assert.equal(lastSeq([]), 0)
  assert.equal(lastSeq([m('a', 1), m('b', 5)]), 5)
})

test('놓친 메시지는 마지막 seq 다음부터 페이지로 이어 받는다', async () => {
  const all = Array.from({ length: 250 }, (_, i) => m(`m${i + 1}`, i + 1))
  const calls = []
  const getMessages = async (channelId, after, limit) => {
    calls.push(after)
    return all.filter((x) => x.seq > after).slice(0, limit)
  }
  const got = await fetchAfter(getMessages, 'c1', 20)
  assert.equal(got.length, 230)
  assert.equal(got[0].seq, 21)
  assert.deepEqual(calls, [20, 120, 220])
})

import { ackState, hasReacted } from '../src/pages/chat/messages.js'

test('이모지를 내가 눌렀는지', () => {
  const message = { reactions: [{ emoji: '👍', userIds: ['me', 'b'] }] }
  assert.equal(hasReacted(message, '👍', 'me'), true)
  assert.equal(hasReacted(message, '🎉', 'me'), false)
  assert.equal(hasReacted({}, '👍', 'me'), false)
})

test('확인 요청 상태: 보낸 사람, 확인해야 하는 사람, 확인한 사람', () => {
  const message = {
    senderId: 'a',
    acknowledgement: { requiredUserIds: ['b', 'c'], confirmed: [{ userId: 'b', at: 't' }] },
  }
  assert.deepEqual(ackState(message, 'a'), {
    total: 2, confirmedCount: 1, isSender: true, needsMyConfirm: false, confirmedByMe: false,
  })
  assert.equal(ackState(message, 'c').needsMyConfirm, true)
  assert.equal(ackState(message, 'b').confirmedByMe, true)
  assert.equal(ackState({ acknowledgement: { requiredUserIds: [], confirmed: [] } }, 'a'), null)
})

test('이름을 모르는 보낸 사람은 한 번씩만 골라낸다(나 · 아는 사람 · 이미 물어본 사람 제외)', () => {
  const messages = [
    { id: 'a', seq: 1, senderId: 'me' },
    { id: 'b', seq: 2, senderId: 'known' },
    { id: 'c', seq: 3, senderId: 'new' },
    { id: 'd', seq: 4, senderId: 'new' },
    { id: 'e', seq: 5, senderId: 'asked' },
    { id: 'f', seq: 6, senderId: null },
  ]
  const names = { known: '아는 사람' }
  assert.deepEqual(unknownSenders(messages, names, 'me', new Set(['asked'])), ['new'])
  assert.deepEqual(unknownSenders(messages, { ...names, new: '새 멤버' }, 'me', new Set(['asked'])), [])
})
