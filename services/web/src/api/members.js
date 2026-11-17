import { apiRequest } from './client'

// 멤버 목록 조회
export async function getMembers(orgId, page = 0, size = 20) {
  return apiRequest(`/api/orgs/${orgId}/members?page=${page}&size=${size}`)
}

// 멤버 내보내기. 내 userId를 넣으면 조직 나가기
export async function removeMember(orgId, userId) {
  return apiRequest(
    `/api/orgs/${orgId}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  )
}
