import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useState, useEffect } from 'react'

export default function Header({ session }) {
  const navigate = useNavigate()
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    checkUserRole()
  }, [session])

  const checkUserRole = async () => {
    if (session?.user) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      
      console.log('User role check:', { data, error, userId: session.user.id })
      setUserRole(data?.role)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="header">
      <h1>Sitebatch Inspections</h1>
      <div className="nav-buttons">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Dashboard
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/overview')}>
          Overview
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/plant')}>
          Assets
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/inspections')}>
          Inspections
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/events')}>
          Events
        </button>
        {userRole === 'admin' && (
          <button className="btn btn-secondary" onClick={() => navigate('/users')}>
            Users
          </button>
        )}
        <button className="btn btn-danger" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
