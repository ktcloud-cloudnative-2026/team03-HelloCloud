import { useEffect, useRef, useState } from 'react'
import { listFiles, uploadFile } from '../../api/files'
import { uploadValidationMessage } from '../fileRules.js'
import { MAX_ATTACHMENTS, toAttachment } from './attachments'

// 조직 파일에서 고르거나 새로 올려 메시지에 붙일 파일을 고른다
function AttachPicker({ orgId, selected, onChange }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let ignore = false
    listFiles(orgId, 0, 20)
      .then((data) => !ignore && setFiles(data.items))
      .catch((e) => !ignore && setNotice(`파일 목록을 불러오지 못했어요: ${e.message}`))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [orgId])

  const isSelected = (fileId) => selected.some((a) => a.fileId === fileId)
  const full = selected.length >= MAX_ATTACHMENTS

  const toggle = (file) => {
    const attachment = toAttachment(file)
    onChange(
      isSelected(attachment.fileId)
        ? selected.filter((a) => a.fileId !== attachment.fileId)
        : [...selected, attachment],
    )
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = uploadValidationMessage(file)
    if (problem) {
      setNotice(problem)
      return
    }
    setUploading(true)
    setNotice('')
    try {
      const uploaded = await uploadFile(orgId, file)
      const record = { id: uploaded.id, name: uploaded.name ?? file.name, contentType: uploaded.contentType ?? file.type }
      setFiles((prev) => [record, ...prev])
      if (!full) onChange([...selected, toAttachment(record)])
    } catch (e) {
      setNotice(`파일을 올리지 못했어요: ${e.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <fieldset className="chat-attach-picker">
      <legend>붙일 파일 (최대 {MAX_ATTACHMENTS}개)</legend>
      <button type="button" className="chat-chip" disabled={uploading || full} onClick={() => inputRef.current?.click()}>
        {uploading ? '올리는 중…' : '＋ 새 파일 올리기'}
      </button>
      <input ref={inputRef} type="file" hidden onChange={handleUpload} />
      {notice && <p className="chat-empty">{notice}</p>}
      {loading && <p className="chat-empty">불러오는 중…</p>}
      {!loading && files.length === 0 && <p className="chat-empty">조직에 올린 파일이 없어요.</p>}
      <div className="chat-attach-files">
        {files.map((file) => (
          <label key={file.id}>
            <input
              type="checkbox"
              checked={isSelected(String(file.id))}
              disabled={!isSelected(String(file.id)) && full}
              onChange={() => toggle(file)}
            />
            {file.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default AttachPicker
