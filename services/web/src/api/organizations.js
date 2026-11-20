
import { apiRequest } from './client'

// 조직 목록 조회
export async function getOrganizations(page = 0, size = 20) {
  return apiRequest(`/api/orgs?page=${page}&size=${size}`)
}

// 조직 생성
export async function createOrganization(name) {
  return apiRequest('/api/orgs', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}
// 조직 삭제(OWNER만). 멤버 · 초대도 함께 지워지고 되돌릴 수 없다
export async function deleteOrganization(orgId) {
  return apiRequest(`/api/orgs/${orgId}`, { method: 'DELETE' })
}
