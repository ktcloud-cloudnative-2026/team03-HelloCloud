// 대시보드 왼쪽 메뉴. 헤더 경로(조직 / 메뉴 이름)도 이 목록에서 이름을 가져온다
export const menuItems = [
  { id: 'dashboard', icon: 'grid', label: '대시보드' },
  { id: 'members', icon: 'users', label: '멤버' },
  { id: 'chat', icon: 'chat', label: '채팅' },
  { id: 'files', icon: 'folder', label: '파일 관리' },
  { id: 'tasks', icon: 'check', label: '업무 관리', preview: true },
  { id: 'calendar', icon: 'calendar', label: '캘린더', preview: true },
]

// 모르는 메뉴면 첫 화면 이름을 보여 준다
export function menuLabel(id) {
  return (menuItems.find((item) => item.id === id) ?? menuItems[0]).label
}
