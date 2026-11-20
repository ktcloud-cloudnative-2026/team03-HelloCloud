import { BRAND_COLOR, BRAND_INNER_COLOR, BRAND_SHAPES, BRAND_VIEWBOX } from './brandIcon.js'

// SVG 속성 이름(stroke-width 등)을 React 이름(strokeWidth)으로 바꾼다
const toReactName = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

// 파란 배경 위에서는 전구가 묻히므로 color · innerColor로 색을 바꿔 쓴다
export default function BrandIcon({ size = 32, className, color = BRAND_COLOR, innerColor = BRAND_INNER_COLOR }) {
  const paint = (value) => {
    if (value === BRAND_COLOR) return color
    if (value === BRAND_INNER_COLOR) return innerColor
    return value
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={BRAND_VIEWBOX}
      aria-hidden="true"
      focusable="false"
    >
      {BRAND_SHAPES.map(({ tag: Tag, attrs }, index) => (
        <Tag
          key={index}
          {...Object.fromEntries(
            Object.entries(attrs).map(([name, value]) => [
              toReactName(name),
              name === 'fill' || name === 'stroke' ? paint(value) : value,
            ]),
          )}
        />
      ))}
    </svg>
  )
}
