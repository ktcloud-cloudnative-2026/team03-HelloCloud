import { useState } from 'react'
import {
  addReaction,
  confirmMessage,
  getAcknowledgements,
  registerDecision,
  removeReaction,
} from '../../api/chat'
import AttachmentItem from './AttachmentItem'
import { REACTIONS, ackState, formatTime, hasReacted } from './messages'

function MessageItem({ message, myId, names, decided, focused, onUpdated, onDecided, onUnpin, onError }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [ackList, setAckList] = useState(null)
  const [busy, setBusy] = useState(false)

  const mine = message.senderId === myId
  const nameOf = (id) => (id === myId ? '나' : names[id] ?? '알 수 없는 사용자')
  const ack = ackState(message, myId)

  const run = async (action, failMessage) => {
    setBusy(true)
    try {
      const updated = await action()
      if (updated) onUpdated(updated)
    } catch (e) {
      onError(`${failMessage}: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // 취소(DELETE)는 바뀐 메시지를 돌려주지 않으므로 MESSAGE_UPDATED로 화면이 바뀐다
  const toggleReaction = (emoji) => {
    setPickerOpen(false)
    run(
      () => (hasReacted(message, emoji, myId) ? removeReaction(message.id, emoji) : addReaction(message.id, emoji)),
      '이모지를 바꾸지 못했어요',
    )
  }

  const handleDecide = async () => {
    setBusy(true)
    try {
      onDecided(await registerDecision(message.id))
    } catch (e) {
      onError(`메시지를 고정하지 못했어요: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleUnpin = async () => {
    setBusy(true)
    try {
      await onUnpin(message.id)
    } finally {
      setBusy(false)
    }
  }

  const toggleAckList = async () => {
    if (ackList) {
      setAckList(null)
      return
    }
    try {
      const data = await getAcknowledgements(message.id)
      setAckList(data.users)
    } catch (e) {
      onError(`확인 현황을 불러오지 못했어요: ${e.message}`)
    }
  }

  return (
    <li
      className={`${mine ? 'mine' : ''} ${focused ? 'focused' : ''} ${pickerOpen ? 'picking' : ''}`}
      data-message-id={message.id}
    >
      <div className="chat-meta">
        <strong>{nameOf(message.senderId)}</strong>
        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        {decided && (
          <span className="chat-pinned" title="고정된 메시지" aria-label="고정된 메시지">
            📌
          </span>
        )}
        {/* 디스코드처럼 메시지에 마우스를 올리면 뜨는 도구 */}
        <span className="chat-message-actions">
          <button
            type="button"
            aria-label="이모지 달기"
            title="이모지 달기"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            ☺
          </button>
          {decided ? (
            <button
              type="button"
              className="pinned"
              aria-label="고정 해제"
              title="고정 해제"
              disabled={busy}
              onClick={handleUnpin}
            >
              📌
            </button>
          ) : (
            <button type="button" aria-label="고정하기" title="고정하기" disabled={busy} onClick={handleDecide}>
              📌
            </button>
          )}
        </span>
      </div>
      {message.text && <p className="chat-text">{message.text}</p>}
      {message.attachments?.length > 0 && (
        <ul className="chat-attachments">
          {message.attachments.map((attachment) => (
            <AttachmentItem key={attachment.fileId} attachment={attachment} onError={onError} />
          ))}
        </ul>
      )}

      {ack && (
        <div className="chat-ack">
          {ack.isSender && (
            <button type="button" className="chat-chip" onClick={toggleAckList}>
              확인 {ack.confirmedCount}/{ack.total}
            </button>
          )}
          {ack.needsMyConfirm && (
            <button
              type="button"
              className="chat-chip primary"
              disabled={busy}
              onClick={() => run(() => confirmMessage(message.id), '확인 처리하지 못했어요')}
            >
              확인 요청 · 확인했어요
            </button>
          )}
          {ack.confirmedByMe && !ack.isSender && <span className="chat-chip done">확인함</span>}
          {ackList && (
            <ul className="chat-ack-list">
              {ackList.map((user) => (
                <li key={user.userId}>
                  {nameOf(user.userId)} — {user.confirmedAt ? `확인 ${formatTime(user.confirmedAt)}` : '아직 안 봄'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {((message.reactions ?? []).length > 0 || pickerOpen) && (
        <div className="chat-reactions">
          {(message.reactions ?? []).map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              className={`chat-chip ${reaction.userIds.includes(myId) ? 'active' : ''}`}
              title={reaction.userIds.map(nameOf).join(', ')}
              disabled={busy}
              onClick={() => toggleReaction(reaction.emoji)}
            >
              {reaction.emoji} {reaction.userIds.length}
            </button>
          ))}
          {pickerOpen && (
            <span className="chat-reaction-picker">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => toggleReaction(emoji)}>
                  {emoji}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

export default MessageItem
