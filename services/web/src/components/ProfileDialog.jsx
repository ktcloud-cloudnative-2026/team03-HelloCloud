import { useEffect, useRef, useState } from 'react'
import { updateMe } from '../api/users'
import { initial, validDisplayName } from '../profile/name'
import './ProfileDialog.css'

export default function ProfileDialog({ me, onClose, onSaved }) {
  const dialog = useRef(null)
  const [name, setName] = useState(me.displayName ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const checked = validDisplayName(name)
    if (checked.error) {
      setError(checked.error)
      return
    }
    if (checked.value === me.displayName) {
      onClose()
      return
    }
    setSaving(true)
    setError('')
    try {
      onSaved(await updateMe(checked.value))
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="profile-dialog"
      aria-labelledby="profile-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) onClose()
      }}
    >
      <form onSubmit={handleSubmit}>
        <h2 id="profile-dialog-title">프로필</h2>
        <div className="profile-dialog-account">
          <span className="profile-dialog-avatar" aria-hidden="true">
            {initial(name || me.displayName)}
          </span>
          <span>{me.email}</span>
        </div>
        <label htmlFor="profile-display-name">이름</label>
        <input
          id="profile-display-name"
          value={name}
          maxLength={60}
          autoFocus
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="profile-dialog-help">조직 멤버 목록과 채팅에 이 이름으로 보여요.</p>
        {error && (
          <p className="profile-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="profile-dialog-actions">
          <button type="button" className="file-button file-button-outline" disabled={saving} onClick={onClose}>
            취소
          </button>
          <button type="submit" className="file-button file-button-primary" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
