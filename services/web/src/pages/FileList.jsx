import { useEffect, useState } from 'react'
import { apiRequest } from '../api/client'

const pageSize = 20

export default function FileList({ orgId }) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ orgId, page, size: pageSize })

    async function loadFiles() {
      try {
        const data = await apiRequest('/api/files?' + query, {
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
  }, [orgId, page])

  function goToPage(nextPage) {
    setResult(null)
    setPage(nextPage)
  }

  const data = result?.data

  return (
    <section aria-labelledby="file-list-heading">
      <h2 id="file-list-heading">파일 목록</h2>
      {!result && <p role="status">파일 목록을 불러오는 중이에요.</p>}
      {result?.error && <p role="alert">파일 목록을 불러오지 못했어요. {result.error}</p>}
      {data && (
        <>
          {data.items.length === 0 ? (
            <p>표시할 파일이 없어요.</p>
          ) : (
            <ul>
              {data.items.map((file) => (
                <li key={file.id}>{file.name}</li>
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
