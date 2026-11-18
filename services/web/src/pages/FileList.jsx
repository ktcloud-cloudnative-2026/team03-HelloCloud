import { useEffect, useState } from 'react'
import { listFiles, getDownloadUrl, getPreviewUrl } from '../api/files'
import { supportsPreview, openFilePreview } from './filePreview.js'

const pageSize = 20

export default function FileList({ orgId, refreshKey = 0 }) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [previewing, setPreviewing] = useState(null)
  const [previewError, setPreviewError] = useState(null)
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

  async function preview(file) {
    setPreviewError(null)
    setPreviewing(file.id)
    try {
      await openFilePreview(file, {
        getPreviewUrl,
        openWindow: () => window.open('about:blank', '_blank'),
      })
    } catch (error) {
      setPreviewError(error.message)
    } finally {
      setPreviewing(null)
    }
  }

  const data = result?.data

  return (
    <section className="file-list-section" aria-labelledby="file-list-heading">
      <div className="file-list-heading"><h2 id="file-list-heading">공유 파일</h2>{data && <span>{data.total}개</span>}</div>
      {!result && <p role="status">파일 목록을 불러오는 중이에요.</p>}
      {result?.error && (
        <div>
          <p role="alert">파일 목록을 불러오지 못했어요. {result.error}</p>
          <button type="button" onClick={() => { setResult(null); setRetry((value) => value + 1) }}>다시 불러오기</button>
        </div>
      )}
      {downloadError && <p role="alert">다운로드하지 못했어요. {downloadError}</p>}
      {previewError && <p role="alert">미리보기를 열지 못했어요. {previewError}</p>}
      {data && (
        <>
          {data.items.length === 0 ? (
            <p>표시할 파일이 없어요.</p>
          ) : (
            <ul className="file-list">
              {data.items.map((file) => (
                <li key={file.id} className="file-list-row">
                  <div className="file-row-info">
                    <span className={'file-type-icon ' + (file.contentType === 'application/pdf' ? 'is-pdf' : supportsPreview(file.contentType) ? 'is-image' : '')} aria-hidden="true">
                      {file.contentType === 'application/pdf' ? 'PDF' : supportsPreview(file.contentType) ? 'IMG' : 'FILE'}
                    </span>
                    <div className="file-row-name"><strong>{file.name}</strong><small>
                      {file.contentType === 'application/pdf' ? 'PDF 문서' : supportsPreview(file.contentType) ? '이미지' : '일반 파일'}
                      {Number.isFinite(file.sizeBytes) ? ' · ' + (file.sizeBytes / 1_000_000).toFixed(2) + ' MB' : ''}
                    </small></div>
                  </div>
                  <div className="file-list-actions">
                    {supportsPreview(file.contentType) ? (
                      <button className="file-button file-button-outline" type="button" disabled={previewing !== null} onClick={() => preview(file)}
                        aria-label={file.name + ' 미리보기 (새 탭)'}>
                        {previewing === file.id ? '여는 중…' : '미리보기'}
                      </button>
                    ) : <small className="file-preview-hint">다운로드로 확인</small>}
                    <button className="file-button file-button-soft" type="button" disabled={downloading !== null} onClick={() => download(file)}>
                      {downloading === file.id ? '준비 중…' : '다운로드'}
                    </button>
                  </div>
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
