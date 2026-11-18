import { useEffect, useRef } from 'react'

export default function FileDeleteDialog({ file, busy, onCancel, onConfirm }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  return (
    <dialog ref={dialog} className="file-delete-dialog" aria-labelledby="file-delete-title"
      aria-describedby="file-delete-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}>
      <h2 id="file-delete-title">파일을 삭제할까요?</h2>
      <p className="file-delete-name">{file.name}</p>
      <p id="file-delete-description">삭제한 파일은 복구할 수 없어요.</p>
      <div className="file-delete-dialog-actions">
        <button type="button" className="file-button file-button-outline" autoFocus disabled={busy} onClick={onCancel}>취소</button>
        <button type="button" className="file-button file-button-danger-solid" disabled={busy} onClick={onConfirm}>
          {busy ? '삭제 중…' : '삭제'}
        </button>
      </div>
    </dialog>
  )
}
