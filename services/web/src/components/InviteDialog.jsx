import { useCallback, useEffect, useRef, useState } from 'react'
import { createInvitation } from '../api/invitations'
import './InviteDialog.css'

function formatExpiry(expiresAt) {
  return new Date(expiresAt).toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function InviteDialog({ orgId, onClose }) {
  const [invitation, setInvitation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState('idle')
  const inputRef = useRef(null)

  const create = useCallback(async () => {
    setLoading(true)
    setError('')
    setCopyState('idle')

    try {
      setInvitation(await createInvitation(orgId))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  // 창을 열면 바로 링크를 만든다. 링크는 한 번만 쓸 수 있어 열 때마다 새로 만든다.
  useEffect(() => {
    let ignore = false
    createInvitation(orgId)
      .then((data) => !ignore && setInvitation(data))
      .catch((e) => !ignore && setError(e.message))
    return () => {
      ignore = true
    }
  }, [orgId])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.inviteUrl)
      setCopyState('copied')
    } catch {
      // http 주소에서는 브라우저가 클립보드를 막을 수 있다.
      inputRef.current?.select()
      setCopyState('manual')
    }
  }

  const waiting = loading || (!invitation && !error)

  return (
    <div className="invite-dialog-backdrop" onClick={onClose}>
      <div
        className="invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="invite-dialog-header">
          <h2 id="invite-dialog-title">팀원 초대</h2>
          <button
            type="button"
            className="invite-dialog-close"
            aria-label="닫기"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <p className="invite-dialog-description">
          이 링크를 받은 사람은 MEMBER로 가입해요. 한 번만 쓸 수 있어요.
        </p>

        {waiting && <p role="status">초대 링크를 만드는 중...</p>}

        {error && !loading && (
          <p className="invite-dialog-error" role="alert">
            초대 링크를 만들지 못했어요: {error}
          </p>
        )}

        {invitation && !loading && (
          <>
            <div className="invite-dialog-link">
              <input
                ref={inputRef}
                type="text"
                readOnly
                value={invitation.inviteUrl}
                aria-label="초대 링크"
                onFocus={(e) => e.target.select()}
              />
              <button type="button" onClick={handleCopy}>
                {copyState === 'copied' ? '복사됨' : '복사'}
              </button>
            </div>
            {copyState === 'manual' && (
              <p className="invite-dialog-hint">
                자동 복사가 막혔어요. Ctrl+C로 복사해 주세요.
              </p>
            )}
            <p className="invite-dialog-expiry">
              만료: {formatExpiry(invitation.expiresAt)}
            </p>
          </>
        )}

        <div className="invite-dialog-actions">
          <button
            type="button"
            className="invite-dialog-secondary"
            onClick={create}
            disabled={waiting}
          >
            새 링크 만들기
          </button>
          <button
            type="button"
            className="invite-dialog-primary"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

export default InviteDialog
