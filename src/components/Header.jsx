import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useState, useEffect } from 'react'

export default function Header({ session }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [userRole, setUserRole] = useState(null)
  const [pendingChecklists, setPendingChecklists] = useState(0)
  const [pendingRequests, setPendingRequests] = useState(0)
  const [pendingAlerts, setPendingAlerts] = useState(0)

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

  const loadPendingRequests = async () => {
    if (!session?.user) return

    const { count, error } = await supabase
      .from('user_requests')
      .select('id', { count: 'exact', head: true })
      .eq('admin_id', session.user.id)
      .is('is_resolved', false)

    if (error) {
      console.error('Error loading pending requests count:', error)
      return
    }

    setPendingRequests(count || 0)
  }

  const loadPendingAlerts = async () => {
    if (!session?.user) return

    const { count, error } = await supabase
      .from('checklist_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('admin_id', session.user.id)
      .is('is_resolved', false)

    if (error) {
      console.error('Error loading checklist alerts count:', error)
      return
    }

    setPendingAlerts(count || 0)
  }

  // Allow other components (like the inbox or MyChecklists)
  // to push their own view of the current counts into the
  // header so the bell badge always matches the visible lists.
  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {}
      if (typeof detail.pendingRequests === 'number') {
        setPendingRequests(detail.pendingRequests)
      }
      if (typeof detail.pendingChecklists === 'number') {
        setPendingChecklists(detail.pendingChecklists)
      }
      if (typeof detail.pendingAlerts === 'number') {
        setPendingAlerts(detail.pendingAlerts)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('notifications-sync', handler)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('notifications-sync', handler)
      }
    }
  }, [])

  // Allow other components to explicitly trigger a refresh of the
  // user request count (e.g. after marking a request as read).
  useEffect(() => {
    const handler = () => {
      loadPendingRequests()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('user-requests-updated', handler)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('user-requests-updated', handler)
      }
    }
  }, [session?.user])

  // Refresh bell count whenever the route changes so that
  // completing checklists and then navigating back updates
  // the number without a full page reload.
  useEffect(() => {
    if (!session?.user) return
    loadPendingChecklists()
    loadPendingRequests()
    loadPendingAlerts()
  }, [location.pathname, session?.user])

  // Subscribe to checklist changes so the bell count updates
  // automatically when checklists are created or completed for
  // the logged-in user.
  useEffect(() => {
    if (!session?.user) return

    const userId = session.user.id

    const checklistChannel = supabase
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

          // Notify any open checklist views that assigned
          // checklists have changed so they can refresh.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('checklists-updated'))
          }
        }
      )
      .subscribe()

    const requestsChannel = supabase
      .channel('user_requests_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_requests',
          filter: `admin_id=eq.${userId}`,
        },
        () => {
          loadPendingRequests()

          // Notify any open inbox views that user requests have
          // changed so they can refresh without a hard reload.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('user-requests-updated'))
          }
        }
      )
      .subscribe()

    const alertsChannel = supabase
      .channel('checklist_alerts_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checklist_alerts',
          filter: `admin_id=eq.${userId}`,
        },
        () => {
          loadPendingAlerts()
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('checklist-alerts-updated'))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(checklistChannel)
      supabase.removeChannel(requestsChannel)
      supabase.removeChannel(alertsChannel)
    }
  }, [session?.user?.id])

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('force_password_change')
    }
    await supabase.auth.signOut()
  }

  const notificationsTotal = pendingChecklists + pendingRequests + pendingAlerts

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
        {userRole !== 'admin' && (
          <button className="btn btn-warning" onClick={() => navigate('/request-item')}>
            Request Item
          </button>
        )}
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
        {userRole === 'admin' ? (
          <button className="btn btn-secondary" onClick={() => navigate('/admin-tools')}>
            Admin Tools
          </button>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={() => {
              alert("You don't have admin rights. Please submit a request.")
              navigate('/request-item')
            }}
          >
            Admin Tools
          </button>
        )}
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
            onClick={() => {
              if (userRole === 'admin') {
                navigate('/user-request-inbox')
              } else {
                navigate('/my-checklists')
              }
            }}
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
            {notificationsTotal > 0 && (
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
                {notificationsTotal}
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
