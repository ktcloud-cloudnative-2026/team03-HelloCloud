import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initial, validDisplayName } from '../src/profile/name.js'

const webDir = fileURLToPath(new URL('..', import.meta.url))

test('동그라미에는 이름 첫 글자를 넣고, 이모지는 깨지지 않게 한 글자로 센다', () => {
  assert.equal(initial('  김준형'), '김')
  assert.equal(initial('😀abc'), '😀')
  assert.equal(initial('   '), '?')
  assert.equal(initial(null), '?')
})

test('이름은 앞뒤 공백을 빼고 1~50자(서버와 같은 기준)', () => {
  assert.deepEqual(validDisplayName('  김준형 '), { value: '김준형', error: '' })
  assert.equal(validDisplayName('   ').error, '이름을 입력해 주세요.')
  assert.equal(validDisplayName('가'.repeat(51)).error, '이름은 50자까지 쓸 수 있어요.')
  assert.equal(validDisplayName('😀'.repeat(50)).error, '')
})

test('사이드바와 헤더는 고정 글자 대신 내 계정을 보여 주고, 누르면 프로필 창이 열린다', () => {
  const dashboard = readFileSync(`${webDir}src/pages/Dashboard.jsx`, 'utf8')
  assert.doesNotMatch(dashboard, /개발용 계정/)
  assert.doesNotMatch(dashboard, />U</)
  assert.match(dashboard, /getMe\(/)
  assert.match(dashboard, /<ProfileDialog/)
  const dialog = readFileSync(`${webDir}src/components/ProfileDialog.jsx`, 'utf8')
  assert.match(dialog, /updateMe\(/)
})
