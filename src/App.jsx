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
    const type = url.searchParams.get('type')

    // If coming from a password recovery link, send straight to Change Password
    if (type === 'recovery') {
      window.history.replaceState({}, '', '/change-password')
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
    return <Login />
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
