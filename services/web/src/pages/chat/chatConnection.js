// chat WebSocket 연결 하나를 관리한다(docs/api/chat.md WebSocket).
// - 연결되면 로그인 토큰으로 AUTH, 구독 중인 채널을 다시 SUBSCRIBE한다
// - 끊기면 점점 늘어나는 간격(최대 10초)으로 다시 연결한다. 화면은 SUBSCRIBED를 받을 때마다
//   마지막 seq 이후를 조회해 놓친 메시지를 채운다(US-07)
// - 토큰이 만료되기 1분 전에 새 토큰으로 AUTH를 다시 보내 연결을 이어 간다
// - 조직에서 내보내지면(Membership revoked) 다시 연결하지 않는다(US-04)

const REFRESH_BEFORE_MS = 60_000
const MAX_BACKOFF_MS = 10_000

function tokenExpiresAt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000
  } catch {
    return null
  }
}

export function chatSocketUrl(location = window.location) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/api/chat/ws`
}

export function createChatConnection({
  url,
  getToken,
  WebSocketImpl = globalThis.WebSocket,
  onStatus = () => {},
  onSubscribed = () => {},
  onMessage = () => {},
  onError = () => {},
  onRevoked = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
}) {
  const channels = new Set()
  let ws = null
  let authenticated = false
  let attempt = 0
  let stopped = false
  let reconnectTimer = null
  let refreshTimer = null

  const send = (message) => {
    if (ws && ws.readyState === WebSocketImpl.OPEN) ws.send(JSON.stringify(message))
  }

  async function authenticate() {
    const token = await getToken()
    if (!token) {
      onStatus('offline')
      return
    }
    send({ type: 'AUTH', token })

    clearTimer(refreshTimer)
    const expiresAt = tokenExpiresAt(token)
    if (expiresAt) {
      refreshTimer = setTimer(authenticate, Math.max(expiresAt - now() - REFRESH_BEFORE_MS, 5_000))
    }
  }

  function handle(message) {
    switch (message.type) {
      case 'AUTH_REQUIRED':
        authenticate()
        break
      case 'AUTH_OK':
        attempt = 0
        if (!authenticated) {
          authenticated = true
          onStatus('connected')
          for (const channelId of channels) send({ type: 'SUBSCRIBE', channelId })
        }
        break
      case 'SUBSCRIBED':
        onSubscribed(message.channelId)
        break
      case 'MESSAGE_CREATED':
        onMessage(message.channelId, message.data)
        break
      case 'ERROR':
        onError(message.code, message.message)
        break
      default:
        break
    }
  }

  function connect() {
    if (stopped) return
    onStatus(attempt === 0 ? 'connecting' : 'reconnecting')
    authenticated = false
    ws = new WebSocketImpl(url)
    ws.onmessage = (event) => {
      try {
        handle(JSON.parse(event.data))
      } catch {
        // 형식이 틀린 메시지는 무시한다
      }
    }
    ws.onclose = (event) => {
      clearTimer(refreshTimer)
      if (stopped) return
      if (event.reason === 'Membership revoked') {
        stopped = true
        onStatus('revoked')
        onRevoked()
        return
      }
      onStatus('reconnecting')
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
      attempt += 1
      reconnectTimer = setTimer(connect, delay)
    }
  }

  connect()

  return {
    subscribe(channelId) {
      channels.add(channelId)
      if (authenticated) send({ type: 'SUBSCRIBE', channelId })
    },
    unsubscribe(channelId) {
      channels.delete(channelId)
      if (authenticated) send({ type: 'UNSUBSCRIBE', channelId })
    },
    close() {
      stopped = true
      clearTimer(reconnectTimer)
      clearTimer(refreshTimer)
      ws?.close()
    },
  }
}
