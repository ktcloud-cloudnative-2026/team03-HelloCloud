import { apiRequest } from './client'

export function listFiles(orgId, page = 0, size = 20) {
  const query = new URLSearchParams({ orgId, page, size })
  return apiRequest(`/api/files?${query}`)
}

export async function uploadFile(orgId, file) {
  const pending = await apiRequest('/api/files', {
    method: 'POST',
    body: JSON.stringify({ orgId, name: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size }),
  })
  const response = await fetch(pending.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw new Error(`파일 업로드 실패 (${response.status})`)
  return apiRequest(`/api/files/${encodeURIComponent(pending.id)}/complete`, { method: 'POST' })
}

export function getDownloadUrl(id) {
  return apiRequest(`/api/files/${encodeURIComponent(id)}/download-url`)
}

export function getPreviewUrl(id) {
  return apiRequest(`/api/files/${encodeURIComponent(id)}/preview-url`)
}

export function deleteFile(id) {
  return apiRequest(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
