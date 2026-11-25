import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SIGNUP_OPTIONS } from '../src/auth/signup.js'

const webDir = new URL('..', import.meta.url).pathname

// prod는 자체 회원가입을 끄고 Google로만 가입한다(#223). register()는 "등록이 허용되지 않습니다"가 된다
test('회원가입은 Keycloak 가입 화면이 아니라 Google 로그인으로 보낸다', () => {
  assert.deepEqual(SIGNUP_OPTIONS, { idpHint: 'google' })
  const app = readFileSync(`${webDir}src/App.jsx`, 'utf8')
  assert.doesNotMatch(app, /\bregister\(/)
  assert.match(app, /signUpWithGoogle\(/)
})
