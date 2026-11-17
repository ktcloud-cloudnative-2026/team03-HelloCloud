import { useEffect, useState } from 'react'
import { getMembers, removeMember } from '../api/members'
import { getCurrentUserId } from '../auth/keycloak'
import './MemberList.css'

const PAGE_SIZE = 20
const ROLE_LABELS = { OWNER: '소유자', MEMBER: '멤버' }

function MemberList({ organization, onLeave }) {
  const myId = getCurrentUserId()
  const isOwner = organization.role === 'OWNER'

  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let ignore = false
    getMembers(organization.id, 0, PAGE_SIZE)
      .then((data) => {
        if (ignore) return
        setMembers(data.items)
        setTotal(data.total)
      })
      .catch((e) => !ignore && setLoadError(e.message))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [organization.id])

  // 내보낸 만큼 뒤 페이지가 당겨지므로, 지금 개수로 페이지를 다시 계산하고 겹치는 멤버는 뺀다.
  const handleLoadMore = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getMembers(
        organization.id,
        Math.floor(members.length / PAGE_SIZE),
        PAGE_SIZE,
      )
      setMembers((prev) => {
        const known = new Set(prev.map((m) => m.userId))
        return [...prev, ...data.items.filter((m) => !known.has(m.userId))]
      })
      setTotal(data.total)
    } catch (e) {
      setLoadError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (member) => {
    if (!window.confirm(`${member.displayName} 님을 조직에서 내보낼까요?`)) return

    setBusyId(member.userId)
    setActionError('')
    try {
      await removeMember(organization.id, member.userId)
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId))
      setTotal((prev) => prev - 1)
    } catch (e) {
      setActionError(`내보내지 못했어요: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const handleLeave = async () => {
    const message = `${organization.name} 조직에서 나갈까요? 다시 들어오려면 새 초대 링크가 필요해요.`
    if (!window.confirm(message)) return

    setBusyId(myId)
    setActionError('')
    try {
      await removeMember(organization.id, myId)
      onLeave()
    } catch (e) {
      setActionError(`조직에서 나가지 못했어요: ${e.message}`)
      setBusyId(null)
    }
  }

  return (
    <section className="member-section" aria-labelledby="member-title">
      <div className="member-heading">
        <h1 id="member-title">멤버</h1>
        {!loading && !loadError && <span>{total}명</span>}
      </div>

      {actionError && (
        <p className="member-error" role="alert">
          {actionError}
        </p>
      )}

      {loadError && (
        <p className="member-error" role="alert">
          멤버 목록을 불러오지 못했어요: {loadError}
        </p>
      )}

      <ul className="member-list">
        {members.map((member) => {
          const isMe = member.userId === myId
          return (
            <li className="member-item" key={member.userId}>
              <span className="member-avatar" aria-hidden="true">
                {member.displayName?.slice(0, 1) || '?'}
              </span>
              <span className="member-name">
                <strong>{member.displayName}</strong>
                {isMe && <span className="member-me">나</span>}
              </span>
              <span className="member-role">
                {ROLE_LABELS[member.role] ?? member.role}
              </span>
              {isOwner && !isMe && member.role !== 'OWNER' && (
                <button
                  type="button"
                  className="member-remove"
                  onClick={() => handleRemove(member)}
                  disabled={busyId !== null}
                >
                  {busyId === member.userId ? '내보내는 중...' : '내보내기'}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {loading && <p role="status">멤버 목록을 불러오는 중...</p>}

      {!loading && members.length < total && (
        <button
          type="button"
          className="member-more"
          onClick={handleLoadMore}
        >
          더 보기
        </button>
      )}

      {!isOwner && myId && (
        <div className="member-leave-row">
          <button
            type="button"
            className="member-leave"
            onClick={handleLeave}
            disabled={busyId !== null}
          >
            {busyId === myId ? '나가는 중...' : '조직 나가기'}
          </button>
        </div>
      )}
    </section>
  )
}

export default MemberList
