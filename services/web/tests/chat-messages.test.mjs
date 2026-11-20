import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAfter, lastSeq, mergeMessages } from '../src/pages/chat/messages.js'

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
