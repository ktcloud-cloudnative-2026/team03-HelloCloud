import { getAccessToken, login } from '../auth/keycloak'

export async function apiRequest(path, options = {}) {
  const { headers, ...restOptions } = options

  const token = await getAccessToken()

  const response = await fetch(path, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
  })

  // 토큰을 보냈는데도 401이면 서버 설정 문제다. 다시 로그인시키면 같은 401로 무한히 오가므로 에러만 보여준다.
  if (response.status === 401 && !token) {
    await login()
  }

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('json')
    ? await response.json()
    : null

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `API 요청 실패 (${response.status})`

    // 화면이 상황별로 다른 안내를 하려면 서버가 준 code가 필요하다.
    const error = new Error(message)
    error.status = response.status
    error.code = data?.code
    throw error
  }

  return data
}
