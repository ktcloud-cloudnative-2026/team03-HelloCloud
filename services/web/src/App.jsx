
import { useEffect, useState } from 'react'
import OrganizationSelect from './pages/OrganizationSelect'
import OrganizationCreate from './pages/OrganizationCreate'
import Dashboard from './pages/Dashboard'
import { getOrganizations, createOrganization } from './api/organizations'
import './App.css'

const initialOrganizations = [
  {
    id: 1,
    name: 'HelloCloud 개발팀',
    description: '우리 팀의 협업 공간',
    members: 6,
    initials: 'HC',
  },
  {
    id: 2,
    name: '클라우드 스터디',
    description: '클라우드 네이티브 기술 학습',
    members: 4,
    initials: 'CS',
  },
]

function App() {
  const [currentPage, setCurrentPage] = useState('login')
  const [organizations, setOrganizations] = useState([])
  const [selectedOrganization, setSelectedOrganization] = useState(null)
  
  const [organizationsLoading, setOrganizationsLoading] = useState(false)
  const [organizationsError, setOrganizationsError] = useState('')

  useEffect(() => {
    if (currentPage !== 'organizations') return

    let cancelled = false

    async function loadOrganizations() {
      setOrganizationsLoading(true)
      setOrganizationsError('')

      try {
        const data = await getOrganizations()

        if (!cancelled) {
          setOrganizations(data.items)
        }
      } catch (error) {
        if (!cancelled) {
          setOrganizationsError(error.message)
        }
      } finally {
        if (!cancelled) {
          setOrganizationsLoading(false)
        }
      }
    }

    loadOrganizations()

    return () => {
      cancelled = true
    }
  }, [currentPage])

  

  const handleLogin = (e) => {
    e.preventDefault()

    // 개발용 임시 로그인 (Keycloak 연동 예정)
    setCurrentPage('organizations')
  }

  const handleCreateOrganization = async (newOrganization) => {
    const created = await createOrganization(newOrganization.name)

    setOrganizations((prev) => [...prev, created])
    setCurrentPage('organizations')
  }

  const handleSelectOrganization = (organization) => {
    setSelectedOrganization(organization)
    setCurrentPage('dashboard')
  }

  const handleBackToOrganizations = () => {
    setSelectedOrganization(null)
    setCurrentPage('organizations')
  }

  if (currentPage === 'dashboard' && selectedOrganization) {
    return (
      <Dashboard
        organization={selectedOrganization}
        onBack={handleBackToOrganizations}
      />
    )
  }

  if (currentPage === 'organizations') {
    return (
      <OrganizationSelect
        organizations={organizations}
        loading={organizationsLoading}
        error={organizationsError}
        onCreate={() => setCurrentPage('create')}
        onSelect={handleSelectOrganization}
      />
    )
  }

  if (currentPage === 'create') {
    return (
      <OrganizationCreate
        onBack={() => setCurrentPage('organizations')}
        onCreate={handleCreateOrganization}
      />
    )
  }

  return (
    <main className="login-container">
      <div className="login-card">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            ☁
          </span>
          <h1>HelloCloud</h1>
        </div>

        <p className="subtitle">우리 팀의 협업을 하나로</p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
              placeholder="example@hellocloud.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="login-button" type="submit">
            로그인
          </button>
        </form>

        <p className="signup-text">
          아직 계정이 없으신가요? <a href="#signup">회원가입</a>
        </p>
      </div>
    </main>
  )
}

export default App
