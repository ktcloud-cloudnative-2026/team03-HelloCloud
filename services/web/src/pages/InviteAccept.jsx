import { useState } from 'react'
import { acceptInvitation } from '../api/invitations'
import BrandIcon from '../brand/BrandIcon.jsx'
import './InviteAccept.css'

// 이 코드들은 다시 눌러도 결과가 같으므로 수락 버튼을 숨긴다.
const FINAL_MESSAGES = {
  INVITATION_NOT_FOUND: '초대 링크를 찾을 수 없어요. 주소를 다시 확인해 주세요.',
  INVITATION_ALREADY_USED:
    '이미 사용한 초대 링크예요. 초대한 사람에게 새 링크를 요청해 주세요.',
  INVITATION_EXPIRED:
    '기한이 지난 초대 링크예요. 초대한 사람에게 새 링크를 요청해 주세요.',
  ALREADY_MEMBER: '이미 이 조직의 멤버예요.',
}

function InviteAccept({ token, onDone }) {
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState(null)

  const handleAccept = async () => {
    setAccepting(true)
    setError(null)

    try {
      await acceptInvitation(token)
      onDone()
    } catch (e) {
      const finalMessage = FINAL_MESSAGES[e.code]
      setError({
        message: finalMessage ?? `초대를 수락하지 못했어요: ${e.message}`,
        final: Boolean(finalMessage),
      })
      setAccepting(false)
    }
  }

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-brand">
          <BrandIcon size={26} />
          <span>IdeaConnection</span>
        </div>

        <span className="invite-step">INVITATION</span>
        <h1>조직 초대를 받았어요</h1>
        <p className="invite-description">
          수락하면 이 조직의 멤버로 함께 일할 수 있어요.
        </p>

        {error && (
          <p className="invite-error" role="alert">
            <span aria-hidden="true">⚠</span> {error.message}
          </p>
        )}

        {!error?.final && (
          <button
            type="button"
            className="invite-accept"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? '수락하는 중...' : '초대 수락하기'}
          </button>
        )}

        <button
          type="button"
          className={error?.final ? 'invite-accept' : 'invite-later'}
          onClick={onDone}
          disabled={accepting}
        >
          {error?.final ? '내 조직으로 가기' : '나중에 할게요 → 내 조직으로'}
        </button>
      </section>
    </main>
  )
}

export default InviteAccept
