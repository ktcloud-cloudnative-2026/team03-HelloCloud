import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// CI에는 nginx가 없어서 설정 글자를 읽어 확인한다. 실제 응답 헤더는 PR에 적은 nginx 컨테이너 검사로 확인했다
const conf = readFileSync(process.env.NGINX_CONF ?? new URL('../nginx.conf', import.meta.url), 'utf8')

function locationBlock(path) {
  const match = conf.match(new RegExp(`location ${path.replace('/', '\\/')} \\{([^}]*)\\}`))
  assert.ok(match, `location ${path} 블록이 있어야 한다`)
  return match[1]
}

test('index.html은 배포 뒤 바로 새 버전을 받도록 no-cache', () => {
  assert.match(locationBlock('/'), /add_header Cache-Control "no-cache";/)
})

test('해시가 붙은 빌드 파일은 1년 캐시', () => {
  assert.match(locationBlock('/assets/'), /add_header Cache-Control "public, max-age=31536000, immutable";/)
})

test('없는 빌드 파일은 index.html이 아니라 404', () => {
  assert.match(locationBlock('/assets/'), /try_files \$uri =404;/)
})
