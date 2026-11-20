import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentErrorMessage, previewKind, safeUrl, toAttachment } from '../src/pages/chat/attachments.js'

test('이미지는 채널 안, PDF는 새 탭, 나머지는 내려받기', () => {
  assert.equal(previewKind('image/png'), 'inline')
  assert.equal(previewKind('application/pdf'), 'tab')
  assert.equal(previewKind('image/svg+xml'), 'download')
  assert.equal(previewKind('text/plain'), 'download')
})

test('파일 목록 항목을 첨부 모양으로 바꾼다', () => {
  assert.deepEqual(toAttachment({ id: 5, name: '기획서.pdf', contentType: 'application/pdf', sizeBytes: 1 }), {
    fileId: '5', name: '기획서.pdf', contentType: 'application/pdf',
  })
  assert.equal(toAttachment({ id: '6', name: 'a' }).contentType, 'application/octet-stream')
})

test('http(s) 주소만 연다', () => {
  assert.equal(safeUrl('https://s3.example/a?sig=1'), 'https://s3.example/a?sig=1')
  assert.throws(() => safeUrl('javascript:alert(1)'))
})

test('권한 · 없는 파일 오류를 알아듣게 바꾼다', () => {
  assert.match(attachmentErrorMessage({ status: 403, message: 'x' }), /권한/)
  assert.match(attachmentErrorMessage({ status: 409, message: 'x' }), /지워졌거나/)
  assert.equal(attachmentErrorMessage({ status: 500, message: '서버 오류' }), '서버 오류')
})
