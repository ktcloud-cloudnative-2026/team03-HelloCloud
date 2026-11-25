// 서버(PATCH /api/users/me)와 같은 기준: 앞뒤 공백을 빼고 1~50자. 이모지는 한 글자로 센다
const MAX_DISPLAY_NAME_LENGTH = 50

export function initial(name) {
  const [first] = Array.from((name ?? '').trim())
  return first ?? '?'
}

export function validDisplayName(raw) {
  const value = (raw ?? '').trim()
  if (!value) return { value, error: '이름을 입력해 주세요.' }
  if (Array.from(value).length > MAX_DISPLAY_NAME_LENGTH) {
    return { value, error: `이름은 ${MAX_DISPLAY_NAME_LENGTH}자까지 쓸 수 있어요.` }
  }
  return { value, error: '' }
}
