
import { useEffect, useState } from 'react'
import OrganizationSelect from './pages/OrganizationSelect'
import OrganizationCreate from './pages/OrganizationCreate'
import Dashboard from './pages/Dashboard'
import { getOrganizations, createOrganization } from './api/organizations'
import { login, register } from './auth/keycloak'
import './App.css'

function App({ authenticated, authError }) {
  const [currentPage, setCurrentPage] = useState(
    authenticated ? 'organizations' : 'login',
  )
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
