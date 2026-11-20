// chat에는 읽음 표시가 없어서, 채널마다 "어디까지 봤는지"를 이 브라우저에만 기억한다.
// 다른 브라우저나 시크릿 창에서는 따로 센다(발표 시연용으로 정한 방식).

export function seenKey(userId, channelId) {
  return `ideaconnection.chat.seen.${userId}.${channelId}`
}

// 시크릿 창이나 차단 설정에서는 localStorage에 손대기만 해도 오류가 날 수 있다
export function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readSeen(storage, userId, channelId) {
  try {
    const value = storage.getItem(seenKey(userId, channelId))
    if (value === null) return null
    const seq = Number(value)
    return Number.isFinite(seq) ? seq : null
  } catch {
    return null
  }
}

export function markSeen(storage, userId, channelId, seq) {
  const current = readSeen(storage, userId, channelId)
  if (current !== null && current >= seq) return
  try {
    storage.setItem(seenKey(userId, channelId), String(seq))
  } catch {
    // 저장하지 못하면 다음에 다시 센다
  }
}

// 처음 보는 채널은 지금까지 다 본 것으로 시작한다. 그러지 않으면 첫 접속에 기존 메시지가 전부 새 메시지가 된다
export function countUnread(storage, userId, channels) {
  let total = 0
  for (const channel of channels) {
    const seen = readSeen(storage, userId, channel.id)
    if (seen === null) {
      markSeen(storage, userId, channel.id, channel.lastSeq)
      continue
    }
    total += Math.max(0, channel.lastSeq - seen)
  }
  return total
}
