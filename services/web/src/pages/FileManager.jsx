import { useRef, useState } from 'react'
import { uploadFile } from '../api/files'
import FileList from './FileList'

const maxUploadBytes = 100_000_000

export default function FileManager({ orgId }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const fileInputRef = useRef(null)
  const fileTooLarge = selectedFile?.size > maxUploadBytes

  function clearSelection() {
    if (fileInputRef.current) fileInputRef.current.value = ''
    setSelectedFile(null)
  }

  async function handleUpload() {
    if (!selectedFile || fileTooLarge || uploading) return
    setUploading(true)
    setNotice(null)
    try {
      await uploadFile(orgId, selectedFile)
      clearSelection()
      setRefreshKey((value) => value + 1)
      setNotice({ message: '파일을 올렸어요.' })
    } catch (error) {
      setNotice({ error: true, message: '파일을 올리지 못했어요. ' + error.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="dashboard-placeholder" aria-busy={uploading}>
      <h1>파일</h1>
      <FileList key={refreshKey} orgId={orgId} />
      <div className="file-selection-actions">
        <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}>파일 선택</button>
        {selectedFile && (
          <button type="button" className="file-selection-cancel" disabled={uploading} onClick={() => { clearSelection(); setNotice(null) }}>선택 취소</button>
        )}
      </div>
      <input ref={fileInputRef} type="file" hidden disabled={uploading}
        onChange={(event) => { setSelectedFile(event.target.files[0] ?? null); setNotice(null) }} />
      {selectedFile && <p>선택한 파일: {selectedFile.name}</p>}
      {fileTooLarge && <p role="alert" id="file-size-error">100MB 이하의 파일만 올릴 수 있어요.</p>}
      <button type="button" disabled={!selectedFile || fileTooLarge || uploading}
        aria-describedby={fileTooLarge ? 'file-size-error' : undefined} onClick={handleUpload}>
        {uploading ? '올리는 중…' : '업로드'}
      </button>
      {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
    </section>
  )
}
