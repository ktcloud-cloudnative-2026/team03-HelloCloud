
export async function apiRequest(path, options = {}) {
  const { headers, ...restOptions } = options

  const response = await fetch(path, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
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