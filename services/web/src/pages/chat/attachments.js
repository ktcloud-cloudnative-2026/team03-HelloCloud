import { supportsPreview } from '../filePreview.js'

// 서버(chat.service.ts MAX_ATTACHMENTS)와 같은 값
export const MAX_ATTACHMENTS = 5

// 이미지는 채널 안에서 바로, PDF는 새 탭으로 미리 본다. 나머지는 내려받는다
export function previewKind(contentType) {
  if (!supportsPreview(contentType)) return 'download'
  return contentType.startsWith('image/') ? 'inline' : 'tab'
}

// 파일 목록 · 업로드 응답을 메시지 첨부 모양으로 바꾼다
export function toAttachment(file) {
  return {
    fileId: String(file.id),
    name: file.name,
    contentType: file.contentType || 'application/octet-stream',
  }
}

// 서명된 주소만 연다. javascript: 같은 주소는 막는다
export function safeUrl(url) {
  const target = new URL(url)
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('파일 주소를 확인해 주세요.')
  return target.href
}

export function attachmentErrorMessage(error) {
  if (error.status === 403) return '이 파일을 볼 권한이 없어요.'
  if (error.status === 404 || error.status === 409) return '파일이 지워졌거나 아직 다 올라가지 않았어요.'
  return error.message
}
