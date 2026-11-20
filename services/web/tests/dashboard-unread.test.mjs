import test from 'node:test'
import assert from 'node:assert/strict'
import { countUnread, markSeen, readSeen, seenKey } from '../src/pages/dashboard/unread.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  }
}

const brokenStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

test('키 형식', () => {
  assert.equal(seenKey('u1', 'c1'), 'ideaconnection.chat.seen.u1.c1')
})

test('처음 보는 채널은 지금까지 본 것으로 시작', () => {
  const storage = memoryStorage()
  assert.equal(countUnread(storage, 'u1', [{ id: 'c1', lastSeq: 7 }]), 0)
  assert.equal(readSeen(storage, 'u1', 'c1'), 7)
})

test('본 뒤 온 메시지만 센다', () => {
  const storage = memoryStorage({ [seenKey('u1', 'c1')]: '3', [seenKey('u1', 'c2')]: '10' })
  const channels = [
    { id: 'c1', lastSeq: 5 },
    { id: 'c2', lastSeq: 12 },
  ]
  assert.equal(countUnread(storage, 'u1', channels), 4)
})

test('채널이 없으면 0', () => {
  assert.equal(countUnread(memoryStorage(), 'u1', []), 0)
})

test('음수는 0', () => {
  const storage = memoryStorage({ [seenKey('u1', 'c1')]: '9' })
  assert.equal(countUnread(storage, 'u1', [{ id: 'c1', lastSeq: 4 }]), 0)
})

test('저장소가 던지면 0', () => {
  assert.equal(countUnread(brokenStorage, 'u1', [{ id: 'c1', lastSeq: 4 }]), 0)
  assert.doesNotThrow(() => markSeen(brokenStorage, 'u1', 'c1', 3))
})

test('markSeen은 뒤로 가지 않는다', () => {
  const storage = memoryStorage({ [seenKey('u1', 'c1')]: '8' })
  markSeen(storage, 'u1', 'c1', 5)
  assert.equal(readSeen(storage, 'u1', 'c1'), 8)
  markSeen(storage, 'u1', 'c1', 11)
  assert.equal(readSeen(storage, 'u1', 'c1'), 11)
})
