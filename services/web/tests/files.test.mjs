import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

async function loadApi(apiRequest, fetch) {
  const context = vm.createContext({ URLSearchParams, fetch })
  const client = new vm.SyntheticModule(['apiRequest'], function () {
    this.setExport('apiRequest', apiRequest)
  }, { context })
  const source = await readFile(new URL('../src/api/files.js', import.meta.url), 'utf8')
  const module = new vm.SourceTextModule(source, { context })
  await module.link(() => client)
  await module.evaluate()
  return module.namespace
}

test('목록 요청은 조직·페이지·취소 신호를 전달한다', async () => {
  const signal = new AbortController().signal
  const api = await loadApi(async (path, options) => {
    assert.equal(path, '/api/files?orgId=7&page=1&size=20')
    assert.equal(options.signal, signal)
    return { items: [], total: 0 }
  })
  await api.listFiles('7', 1, 20, { signal })
})

test('시작 → 저장소 PUT → 완료 순서이며 저장소에 로그인 토큰을 보내지 않는다', async () => {
  const calls = []
  const file = { name: 'sample.txt', type: 'text/plain', size: 4 }
  const api = await loadApi(async (path, options) => {
    calls.push(path)
    if (path === '/api/files') {
      assert.equal(options.method, 'POST')
      assert.equal(JSON.parse(options.body).sizeBytes, 4)
      return { id: 'file/1', uploadUrl: 'https://storage.example/upload' }
    }
    return { id: 'file/1' }
  }, async (url, options) => {
    calls.push(url)
    assert.equal(options.method, 'PUT')
    assert.equal(options.body, file)
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(options.headers['Content-Type'], 'text/plain')
    return { ok: true }
  })
  await api.uploadFile('7', file)
  assert.deepEqual(calls, ['/api/files', 'https://storage.example/upload', '/api/files/file%2F1/complete'])
})

test('저장소 전송이 실패하면 완료 API를 호출하지 않는다', async () => {
  let requests = 0
  const api = await loadApi(async () => {
    requests += 1
    return { id: '1', uploadUrl: 'https://storage.example/upload' }
  }, async () => ({ ok: false, status: 503 }))
  await assert.rejects(api.uploadFile('7', { name: 'a', type: '', size: 1 }), /503/)
  assert.equal(requests, 1)
})

test('다운로드 주소를 요청할 때 파일 ID를 인코딩한다', async () => {
  const api = await loadApi(async (path) => {
    assert.equal(path, '/api/files/a%2Fb/download-url')
    return { url: 'https://storage.example/download' }
  })
  assert.equal((await api.getDownloadUrl('a/b')).url, 'https://storage.example/download')
})

test('미리보기 주소 요청은 파일 ID를 인코딩하고 권한 오류를 전달한다', async () => {
  const denied = new Error('권한이 없습니다')
  const api = await loadApi(async (path) => {
    assert.equal(path, '/api/files/a%2Fb/preview-url')
    throw denied
  })
  await assert.rejects(api.getPreviewUrl('a/b'), (error) => error === denied)
})

test('삭제 요청은 DELETE와 인코딩된 ID를 사용하고 204 빈 응답을 허용한다', async () => {
  const api = await loadApi(async (path, options) => {
    assert.equal(path, '/api/files/a%2Fb')
    assert.equal(options.method, 'DELETE')
    return null
  })
  assert.equal(await api.deleteFile('a/b'), null)
})
