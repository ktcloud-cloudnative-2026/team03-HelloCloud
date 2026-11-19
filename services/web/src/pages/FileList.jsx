import { useEffect, useRef, useState } from 'react'
import { listFiles, getDownloadUrl, getPreviewUrl, deleteFile } from '../api/files'
import { supportsPreview, openFilePreview } from './filePreview.js'

import { canDeleteFile, requestFileDeletion } from './fileDeletion.js'
import { availableFilePage, formatFileSize } from './fileRules.js'

import FileDeleteDialog from './FileDeleteDialog'

const pageSize = 20

export default function FileList({ orgId, refreshKey = 0, organizationRole, currentUserId }) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [previewing, setPreviewing] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteNotice, setDeleteNotice] = useState(null)
  const deletionLock = useRef(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadFiles() {
      try {
        const data = await listFiles(orgId, page, pageSize, {
          signal: controller.signal,
        })
        if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.total) || data.total < 0) {
          throw new Error('파일 목록 응답 형식을 확인해 주세요.')
        }
        if (controller.signal.aborted) return
        const available = availableFilePage(page, data.total, pageSize)
        if (available !== page) {
          setPage(available)
          return
        }
        setResult({ data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error.message })
      }
    }

    loadFiles()
    return () => controller.abort()
  }, [orgId, page, refreshKey, retry])

  function reload() {
    setResult(null)
    setRetry((value) => value + 1)
  }

  function goToPage(nextPage) {
    setDownloadError(null)
    setPreviewError(null)
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

  async function remove(file) {
    if (deletionLock.current) return
    deletionLock.current = true
    setDeleteNotice(null)
    setDeleting(file.id)
    try {
      const removed = await requestFileDeletion(file, {
        organizationRole, currentUserId,
        confirmDelete: () => true,
        deleteFile,
      })
      if (!removed) return
      setDeleteNotice({ message: '파일을 삭제했어요.' })
      setResult(null)
      if (page > 0 && result?.data.items.length === 1) setPage(page - 1)
      else setRetry((value) => value + 1)
    } catch (error) {
      const message = error.status === 403 ? '삭제 권한이 없거나 조직 접근 권한이 변경됐어요.'
        : error.status === 404 ? '이미 삭제되었거나 찾을 수 없는 파일이에요. 목록을 다시 불러와 주세요.'
          : '파일을 삭제하지 못했어요. ' + error.message
      setDeleteNotice({ error: true, message })
    } finally {
      deletionLock.current = false
      setDeleting(null)
      setDeleteTarget(null)
    }
  }

  const data = result?.data

  return (
    <section className="file-list-section" aria-labelledby="file-list-heading">
      <div className="file-list-heading"><h2 id="file-list-heading">공유 파일</h2>{data && <span>{data.total}개</span>}
        <button className="file-button file-button-outline file-list-refresh" type="button"
          disabled={!result || deleting !== null} onClick={reload}>새로고침</button>
      </div>
      {!result && <p role="status">파일 목록을 불러오는 중이에요.</p>}
      {result?.error && (
        <div>
          <p role="alert">파일 목록을 불러오지 못했어요. {result.error}</p>
          <button className="file-button file-button-outline" type="button" onClick={reload}>다시 불러오기</button>
        </div>
      )}
      {downloadError && <p role="alert">다운로드하지 못했어요. {downloadError}</p>}
      {previewError && <p role="alert">미리보기를 열지 못했어요. {previewError}</p>}
      {deleteNotice && <p role={deleteNotice.error ? 'alert' : 'status'}>{deleteNotice.message}</p>}
      {deleteNotice?.error && <button type="button" className="file-button file-button-outline" disabled={deleting !== null}
        onClick={reload}>목록 새로고침</button>}
      {deleteTarget && <FileDeleteDialog file={deleteTarget} busy={deleting !== null}
        onCancel={() => setDeleteTarget(null)} onConfirm={() => remove(deleteTarget)} />}
      {data && (
        <>
          {data.items.length === 0 ? (
            <p className="file-empty">아직 공유된 파일이 없어요. 첫 파일을 올려 보세요.</p>
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
                      {formatFileSize(file.sizeBytes) ? ' · ' + formatFileSize(file.sizeBytes) : ''}
                    </small></div>
                  </div>
                  <div className="file-list-actions">
                    {supportsPreview(file.contentType) ? (
                      <button className="file-button file-button-outline" type="button" disabled={previewing !== null || deleting !== null} onClick={() => preview(file)}
                        aria-label={file.name + ' 미리보기 (새 탭)'}>
                        {previewing === file.id ? '여는 중…' : '미리보기'}
                      </button>
                    ) : <small className="file-preview-hint">다운로드로 확인</small>}
                    <button className="file-button file-button-soft" type="button" disabled={downloading !== null || deleting !== null} onClick={() => download(file)}>
                      {downloading === file.id ? '준비 중…' : '다운로드'}
                    </button>
                    {canDeleteFile(file, organizationRole, currentUserId) && (
                      <button type="button" className="file-button file-button-danger" disabled={deleting !== null}
                        aria-label={file.name + ' 삭제'} onClick={() => { setDeleteNotice(null); setDeleteTarget(file) }}>
                        {deleting === file.id ? '삭제 중…' : '삭제'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {(page > 0 || (page + 1) * pageSize < data.total) && (
            <nav className="file-pagination" aria-label="파일 목록 페이지">
              <button className="file-button file-button-outline" type="button" disabled={page === 0 || deleting !== null} onClick={() => goToPage(page - 1)}>
                이전
              </button>
              <span>{page + 1} / {Math.max(1, Math.ceil(data.total / pageSize))}</span>
              <button
                className="file-button file-button-outline"
                type="button"
                disabled={(page + 1) * pageSize >= data.total || deleting !== null}
                onClick={() => goToPage(page + 1)}
              >
                다음
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
