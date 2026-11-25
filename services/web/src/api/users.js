import { apiRequest } from './client'

// 내 프로필(id, email, displayName). 첫 로그인이면 서버가 만든다
export async function getMe() {
  return apiRequest('/api/users/me')
}

// 앱에서 보일 내 이름 바꾸기. 멤버 목록 · 채팅 이름에 함께 쓰인다
export async function updateMe(displayName) {
  return apiRequest('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  })
}
