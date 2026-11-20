import test from 'node:test'
import assert from 'node:assert/strict'
import { canDeleteOrganization } from '../src/components/orgDelete.js'

test('조직 이름을 정확히 입력해야 삭제할 수 있다', () => {
  assert.equal(canDeleteOrganization('HelloCloud 테스트팀', 'HelloCloud 테스트팀'), true)
})

test('비었거나 다르면 삭제할 수 없다', () => {
  assert.equal(canDeleteOrganization('HelloCloud 테스트팀', ''), false)
  assert.equal(canDeleteOrganization('HelloCloud 테스트팀', 'HelloCloud'), false)
})

test('앞뒤 공백이나 대소문자가 달라도 삭제할 수 없다', () => {
  assert.equal(canDeleteOrganization('HelloCloud', ' HelloCloud'), false)
  assert.equal(canDeleteOrganization('HelloCloud', 'hellocloud'), false)
})

test('조직 이름이 비어 있으면 삭제할 수 없다', () => {
  assert.equal(canDeleteOrganization('', ''), false)
})
