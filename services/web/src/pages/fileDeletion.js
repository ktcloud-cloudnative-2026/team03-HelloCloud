export function canDeleteFile(file, organizationRole, currentUserId) {
  if (!currentUserId || !['OWNER', 'MEMBER'].includes(organizationRole)) return false
  return organizationRole === 'OWNER' || file.uploadedBy === currentUserId
}

export async function requestFileDeletion(file, {
  organizationRole, currentUserId, confirmDelete, deleteFile,
}) {
  if (!canDeleteFile(file, organizationRole, currentUserId)) {
    throw new Error('파일을 삭제할 권한이 없습니다.')
  }
  if (!confirmDelete('“' + file.name + '” 파일을 삭제할까요? 삭제한 파일은 복구할 수 없습니다.')) return false
  // 화면의 역할 정보와 별개로 API가 현재 조직 소속·삭제 권한을 다시 검사합니다.
  await deleteFile(file.id)
  return true
}
