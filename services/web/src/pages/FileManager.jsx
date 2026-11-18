import { useRef, useState } from 'react'
import { getCurrentUserId } from '../auth/keycloak'
import { uploadFile } from '../api/files'
import FileList from './FileList'

const maxUploadBytes = 100_000_000

export default function FileManager({ orgId, organizationRole }) {
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
    <section className="file-manager" aria-busy={uploading}>
      <header className="file-manager-header">
        <div><span className="file-manager-eyebrow">WORKSPACE FILES</span><h1>파일 관리</h1>
          <p>팀의 자료를 한곳에 모으고 공유하세요.</p></div>
        <span className="file-manager-limit">파일당 최대 100MB</span>
      </header>
      <div className="file-upload-panel">
        <div className="file-upload-copy"><span className="file-upload-symbol" aria-hidden="true">↑</span>
          <div><strong>새 파일 공유하기</strong><p>파일을 선택한 뒤 업로드해 주세요.</p></div></div>
        <div className="file-selection-actions">
          <button type="button" className="file-button file-button-outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>파일 선택</button>
          {selectedFile && <button type="button" className="file-button file-button-cancel" disabled={uploading} onClick={() => { clearSelection(); setNotice(null) }}>선택 취소</button>}
          <button type="button" className="file-button file-button-primary" disabled={!selectedFile || fileTooLarge || uploading}
            aria-describedby={fileTooLarge ? 'file-size-error' : undefined} onClick={handleUpload}>{uploading ? '올리는 중…' : '업로드'}</button>
        </div>
        <input ref={fileInputRef} type="file" hidden disabled={uploading}
          onChange={(event) => { setSelectedFile(event.target.files[0] ?? null); setNotice(null) }} />
        {selectedFile && <p>선택한 파일: {selectedFile.name}</p>}
        {fileTooLarge && <p role="alert" id="file-size-error">100MB 이하의 파일만 올릴 수 있어요.</p>}
        {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      </div>
      <FileList key={refreshKey} orgId={orgId} organizationRole={organizationRole} currentUserId={getCurrentUserId()} />
    </section>
  )
}
