import test from 'node:test'
import assert from 'node:assert/strict'
import { supportsPreview, openFilePreview } from '../src/pages/filePreview.js'

const file = { id: '7', contentType: 'application/pdf' }
function fakeTab() {
  return {
    closed: false, opener: {}, destination: null,
    document: { createElement: () => ({}), head: { appendChild() {} } },
    location: { replace(url) { this.destination = url } },
    close() { this.closed = true },
  }
}

test('명세의 이미지·PDF만 허용하고 SVG·HTML·Office는 제외한다', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf']) {
    assert.equal(supportsPreview(type), true)
  }
  for (const type of ['image/svg+xml', 'text/html', 'text/plain', 'application/msword', undefined]) {
    assert.equal(supportsPreview(type), false)
  }
})

test('클릭 즉시 탭을 열고 새 주소를 발급받아 미리보기로 이동한다', async () => {
  const tab = fakeTab()
  let opened = false
  await openFilePreview(file, {
    openWindow() { opened = true; return tab },
    async getPreviewUrl(id) { assert.equal(opened, true); assert.equal(id, '7'); return { url: 'https://storage.example/view' } },
  })
  assert.equal(tab.opener, null)
  assert.equal(tab.location.destination, 'https://storage.example/view')
})

test('API 실패 또는 위험한 주소는 빈 탭을 닫고 오류를 전달한다', async () => {
  for (const getPreviewUrl of [
    async () => { throw new Error('권한 없음') },
    async () => ({ url: 'javascript:alert(1)' }),
  ]) {
    const tab = fakeTab()
    await assert.rejects(openFilePreview(file, { getPreviewUrl, openWindow: () => tab }))
    assert.equal(tab.closed, true)
    assert.equal(tab.location.destination, undefined)
  }
})

test('팝업 차단·지원하지 않는 형식은 API를 호출하지 않는다', async () => {
  const getPreviewUrl = () => { throw new Error('호출되면 안 됨') }
  await assert.rejects(openFilePreview(file, { getPreviewUrl, openWindow: () => null }), /팝업/)
  await assert.rejects(openFilePreview({ contentType: 'image/svg+xml' }, { getPreviewUrl }), /다운로드/)
})
