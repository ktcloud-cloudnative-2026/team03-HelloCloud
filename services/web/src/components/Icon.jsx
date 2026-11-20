import { ICON_PATHS } from './iconPaths'

// 글자 색(currentColor)을 따라가서 메뉴 · 카드의 기존 색 규칙을 그대로 쓴다
function Icon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

export default Icon
