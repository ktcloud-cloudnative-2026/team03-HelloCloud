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
export function sendMessage(channelId, text, clientMessageId = crypto.randomUUID()) {
  return apiRequest(`/api/chat/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ clientMessageId, text }),
  })
}
