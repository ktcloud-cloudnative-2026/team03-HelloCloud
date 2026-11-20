// 아이콘 모양은 여기 한 곳에만 둔다. 탭 아이콘(public/favicon.svg)과
// Keycloak 로고는 brandIconSvg() 결과를 복사한 파일이고, tests/brand.test.mjs가 같은지 비교한다.
export const BRAND_VIEWBOX = '0 0 32 32'
export const BRAND_COLOR = '#2563eb'
export const BRAND_INNER_COLOR = '#ffffff'

export const BRAND_SHAPES = [
  { tag: 'path', attrs: { d: 'M16 3a9.5 9.5 0 0 0-5.6 17.2c.9.7 1.4 1.6 1.4 2.6V24h8.4v-1.2c0-1 .5-1.9 1.4-2.6A9.5 9.5 0 0 0 16 3z', fill: BRAND_COLOR } },
  { tag: 'rect', attrs: { x: '12', y: '25.4', width: '8', height: '2.2', rx: '1.1', fill: BRAND_COLOR } },
  { tag: 'rect', attrs: { x: '13.5', y: '28.4', width: '5', height: '1.8', rx: '0.9', fill: BRAND_COLOR } },
  { tag: 'path', attrs: { d: 'M12.3 11.5h7.4L16 17.6z', fill: 'none', stroke: BRAND_INNER_COLOR, 'stroke-width': '1.6', 'stroke-linejoin': 'round' } },
  { tag: 'circle', attrs: { cx: '12.3', cy: '11.5', r: '2', fill: BRAND_INNER_COLOR } },
  { tag: 'circle', attrs: { cx: '19.7', cy: '11.5', r: '2', fill: BRAND_INNER_COLOR } },
  { tag: 'circle', attrs: { cx: '16', cy: '17.6', r: '2', fill: BRAND_INNER_COLOR } },
]

export function brandIconSvg() {
  const shapes = BRAND_SHAPES.map(({ tag, attrs }) => {
    const list = Object.entries(attrs).map(([name, value]) => `${name}="${value}"`).join(' ')
    return `<${tag} ${list}/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_VIEWBOX}">${shapes.join('')}</svg>`
}
