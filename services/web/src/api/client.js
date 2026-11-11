
export async function apiRequest(path, options = {}) {
  const { headers, ...restOptions } = options

  // 개발용 임시 토큰: Keycloak 연동 전까지 브라우저 콘솔에서
  // localStorage.setItem('devToken', '<access_token>') 으로 넣는다. 연동되면 삭제
  const token = localStorage.getItem('devToken')

  const response = await fetch(path, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('json')
    ? await response.json()
    : null

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `API 요청 실패 (${response.status})`

    throw new Error(message)
  }

  return data
}