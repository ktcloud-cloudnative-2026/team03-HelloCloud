export const maxUploadBytes = 100_000_000

export function uploadValidationMessage(file) {
  if (!file) return null
  if (file.size < 1) return '빈 파일은 올릴 수 없어요. 내용이 있는 파일을 선택해 주세요.'
  if (file.size > maxUploadBytes) return '100MB 이하의 파일만 올릴 수 있어요.'
  if (!file.name?.trim() || file.name.length > 255 || Array.from(file.name).some((char) => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159))) {
    return '파일 이름을 확인해 주세요. 제어문자 없이 255자 이하로 입력해 주세요.'
  }
  return null
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1000) return bytes + ' B'
  if (bytes < 1_000_000) return (bytes / 1000).toFixed(1) + ' KB'
  return (bytes / 1_000_000).toFixed(1) + ' MB'
}

export function availableFilePage(page, total, size) {
  return Math.min(page, Math.max(0, Math.ceil(total / size) - 1))
}
