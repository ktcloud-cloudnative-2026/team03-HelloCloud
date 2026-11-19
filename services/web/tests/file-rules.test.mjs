import test from 'node:test'
import assert from 'node:assert/strict'
import { uploadValidationMessage, formatFileSize, availableFilePage } from '../src/pages/fileRules.js'

test('백엔드와 동일한 빈 파일·100MB 경계·파일명 제한을 적용한다', () => {
  assert.match(uploadValidationMessage({ name: 'a', size: 0 }), /빈 파일/)
  assert.equal(uploadValidationMessage({ name: 'a', size: 100_000_000 }), null)
  assert.match(uploadValidationMessage({ name: 'a', size: 100_000_001 }), /100MB/)
  assert.match(uploadValidationMessage({ name: 'a'.repeat(256), size: 1 }), /이름/)
  assert.match(uploadValidationMessage({ name: 'bad' + String.fromCharCode(10), size: 1 }), /이름/)
  assert.equal(uploadValidationMessage({ name: '한글 문서.pdf', size: 1 }), null)
})

test('작은 파일 용량도 0.00 MB 대신 읽을 수 있는 단위로 표시한다', () => {
  assert.equal(formatFileSize(12), '12 B')
  assert.equal(formatFileSize(1200), '1.2 KB')
  assert.equal(formatFileSize(1_820_000), '1.8 MB')
  assert.equal(formatFileSize(undefined), '')
})

test('다른 사용자의 삭제로 페이지가 비면 마지막 유효 페이지로 이동한다', () => {
  assert.equal(availableFilePage(2, 40, 20), 1)
  assert.equal(availableFilePage(2, 0, 20), 0)
  assert.equal(availableFilePage(2, 41, 20), 2)
})
