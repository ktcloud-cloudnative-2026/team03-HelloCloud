
import { useState } from 'react'
import FileManager from './FileManager'
import ChatPage from './ChatPage'
import { logout } from '../auth/keycloak'
import InviteDialog from '../components/InviteDialog'
import MemberList from '../components/MemberList'
import { relativeTime } from './dashboard/activity'
import { useDashboardData } from './dashboard/useDashboardData'
import './Dashboard.css'

const menuItems = [
  { id: 'dashboard', icon: '▦', label: '대시보드' },
  { id: 'members', icon: '♙', label: '멤버' },
  { id: 'chat', icon: '▤', label: '채팅' },
  { id: 'files', icon: '▣', label: '파일 관리' },
  { id: 'tasks', icon: '☑', label: '업무 관리', preview: true },
  { id: 'calendar', icon: '▦', label: '캘린더', preview: true },
]

const summaryItems = [
  { id: 'members', label: '조직 멤버', icon: '♙', tone: 'green' },
  { id: 'unread', label: '새 메시지', icon: '✉', tone: 'purple' },
  { id: 'files', label: '공유 파일', icon: '▣', tone: 'blue' },
  { id: 'decisions', label: '고정 메시지', icon: '📌', tone: 'orange' },
]

const activityTones = { message: 'purple', file: 'green', decision: 'blue' }

const quickLinks = [
  { id: 'chat', icon: '✉', label: '채팅', description: '팀원들과 대화하기' },
  { id: 'files', icon: '▣', label: '파일', description: '공유 파일 확인하기' },
  { id: 'tasks', icon: '☑', label: '업무', description: '진행 상황 살펴보기' },
  { id: 'calendar', icon: '▦', label: '일정', description: '팀 일정 확인하기' },
]

function Dashboard({ organization, onBack, onLeave }) {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const dashboardData = useDashboardData(organization.id, activeMenu === 'dashboard')
  const activities = dashboardData.activities ?? []

  const organizationName = organization?.name || 'HelloCloud 개발팀'
  const organizationInitials =
    organization?.initials || organizationName.slice(0, 2).toUpperCase()

  const handleMenuClick = (id) => {
    setActiveMenu(id)
    setSidebarOpen(false)
  }

  return (
    <div className="dashboard-layout">
      {sidebarOpen && (
        <button
          type="button"
          className="dashboard-overlay"
          aria-label="사이드바 닫기"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`dashboard-sidebar ${sidebarOpen ? 'is-open' : ''}`}
      >
        <div className="dashboard-sidebar-brand">
          <span className="dashboard-brand-symbol" aria-hidden="true">
            ☁
          </span>
          <span>IdeaConnection</span>
        </div>

        <div className="dashboard-workspace">
          <span className="dashboard-workspace-avatar">
            {organizationInitials}
          </span>

          <div className="dashboard-workspace-info">
            <strong>{organizationName}</strong>
            <span>팀 워크스페이스</span>
          </div>
        </div>

        <div className="dashboard-sidebar-label">WORKSPACE</div>

        <nav className="dashboard-navigation" aria-label="워크스페이스 메뉴">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dashboard-nav-item ${
                activeMenu === item.id ? 'active' : ''
              }`}
              onClick={() => handleMenuClick(item.id)}
            >
              <span className="dashboard-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.preview && (
                <span className="dashboard-preview-label">예정</span>
              )}
            </button>
          ))}
        </nav>

        <div className="dashboard-sidebar-bottom">
          <button
            type="button"
            className="dashboard-back-button"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
            다른 조직 선택
          </button>

          <div className="dashboard-sidebar-user">
            <span className="dashboard-user-avatar">U</span>
            <div>
              <strong>사용자</strong>
              <span>개발용 계정</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="dashboard-content">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            <button
              type="button"
              className="dashboard-mobile-menu"
              aria-label="메뉴 열기"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              ☰
            </button>

            <div className="dashboard-breadcrumb">
              <span>{organizationName}</span>
              <span className="dashboard-breadcrumb-divider">/</span>
              <strong>대시보드</strong>
            </div>
          </div>

          <div className="dashboard-topbar-right">
            <span className="dashboard-demo-badge">DEMO</span>
            {organization?.role === 'OWNER' && (
              <button
                type="button"
                className="dashboard-invite"
                onClick={() => setInviteOpen(true)}
              >
                팀원 초대
              </button>
            )}
            <span className="dashboard-header-avatar">U</span>
            <button type="button" className="dashboard-logout" onClick={logout}>
              로그아웃
            </button>
          </div>
        </header>

        <main className="dashboard-main">
          {activeMenu === 'dashboard' ? (
            <>
              <section className="dashboard-welcome">
                <div>
                  <span className="dashboard-eyebrow">YOUR WORKSPACE</span>
                  <h1>안녕하세요!</h1>
                  <p>
                    {organizationName}의 활동을 한눈에 확인해 보세요.
                  </p>
                </div>

                <span className="dashboard-welcome-decoration" aria-hidden="true">
                  ☁
                </span>
              </section>

              <section className="dashboard-section">
                <div className="dashboard-section-heading">
                  <div>
                    <h2>워크스페이스 현황</h2>
                    <p>팀의 주요 활동을 간편하게 살펴보세요.</p>
                  </div>
                </div>

                <div className="dashboard-summary-grid">
                  {summaryItems.map((item) => (
                    <article className="dashboard-summary-card" key={item.id}>
                      <div className={`dashboard-summary-icon ${item.tone}`}>
                        {item.icon}
                      </div>
                      <p>{item.label}</p>
                      {/* 불러오지 못한 카드만 – 로 둔다 */}
                      <strong>
                        {dashboardData.loading ? '…' : dashboardData[item.id] ?? '–'}
                      </strong>
                    </article>
                  ))}
                </div>
              </section>

              <div className="dashboard-bottom-grid">
                <section className="dashboard-panel">
                  <div className="dashboard-panel-heading">
                    <div>
                      <h2>최근 활동</h2>
                      <p>워크스페이스의 새로운 소식</p>
                    </div>
                  </div>

                  <div className="dashboard-activity-list">
                    {!dashboardData.loading && activities.length === 0 && (
                      <p className="dashboard-activity-empty">아직 활동이 없습니다</p>
                    )}
                    {activities.map((activity) => (
                      <div className="dashboard-activity" key={activity.id}>
                        <span
                          className={`dashboard-activity-avatar ${activityTones[activity.kind]}`}
                        >
                          {activity.name.slice(0, 1)}
                        </span>

                        <div className="dashboard-activity-body">
                          <p>
                            <strong>{activity.subject}</strong>{' '}
                            {activity.action}
                          </p>
                          <span>{activity.detail}</span>
                        </div>

                        <time dateTime={activity.at}>
                          {relativeTime(activity.at, new Date())}
                        </time>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="dashboard-panel">
                  <div className="dashboard-panel-heading">
                    <div>
                      <h2>빠른 메뉴</h2>
                      <p>자주 사용하는 기능으로 이동</p>
                    </div>
                  </div>

                  <div className="dashboard-quick-links">
                    {quickLinks.map((link) => (
                      <button
                        type="button"
                        className="dashboard-quick-link"
                        key={link.id}
                        onClick={() => handleMenuClick(link.id)}
                      >
                        <span className="dashboard-quick-icon">
                          {link.icon}
                        </span>
                        <span>
                          <strong>{link.label}</strong>
                          <small>{link.description}</small>
                        </span>
                        <span className="dashboard-quick-arrow">→</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </>
          ) : activeMenu === 'files' ? (
            <FileManager key={organization.id} orgId={organization.id} organizationRole={organization.role} />
          ) : activeMenu === 'chat' ? (
            <ChatPage key={organization.id} organization={organization} />
          ) : activeMenu === 'members' ? (
            <MemberList organization={organization} onLeave={onLeave} />
          ) : (
            <section className="dashboard-placeholder">
              <span className="dashboard-placeholder-icon">☁</span>
              <h1>
                {menuItems.find((item) => item.id === activeMenu)?.label}
              </h1>
              <p>
                이 기능은 현재 준비 중이에요.
                <br />
                대시보드 UI 구현 후 순차적으로 연결할 예정입니다.
              </p>
              <button
                type="button"
                onClick={() => setActiveMenu('dashboard')}
              >
                대시보드로 돌아가기
              </button>
            </section>
          )}
        </main>
      </div>

      {inviteOpen && (
        <InviteDialog
          orgId={organization.id}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  )
}

export default Dashboard
