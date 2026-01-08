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
            <Route path="/" element={<Dashboard />} />
            <Route path="/overview" element={<AssetOverview />} />
            <Route path="/plant" element={<AssetList />} />
            <Route path="/inspections" element={<InspectionsList />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
