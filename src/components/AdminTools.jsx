import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function AdminTools() {
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single()

          setRole(data?.role || null)
        }
      } catch (error) {
        console.error('Error fetching user role for Admin Tools:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRole()
  }, [])

  if (loading) {
    return <div>Loading admin tools...</div>
  }

  if (role !== 'admin') {
    return (
      <div>
        <h2 style={{ marginBottom: '10px' }}>Admin Tools</h2>
        <p style={{ color: '#555' }}>
          You don't have admin rights. Please submit a request.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Admin Tools</h2>
      <p style={{ marginBottom: '20px', color: '#555' }}>
        Choose an admin page below.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px' }}>
        <Link className="btn btn-secondary" to="/inspection-folders">
          Drive Links
        </Link>
        <Link className="btn btn-secondary" to="/events">
          Events
        </Link>
        <Link className="btn btn-secondary" to="/users">
          Users
        </Link>
        <Link className="btn btn-secondary" to="/inspection-items">
          Inspection Item Templates
        </Link>
        <Link className="btn btn-secondary" to="/user-requests">
          User Requests
        </Link>
      </div>
    </div>
  )
}
