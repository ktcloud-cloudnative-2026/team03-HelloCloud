import { formatTime } from './messages'

// 조직의 고정 메시지 목록(API 이름은 decisions). "원본 보기"는 그 채널로 옮겨 원본 메시지를 보여 준다(US-10)
function DecisionLog({ decisions, channels, nameOf, onOpenSource }) {
  const channelName = (id) => channels.find((c) => c.id === id)?.name ?? '삭제된 채널'

  if (decisions.length === 0) {
    return (
      <p className="chat-empty chat-decisions-empty">
        아직 고정된 메시지가 없어요. 메시지 아래 &quot;📌 고정하기&quot;를 누르면 여기에 모여요.
      </p>
    )
  }

  return (
    <ol className="chat-decisions">
      {decisions.map((decision) => (
        <li key={decision.id}>
          <p className="chat-decision-text">{decision.text}</p>
          <div className="chat-decision-meta">
            <span>
              {nameOf(decision.authorId)}의 메시지 · {nameOf(decision.registeredBy)}이(가) 고정 ·{' '}
              <time dateTime={decision.registeredAt}>{formatTime(decision.registeredAt)}</time>
            </span>
            <button type="button" className="chat-chip" onClick={() => onOpenSource(decision)}>
              # {channelName(decision.sourceChannelId)}에서 원본 보기
            </button>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default DecisionLog
