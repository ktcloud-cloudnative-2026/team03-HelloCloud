import test from 'node:test'
import assert from 'node:assert/strict'
import { menuItems, menuLabel } from '../src/pages/dashboardMenu.js'

test('헤더 경로는 지금 고른 메뉴 이름을 보여 준다', () => {
  assert.equal(menuLabel('chat'), '채팅')
  assert.equal(menuLabel('files'), '파일 관리')
  assert.equal(menuLabel('members'), '멤버')
  assert.equal(menuLabel('dashboard'), '대시보드')
})

test('모르는 메뉴면 대시보드로 보여 준다', () => {
  assert.equal(menuLabel('없는-메뉴'), '대시보드')
  assert.equal(menuLabel(undefined), '대시보드')
})

test('메뉴 id는 겹치지 않는다', () => {
  const ids = menuItems.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
})
