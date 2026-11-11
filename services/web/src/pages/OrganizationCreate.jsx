
import { useState } from 'react'
import './OrganizationCreate.css'

function OrganizationCreate({ onBack, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (submitting) return

    const trimmedName = name.trim()

    if (!trimmedName) return

    setSubmitting(true)
    setError('')

    try {
      await onCreate?.({
        name: trimmedName,
      })
    } catch (err) {
      setError(err.message || '조직 생성에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="create-page">
      <div className="create-card">
        <button
          type="button"
          className="create-back"
          onClick={onBack}
        >
          ← 조직 선택으로 돌아가기
        </button>

        <div className="create-heading">
          <div className="create-heading-icon">+</div>
          <h1>새 조직 만들기</h1>
          <p>팀원들과 함께할 협업 공간을 만들어 보세요.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="create-field">
            <label htmlFor="org-name">조직 이름 *</label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: HelloCloud 개발팀"
              maxLength={50}
              required
            />
            <small>조직 이름은 최대 50자까지 입력할 수 있어요.</small>
          </div>

          <div className="create-field">
            <label htmlFor="org-description">
              조직 설명 (선택)
            </label>
            <textarea
              id="org-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="우리 조직을 간단히 소개해 주세요."
              rows={4}
              maxLength={200}
            />
          </div>

          {error && (
            <p role="alert">
              조직 생성에 실패했습니다: {error}
            </p>
          )}

          <button
            className="create-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? '조직 생성 중...' : '조직 만들기 →'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default OrganizationCreate
