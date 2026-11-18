import test from 'node:test'
import assert from 'node:assert/strict'
import { canDeleteFile, requestFileDeletion } from '../src/pages/fileDeletion.js'

const file = { id: '7', name: '기획서.pdf', uploadedBy: 'author' }
test('업로더와 OWNER만 삭제하며 알 수 없는 역할과 사용자 정보는 거부한다', () => {
  assert.equal(canDeleteFile(file, 'MEMBER', 'author'), true)
  assert.equal(canDeleteFile(file, 'OWNER', 'owner'), true)
  assert.equal(canDeleteFile(file, 'MEMBER', 'other'), false)
  assert.equal(canDeleteFile(file, 'OWNER', null), false)
  assert.equal(canDeleteFile(file, undefined, 'author'), false)
})

test('확인 취소 시 삭제 API를 호출하지 않는다', async () => {
  let calls = 0
  const removed = await requestFileDeletion(file, {
    organizationRole: 'MEMBER', currentUserId: 'author',
    confirmDelete: () => false, deleteFile: async () => { calls += 1 },
  })
  assert.equal(removed, false)
  assert.equal(calls, 0)
})

test('권한 있는 사용자의 확인 후에만 삭제한다', async () => {
  let confirmed = false
  const removed = await requestFileDeletion(file, {
    organizationRole: 'OWNER', currentUserId: 'owner',
    confirmDelete: (message) => { assert.match(message, /기획서.pdf/); confirmed = true; return true },
    deleteFile: async (id) => { assert.equal(confirmed, true); assert.equal(id, '7') },
  })
  assert.equal(removed, true)
})

test('다른 멤버는 API 호출 전 거부하고 서버의 권한 변경 오류도 전달한다', async () => {
  await assert.rejects(requestFileDeletion(file, {
    organizationRole: 'MEMBER', currentUserId: 'other',
    confirmDelete: () => { throw new Error('확인창이 열리면 안 됨') },
  }), /권한/)
  const error = Object.assign(new Error('권한 회수'), { status: 403 })
  await assert.rejects(requestFileDeletion(file, {
    organizationRole: 'MEMBER', currentUserId: 'author', confirmDelete: () => true,
    deleteFile: async () => { throw error },
  }), (caught) => caught === error)
})
