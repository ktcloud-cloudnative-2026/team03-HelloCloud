const previewTypes = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf',
])

export function supportsPreview(contentType) {
  return previewTypes.has(contentType)
}

export async function openFilePreview(file, { getPreviewUrl, openWindow }) {
  if (!supportsPreview(file.contentType)) throw new Error('이 형식은 다운로드해서 확인해 주세요.')
  // 클릭과 동시에 탭을 열어 비동기 요청 뒤의 팝업 차단을 피합니다.
  const tab = openWindow()
  if (!tab) throw new Error('브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.')
  try {
    tab.opener = null
    const { url } = await getPreviewUrl(file.id)
    const target = new URL(url)
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('미리보기 주소를 확인해 주세요.')
    if (!tab.closed) {
      const policy = tab.document.createElement('meta')
      policy.name = 'referrer'
      policy.content = 'no-referrer'
      tab.document.head.appendChild(policy)
      tab.location.replace(target.href)
    }
  } catch (error) {
    if (!tab.closed) tab.close()
    throw error
  }
}
