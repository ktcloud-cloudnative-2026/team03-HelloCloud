
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