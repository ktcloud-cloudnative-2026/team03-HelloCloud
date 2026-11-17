
import { useEffect, useState } from 'react'
import OrganizationSelect from './pages/OrganizationSelect'
import OrganizationCreate from './pages/OrganizationCreate'
import Dashboard from './pages/Dashboard'
import InviteAccept from './pages/InviteAccept'
import { getOrganizations, createOrganization } from './api/organizations'
import { login, register } from './auth/keycloak'
import './App.css'

// 초대 링크(/invite/<토큰>)만 주소로 화면을 고른다. 나머지 화면은 상태로 바꾼다.
function readInviteToken() {
  const match = window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)\/?$/)
  return match ? match[1] : null
}

function App({ authenticated, authError }) {
  const [inviteToken] = useState(readInviteToken)
  const [currentPage, setCurrentPage] = useState(() => {
    if (!authenticated) return 'login'
    return inviteToken ? 'invite' : 'organizations'
  })
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

  

  // 초대 링크로 들어왔는데 로그인 전이면 바로 로그인시킨다. 로그인하면 같은 주소로 돌아온다.
  const loginForInvite = inviteToken && !authenticated && !authError
  useEffect(() => {
    if (loginForInvite) login()
  }, [loginForInvite])

  const handleInviteDone = () => {
    window.history.replaceState(null, '', '/')
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

  if (currentPage === 'invite') {
    return <InviteAccept token={inviteToken} onDone={handleInviteDone} />
  }

  if (loginForInvite) {
    return (
      <main className="login-container">
        <p role="status">초대를 수락하려면 로그인이 필요해요. 로그인 화면으로 이동하는 중...</p>
      </main>
    )
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

        {authError && <p role="alert">{authError}</p>}

        <button className="login-button" type="button" onClick={login}>
          로그인
        </button>

        <p className="signup-text">
          아직 계정이 없으신가요?{' '}
          <a
            href="#signup"
            onClick={(e) => {
              e.preventDefault()
              register()
            }}
          >
            회원가입
          </a>
        </p>
      </div>
    </main>
  )
}

export default App
