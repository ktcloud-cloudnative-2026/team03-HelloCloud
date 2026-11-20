import { useCallback, useEffect, useRef, useState } from 'react'
import { createChannel, getChannels, getMessages, sendMessage } from '../api/chat'
import { getMembers } from '../api/members'
import { getAccessToken, getCurrentUserId } from '../auth/keycloak'
import { chatSocketUrl, createChatConnection } from './chat/chatConnection'
import { fetchAfter, formatTime, lastSeq, mergeMessages } from './chat/messages'
import './ChatPage.css'

const MAX_TEXT = 4000
const MAX_CHANNEL_NAME = 50
const STATUS_LABELS = {
  connecting: '연결 중',
  connected: '실시간 연결됨',
  reconnecting: '다시 연결하는 중',
  offline: '연결 안 됨',
  revoked: '연결 끊김',
}

function ChatPage({ organization }) {
  const myId = getCurrentUserId()
  const [channels, setChannels] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [names, setNames] = useState({})
  const [status, setStatus] = useState('connecting')
  const [revoked, setRevoked] = useState(false)
  const [error, setError] = useState('')
  const [newChannel, setNewChannel] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const connectionRef = useRef(null)
  const activeIdRef = useRef(null)
  const messagesRef = useRef([])
  const listRef = useRef(null)

  const applyMessages = useCallback((incoming) => {
    messagesRef.current = mergeMessages(messagesRef.current, incoming)
    setMessages(messagesRef.current)
  }, [])

  // 채널 목록과 보낸 사람 이름(멤버 목록)을 불러온다
  useEffect(() => {
    let ignore = false
    getChannels(organization.id)
      .then((data) => {
        if (ignore) return
        setChannels(data)
        setActiveId((current) => current ?? data[0]?.id ?? null)
      })
      .catch((e) => !ignore && setError(`채널을 불러오지 못했어요: ${e.message}`))
    getMembers(organization.id, 0, 100)
      .then((data) => {
        if (ignore) return
        setNames(Object.fromEntries(data.items.map((m) => [m.userId, m.displayName])))
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [organization.id])

  // WebSocket은 조직 화면에 있는 동안 하나만 연다
  useEffect(() => {
    const connection = createChatConnection({
      url: chatSocketUrl(),
      getToken: getAccessToken,
      onStatus: setStatus,
      // 처음 구독할 때와 다시 연결해 구독할 때 모두, 마지막 seq 이후를 받아 빈 곳을 채운다
      onSubscribed: (channelId) => {
        if (channelId !== activeIdRef.current) return
        fetchAfter(getMessages, channelId, lastSeq(messagesRef.current))
          .then((missed) => {
            if (channelId === activeIdRef.current) applyMessages(missed)
          })
          .catch((e) => setError(`메시지를 불러오지 못했어요: ${e.message}`))
      },
      onMessage: (channelId, message) => {
        if (channelId === activeIdRef.current) applyMessages([message])
      },
      onError: (code) => {
        if (code === 'CHANNEL_ACCESS_DENIED') setError('이 채널을 볼 권한이 없어요.')
      },
      onRevoked: () => setRevoked(true),
    })
    connectionRef.current = connection
    return () => connection.close()
  }, [organization.id, applyMessages])

  // 채널을 바꾸면 이전 구독을 끊고 새 채널을 구독한다. 메시지는 selectChannel에서 비운다
  useEffect(() => {
    activeIdRef.current = activeId
    if (!activeId) return undefined
    const connection = connectionRef.current
    connection?.subscribe(activeId)
    return () => connection?.unsubscribe(activeId)
  }, [activeId])

  // 맨 아래 근처에 있을 때만 새 메시지로 내려간다. 위 내용을 읽는 중이면 그대로 둔다
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120
    if (nearBottom || messages.at(-1)?.senderId === myId) list.scrollTop = list.scrollHeight
  }, [messages, myId])

  const selectChannel = (id) => {
    if (id === activeIdRef.current) return
    activeIdRef.current = id
    messagesRef.current = []
    setMessages([])
    setActiveId(id)
  }

  const handleCreateChannel = async (event) => {
    event.preventDefault()
    const name = newChannel.trim()
    if (!name) return
    setError('')
    try {
      const created = await createChannel(organization.id, name)
      setChannels((prev) => [...prev, created])
      selectChannel(created.id)
      setNewChannel('')
    } catch (e) {
      setError(`채널을 만들지 못했어요: ${e.message}`)
    }
  }

  const handleSend = async () => {
    const body = text.trim()
    if (!body || !activeId || sending) return
    setSending(true)
    setError('')
    try {
      const saved = await sendMessage(activeId, body)
      applyMessages([saved])
      setText('')
    } catch (e) {
      setError(`보내지 못했어요: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (event) => {
    // 한글 입력 중(조합 중) Enter는 글자 확정이라 보내지 않는다
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      handleSend()
    }
  }

  const activeChannel = channels.find((c) => c.id === activeId)

  return (
    <section className="chat-layout">
      <aside className="chat-channels" aria-label="채널 목록">
        <h2>채널</h2>
        <ul>
          {channels.map((channel) => (
            <li key={channel.id}>
              <button
                type="button"
                className={channel.id === activeId ? 'active' : ''}
                onClick={() => selectChannel(channel.id)}
              >
                # {channel.name}
              </button>
            </li>
          ))}
        </ul>
        {channels.length === 0 && <p className="chat-empty">아직 채널이 없어요.</p>}
        <form className="chat-new-channel" onSubmit={handleCreateChannel}>
          <input
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            maxLength={MAX_CHANNEL_NAME}
            placeholder="새 채널 이름"
            aria-label="새 채널 이름"
            disabled={revoked}
          />
          <button type="submit" disabled={!newChannel.trim() || revoked}>
            만들기
          </button>
        </form>
      </aside>

      <div className="chat-room">
        <header className="chat-room-header">
          <h1>{activeChannel ? `# ${activeChannel.name}` : '채팅'}</h1>
          <span className={`chat-status ${status}`} role="status">
            {STATUS_LABELS[status]}
          </span>
        </header>

        {revoked && (
          <p className="chat-alert" role="alert">
            이 조직에서 내보내져 채팅을 더 볼 수 없어요. 조직 선택 화면으로 돌아가 주세요.
          </p>
        )}
        {error && !revoked && (
          <p className="chat-alert" role="alert">
            {error}
          </p>
        )}

        <ol className="chat-messages" ref={listRef} aria-live="polite">
          {messages.map((message) => {
            const mine = message.senderId === myId
            return (
              <li key={message.id} className={mine ? 'mine' : ''}>
                <div className="chat-meta">
                  <strong>{mine ? '나' : names[message.senderId] ?? '알 수 없는 사용자'}</strong>
                  <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                </div>
                <p className="chat-text">{message.text}</p>
              </li>
            )
          })}
          {activeChannel && messages.length === 0 && (
            <li className="chat-empty">첫 메시지를 남겨 보세요.</li>
          )}
        </ol>

        <div className="chat-composer">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_TEXT}
            rows={2}
            placeholder={activeChannel ? `# ${activeChannel.name}에 메시지 보내기 (Shift+Enter 줄바꿈)` : '채널을 먼저 만들어 주세요'}
            aria-label="메시지"
            disabled={!activeChannel || revoked}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || !activeChannel || sending || revoked}
          >
            보내기
          </button>
        </div>
      </div>
    </section>
  )
}

export default ChatPage
