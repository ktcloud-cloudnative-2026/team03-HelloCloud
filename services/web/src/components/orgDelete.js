// 조직 삭제는 되돌릴 수 없어서, 조직 이름을 글자 그대로 입력했을 때만 버튼을 연다
export function canDeleteOrganization(orgName, typed) {
  return orgName.length > 0 && typed === orgName
}
