const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const PREVIEW_LENGTH = 40

export function relativeTime(iso, now) {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  if (diff < MINUTE) return '방금 전'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`
  return `${Math.floor(diff / DAY)}일 전`
}

function preview(text) {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
}

// 활동 기록 API가 따로 없어서 채팅 메시지 · 파일 · 고정 메시지를 시간순으로 합친다
export function buildActivities({ messages, files, decisions, channels, nameOf, limit = 5 }) {
  const channelName = Object.fromEntries(channels.map((c) => [c.id, c.name]))
  const activities = [
    ...messages.map((m) => ({
      id: `message:${m.id}`,
      kind: 'message',
      name: nameOf(m.senderId),
      action: `#${channelName[m.channelId] ?? '채널'}에 메시지를 남겼습니다.`,
      detail: m.text ? preview(m.text) : '파일 첨부',
      at: m.createdAt,
    })),
    ...files.map((f) => ({
      id: `file:${f.id}`,
      kind: 'file',
      name: nameOf(f.uploadedBy),
      action: '파일을 공유했습니다.',
      detail: f.name,
      at: f.createdAt,
    })),
    ...decisions.map((d) => ({
      id: `decision:${d.id}`,
      kind: 'decision',
      name: nameOf(d.registeredBy),
      action: '메시지를 고정했습니다.',
      detail: preview(d.text),
      at: d.registeredAt,
    })),
  ]
  return activities
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
    .map((a) => ({ ...a, subject: subjectOf(a.name) }))
}

// "나님이"가 되지 않게 문장 주어를 따로 만든다
function subjectOf(name) {
  return name === '나' ? '내가' : `${name}님이`
}
