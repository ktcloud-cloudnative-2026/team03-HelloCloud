import { apiRequest } from './client'

// 초대 링크 생성 (OWNER만)
export async function createInvitation(orgId) {
  return apiRequest(`/api/orgs/${orgId}/invitations`, { method: 'POST' })
}

// 초대 수락
export async function acceptInvitation(token) {
  return apiRequest(`/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  })
}
