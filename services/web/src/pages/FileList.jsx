import { useEffect, useState } from 'react'
import { listFiles, getDownloadUrl } from '../api/files'

const pageSize = 20

export default function FileList({ orgId, refreshKey = 0 }) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()


    async function loadFiles() {
      try {
        const data = await listFiles(orgId, page, pageSize, {
          signal: controller.signal,
        })
        if (!Array.isArray(data?.items) || !Number.isInteger(data.total)) {
          throw new Error('파일 목록 응답 형식을 확인해 주세요.')
        }
        if (!controller.signal.aborted) setResult({ data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error.message })
      }
    }

    loadFiles()
    return () => controller.abort()
  }, [orgId, page, refreshKey, retry])

  function goToPage(nextPage) {
    setResult(null)
    setPage(nextPage)
  }

  async function download(file) {
    setDownloadError(null)
    setDownloading(file.id)
    try {
      const { url } = await getDownloadUrl(file.id)
      const target = new URL(url)
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('다운로드 주소를 확인해 주세요.')
      // 서명된 주소로 이동하며 로그인 토큰을 저장소에 보내지 않습니다.
      const link = document.createElement('a')
      link.href = target.href
      link.rel = 'noreferrer'
      link.referrerPolicy = 'no-referrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setDownloadError(error.message)
    } finally {
      setDownloading(null)
    }
  }

  const data = result?.data

  return (
    <section aria-labelledby="file-list-heading">
      <h2 id="file-list-heading">파일 목록</h2>
      {!result && <p role="status">파일 목록을 불러오는 중이에요.</p>}
      {result?.error && (
        <div>
          <p role="alert">파일 목록을 불러오지 못했어요. {result.error}</p>
          <button type="button" onClick={() => { setResult(null); setRetry((value) => value + 1) }}>다시 불러오기</button>
        </div>
      )}
      {downloadError && <p role="alert">다운로드하지 못했어요. {downloadError}</p>}
      {data && (
        <>
          {data.items.length === 0 ? (
            <p>표시할 파일이 없어요.</p>
          ) : (
            <ul>
              {data.items.map((file) => (
                <li key={file.id} className="file-list-row">
                  <span>{file.name}</span>
                  <button type="button" disabled={downloading !== null} onClick={() => download(file)}>
                    {downloading === file.id ? '준비 중…' : '다운로드'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(page > 0 || (page + 1) * pageSize < data.total) && (
            <div>
              <button type="button" disabled={page === 0} onClick={() => goToPage(page - 1)}>
                이전
              </button>
              <button
                type="button"
                disabled={(page + 1) * pageSize >= data.total}
                onClick={() => goToPage(page + 1)}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
