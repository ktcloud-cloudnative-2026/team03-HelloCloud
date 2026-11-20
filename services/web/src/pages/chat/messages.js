// 내가 보낸 메시지는 HTTP 응답과 WebSocket으로 두 번 온다. 놓친 메시지를 다시 받을 때도
// 겹칠 수 있으므로 id로 한 번만 남기고 seq 순서로 정렬한다.
export function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

// 놓친 메시지는 "마지막으로 받은 seq 다음부터" 조회한다. seq는 건너뛸 수 있어 개수로 세지 않는다.
export function lastSeq(messages) {
  return messages.length ? messages[messages.length - 1].seq : 0
}

const PAGE_SIZE = 100
const MAX_PAGES = 5

// after 이후 메시지를 페이지로 끝까지(최대 500개) 받는다
export async function fetchAfter(getMessages, channelId, after) {
  let collected = []
  let cursor = after
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await getMessages(channelId, cursor, PAGE_SIZE)
    collected = collected.concat(batch)
    if (batch.length < PAGE_SIZE) break
    cursor = batch[batch.length - 1].seq
  }
  return collected
}

export function formatTime(iso, now = new Date()) {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay ? time : `${date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${time}`
}

// 서버(chat.service.ts ALLOWED_REACTIONS)와 같은 목록
export const REACTIONS = ['👍', '✅', '❤️', '😂', '🎉', '👀']

export function hasReacted(message, emoji, userId) {
  return Boolean(message.reactions?.find((r) => r.emoji === emoji)?.userIds.includes(userId))
}

// 확인 요청 표시에 필요한 값. 확인 요청이 없는 메시지는 null
export function ackState(message, userId) {
  const required = message.acknowledgement?.requiredUserIds ?? []
  if (required.length === 0) return null
  const confirmed = new Set((message.acknowledgement?.confirmed ?? []).map((c) => c.userId))
  return {
    total: required.length,
    confirmedCount: required.filter((id) => confirmed.has(id)).length,
    isSender: message.senderId === userId,
    needsMyConfirm: required.includes(userId) && !confirmed.has(userId),
    confirmedByMe: confirmed.has(userId),
  }
}
