import { apiRequest } from './client'

export function getChannels(orgId) {
  return apiRequest(`/api/chat/channels?${new URLSearchParams({ orgId })}`)
}

export function createChannel(orgId, name) {
  return apiRequest('/api/chat/channels', {
    method: 'POST',
    body: JSON.stringify({ orgId, name }),
  })
}

export function getMessages(channelId, after = 0, limit = 100) {
  const query = new URLSearchParams({ after, limit })
  return apiRequest(`/api/chat/channels/${encodeURIComponent(channelId)}/messages?${query}`)
}

// clientMessageId는 같은 메시지를 다시 보내도 한 번만 저장되게 하는 값이다
export function sendMessage(channelId, text, { acknowledgementUserIds = [], attachments = [] } = {}) {
  return apiRequest(`/api/chat/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ clientMessageId: crypto.randomUUID(), text, acknowledgementUserIds, attachments }),
  })
}

const messagePath = (id) => `/api/chat/messages/${encodeURIComponent(id)}`

export function getAcknowledgements(messageId) {
  return apiRequest(`${messagePath(messageId)}/acknowledgements`)
}

export function confirmMessage(messageId) {
  return apiRequest(`${messagePath(messageId)}/acknowledgements`, { method: 'POST' })
}

export function addReaction(messageId, emoji) {
  return apiRequest(`${messagePath(messageId)}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  })
}

export function removeReaction(messageId, emoji) {
  return apiRequest(`${messagePath(messageId)}/reactions/${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
  })
}

export function registerDecision(messageId) {
  return apiRequest(`${messagePath(messageId)}/decision`, { method: 'POST' })
}

export function getDecisions(orgId) {
  return apiRequest(`/api/chat/decisions?${new URLSearchParams({ orgId })}`)
}
