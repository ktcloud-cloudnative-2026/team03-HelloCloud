import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ICON_PATHS } from '../src/components/iconPaths.js'

test('대시보드에 쓰는 아이콘이 모두 있다', () => {
  for (const name of ['grid', 'users', 'chat', 'folder', 'check', 'calendar', 'mail', 'pin']) {
    assert.match(ICON_PATHS[name] ?? '', /^M/, `${name} 아이콘의 path가 있어야 한다`)
  }
})

test('대시보드는 글자 기호 대신 아이콘 이름을 쓴다', () => {
  const source = readFileSync(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8')
  for (const symbol of ['▦', '♙', '▤', '▣', '☑', '✉', '📌']) {
    assert.equal(source.includes(symbol), false, `${symbol} 기호가 남아 있으면 안 된다`)
  }
  const used = [...source.matchAll(/icon: '([a-z]+)'/g)].map((m) => m[1])
  assert.ok(used.length > 0)
  for (const name of used) assert.ok(ICON_PATHS[name], `${name} 아이콘이 정의돼 있어야 한다`)
})
