import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useState, useEffect } from 'react'

export default function Header({ session }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [userRole, setUserRole] = useState(null)
  const [pendingChecklists, setPendingChecklists] = useState(0)

  useEffect(() => {
    checkUserRole()
    loadPendingChecklists()
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

  const loadPendingChecklists = async () => {
    if (!session?.user) return

    const { count, error } = await supabase
      .from('inspection_checklists')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_user_id', session.user.id)
      .neq('status', 'completed')

    if (error) {
      console.error('Error loading pending checklists count:', error)
      return
    }

    setPendingChecklists(count || 0)
  }

  // Refresh bell count whenever the route changes so that
  // completing checklists and then navigating back updates
  // the number without a full page reload.
  useEffect(() => {
    if (!session?.user) return
    loadPendingChecklists()
  }, [location.pathname, session?.user])

  // Subscribe to checklist changes so the bell count updates
  // automatically when checklists are created or completed for
  // the logged-in user.
  useEffect(() => {
    if (!session?.user) return

    const userId = session.user.id

    const channel = supabase
      .channel('inspection_checklists_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inspection_checklists',
          filter: `assigned_user_id=eq.${userId}`,
        },
        () => {
          loadPendingChecklists()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id])

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('force_password_change')
    }
    await supabase.auth.signOut()
  }

  return (
    <div className="header">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ marginBottom: session?.user ? '2px' : 0 }}>Sitebatch Inspections</h1>
          {session?.user && (
            <span
              style={{
                fontSize: '0.85rem',
                color: '#555',
              }}
            >
              Logged in as {session.user.email}
            </span>
          )}
        </div>
      </div>
      <div className="nav-buttons">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
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
        <button className="btn btn-secondary" onClick={() => navigate('/admin-tools')}>
          Admin Tools
        </button>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '4px',
          }}
        >
          {/* Notifications bell above sign out */}
          <button
            type="button"
            onClick={() => navigate('/my-checklists')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label="My checklists notifications"
          >
            <span
              style={{
                fontSize: '1.4rem',
              }}
            >
              🔔
            </span>
            {pendingChecklists > 0 && (
              <span
                style={{
                  marginLeft: '4px',
                  backgroundColor: '#d32f2f',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '0 6px',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                }}
              >
                {pendingChecklists}
              </span>
            )}
          </button>
          <button className="btn btn-danger" onClick={handleSignOut}>
            Sign Out
          </button>
          <button
            type="button"
            onClick={() => navigate('/change-password')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              marginTop: '2px',
              color: '#1976d2',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Change password
          </button>
        </div>
      </div>
    </div>
  )
}
