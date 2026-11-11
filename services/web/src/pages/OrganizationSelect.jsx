
import './OrganizationSelect.css'

function OrganizationSelect({
  organizations = [],
  loading = false,
  error = '',
  onCreate,
  onSelect,
}) {

  return (
    <main className="org-page">
      <div className="org-container">
        <header className="org-header">
          <div className="org-brand">
            <span className="org-brand-icon" aria-hidden="true">☁</span>
            <span>HelloCloud</span>
          </div>

          <span className="org-step">WORKSPACE</span>

          <h1>어떤 조직에서 시작할까요?</h1>
          <p>
            참여 중인 조직을 선택하거나
            새로운 협업 공간을 만들어 보세요.
          </p>
        </header>

        <section className="org-section" aria-label="내 조직 목록">
          <div className="org-section-heading">
            <h2>내 조직</h2>
            <span>{organizations.length}개의 조직</span>
          </div>

          
          <div className="org-list">
            {loading && (
              <p role="status">조직 목록을 불러오는 중...</p>
            )}

            {error && (
              <p role="alert">
                조직 목록을 불러오지 못했습니다: {error}
              </p>
            )}

            {!loading && !error && organizations.length === 0 && (
              <p>아직 참여 중인 조직이 없습니다.</p>
            )}

            {organizations.map((org) => (
              <button
                type="button"
                className="org-item"
                key={org.id}
                onClick={() => onSelect?.(org)}
              >
                <span className="org-avatar">{org.initials}</span>

                <span className="org-details">
                  <strong>{org.name}</strong>
                  <span>{org.description}</span>
                  <small>멤버 {org.members}명</small>
                </span>

                <span className="org-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>

        <div className="org-divider">
          <span>또는</span>
        </div>

        <button
          type="button"
          className="org-create-button"
          onClick={() => onCreate?.()}
        >
          <span className="org-create-icon" aria-hidden="true">+</span>
          <span>
            <strong>새 조직 만들기</strong>
            <small>팀원들과 함께할 새로운 공간을 시작하세요</small>
          </span>
          <span className="org-arrow" aria-hidden="true">→</span>
        </button>

        <footer className="org-footer">
          © 2026 HelloCloud · 함께 만드는 더 나은 협업
        </footer>
      </div>
    </main>
  )
}

export default OrganizationSelect
