import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SIGNUP_OPTIONS } from '../src/auth/signup.js'

const webDir = new URL('..', import.meta.url).pathname

// 가입은 이메일(Keycloak 가입 화면)과 Google 두 가지다(#223)
test('Google 가입은 Keycloak 로그인 화면을 거치지 않고 Google로 보낸다', () => {
  assert.deepEqual(SIGNUP_OPTIONS, { idpHint: 'google' })
})

test('첫 화면에 이메일 가입과 Google 가입이 둘 다 있다', () => {
  const app = readFileSync(`${webDir}src/App.jsx`, 'utf8')
  assert.match(app, /register\(\)[\s\S]*이메일로 가입/)
  assert.match(app, /signUpWithGoogle\(\)[\s\S]*Google 계정으로 가입/)
})
