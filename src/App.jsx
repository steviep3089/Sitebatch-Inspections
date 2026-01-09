import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './App.css'

// Import components
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AssetOverview from './components/AssetOverview'
import AssetList from './components/AssetList'
import InspectionsList from './components/InspectionsList'
import UserManagement from './components/UserManagement'
import Events from './components/Events'
import InspectionTypeDriveLinks from './components/InspectionTypeDriveLinks'
import AdminTools from './components/AdminTools'
import ChangePassword from './components/ChangePassword'
import Header from './components/Header'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // After a successful login, send the user to Overview once per session
  useEffect(() => {
    if (!session) return

    const url = new URL(window.location.href)

    // Supabase may put recovery params in the query string or the hash fragment
    const searchType = url.searchParams.get('type')
    let hashType = null

    if (url.hash) {
      const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.substring(1) : url.hash)
      hashType = hashParams.get('type')
    }

    const type = searchType || hashType

    // If coming from a password recovery link or a confirmed signup link,
    // force the user through the Change Password flow and do NOT redirect
    // them away to the overview yet.
    if (type === 'recovery' || type === 'signup') {
      // Mark that this session must go through a forced password change flow
      sessionStorage.setItem('force_password_change', 'true')

      // Clean up the URL to just /change-password once Supabase has created the session
      if (window.location.pathname !== '/change-password') {
        window.history.replaceState({}, '', '/change-password')
      }
      return
    }
    if (window.location.pathname === '/change-password') {
      return
    }

    const token = session?.access_token
    if (!token) return

    const key = `redirected_for_token_${token}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, 'true')
      if (window.location.pathname !== '/overview') {
        window.location.replace('/overview')
      }
    }
  }, [session])

  const mustChangePassword =
    typeof window !== 'undefined' && sessionStorage.getItem('force_password_change') === 'true'

  if (loading) {
    return (
      <div className="App">
        <div className="container">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('force_password_change')
    }
    return <Login />
  }

  if (mustChangePassword) {
    return (
      <div className="App">
        <div className="container">
          <ChangePassword />
        </div>
      </div>
    )
  }

  return (
    <Router>
      <div className="App">
        <Header session={session} />
        <div className="container">
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/overview" element={<AssetOverview />} />
            <Route path="/plant" element={<AssetList />} />
            <Route path="/inspections" element={<InspectionsList />} />
            <Route path="/events" element={<Events />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/inspection-folders" element={<InspectionTypeDriveLinks />} />
            <Route path="/admin-tools" element={<AdminTools />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
