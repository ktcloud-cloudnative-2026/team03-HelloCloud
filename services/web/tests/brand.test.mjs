import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND_VIEWBOX, brandIconSvg } from '../src/brand/brandIcon.js'

const webDir = new URL('..', import.meta.url).pathname
const squash = (svg) => svg.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()

function jsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return jsxFiles(path)
    return entry.name.endsWith('.jsx') ? [path] : []
  })
}

test('웹 화면에 구름 글자 아이콘이 남아 있지 않다', () => {
  const withCloud = jsxFiles(join(webDir, 'src')).filter((file) => readFileSync(file, 'utf8').includes('☁'))
  assert.deepEqual(withCloud, [])
})

test('BrandIcon 색에는 CSS 변수를 넘기지 않는다(SVG 색 속성은 var()를 읽지 못함)', () => {
  const misuse = jsxFiles(join(webDir, 'src')).filter((file) =>
    /<BrandIcon[^>]*(color|innerColor)="var\(/s.test(readFileSync(file, 'utf8')),
  )
  assert.deepEqual(misuse, [])
})

test('탭 아이콘은 브랜드 아이콘과 같은 그림이다', () => {
  const favicon = readFileSync(join(webDir, 'public/favicon.svg'), 'utf8')
  assert.equal(squash(favicon), squash(brandIconSvg()))
})

// 웹 이미지 빌드(CI)에는 services/web만 들어가 Keycloak 폴더가 없다. 그때만 건너뛴다
const keycloakDir = process.env.KEYCLOAK_DIR ?? join(webDir, '../keycloak')
const noKeycloak = !existsSync(keycloakDir) && 'Keycloak 폴더가 없는 환경(웹 이미지 빌드)'

test('Keycloak 로고는 브랜드 아이콘과 같은 그림이다', { skip: noKeycloak }, () => {
  const logo = readFileSync(join(keycloakDir, 'themes/ideaconnection/login/resources/img/logo.svg'), 'utf8')
  assert.equal(squash(logo), squash(brandIconSvg()))
})

test('브랜드 아이콘은 32칸 기준이고 파란 전구에 흰 점을 쓴다', () => {
  assert.equal(BRAND_VIEWBOX, '0 0 32 32')
  assert.match(brandIconSvg(), /viewBox="0 0 32 32"/)
  assert.match(brandIconSvg(), /#2563eb/)
  assert.match(brandIconSvg(), /#ffffff/)
})
