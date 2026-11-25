import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

// Google 로그인 동의 화면의 개인정보처리방침 링크(https://ideaconnection.jpexstudio.com/privacy, #223)
const webDir = new URL('..', import.meta.url).pathname
const page = `${webDir}public/privacy.html`

test('개인정보처리방침은 로그인 없이 열리는 정적 페이지다', () => {
  assert.ok(existsSync(page), 'public/privacy.html이 있어야 한다')
  const html = readFileSync(page, 'utf8')
  assert.match(html, /<html lang="ko">/)
  assert.doesNotMatch(html, /<script/i, '스크립트 없이 내용이 바로 보여야 한다')
  for (const word of ['Google', '이메일', '이름', '삭제', '문의']) assert.ok(html.includes(word), `${word} 항목이 필요하다`)
})

test('/privacy 주소가 웹 앱(index.html)이 아니라 정적 페이지로 간다', () => {
  const conf = readFileSync(`${webDir}nginx.conf`, 'utf8')
  assert.match(conf, /location = \/privacy \{[^}]*try_files \/privacy\.html =404;/s)
})
