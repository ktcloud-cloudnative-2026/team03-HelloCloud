import { createRoot } from 'react-dom/client'
import FileManager from '../src/pages/FileManager'
import '../src/styles/tokens.css'
import '../src/index.css'
import '../src/pages/Dashboard.css'

const samples = [
  { id: 'image', name: '예시 이미지.png', contentType: 'image/png', sizeBytes: 245000 },
  { id: 'pdf', name: '예시 문서.pdf', contentType: 'application/pdf', sizeBytes: 1820000 },
  { id: 'text', name: '안내문.txt', contentType: 'text/plain', sizeBytes: 1200 },
]
const paths = { image: '/dev/sample.png', pdf: '/dev/sample.pdf', text: '/dev/sample.txt' }
const originalFetch = window.fetch.bind(window)
window.fetch = (input, options) => {
  const url = new URL(input, window.location.origin)
  if (url.origin === window.location.origin && url.pathname === '/api/files' && options?.method === 'POST') {
    return Promise.resolve(Response.json({ detail: '예시 화면에서는 실제 업로드를 하지 않아요. 팀 dev에서 확인해 주세요.' }, { status: 400 }))
  }
  if (url.origin === window.location.origin && url.pathname === '/api/files') {
    return Promise.resolve(Response.json({ items: samples, page: 0, size: 20, total: samples.length }))
  }
  const match = url.pathname.match(/^\/api\/files\/(image|pdf|text)\/(preview-url|download-url)$/)
  if (url.origin === window.location.origin && match) {
    return Promise.resolve(Response.json({ url: new URL(paths[match[1]], window.location.origin).href }))
  }
  return originalFetch(input, options)
}

createRoot(document.getElementById('root')).render(
  <main style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
    <p role="note">로컬 화면 확인용 예시입니다. 실제 로그인·파일 API를 사용하지 않습니다.</p>
    <FileManager orgId="demo" />
    <p>이미지·PDF의 미리보기를 누르면 새 탭에서 열립니다. TXT에는 다운로드 안내가 표시됩니다.</p>
  </main>,
)
