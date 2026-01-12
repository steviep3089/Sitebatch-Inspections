import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function UserRequestsAdmin() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setError('You must be logged in to view requests.')
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('user_requests')
          .select('id, description, created_at, is_resolved, requester_id')
          .eq('admin_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error

        const requesterIds = Array.from(new Set((data || []).map(r => r.requester_id).filter(Boolean)))
        let requesterMap = {}

        if (requesterIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('id, email')
            .in('id', requesterIds)

          if (profilesError) throw profilesError

          requesterMap = (profiles || []).reduce((acc, profile) => {
            acc[profile.id] = profile.email
            return acc
          }, {})
        }

        const enriched = (data || []).map((req) => ({
          ...req,
          requester_email: requesterMap[req.requester_id] || 'Unknown user',
        }))

        setRequests(enriched)
      } catch (err) {
        console.error('Error loading admin user requests list:', err)
        setError('Error loading user requests. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
  }, [])

  if (loading) {
    return <div>Loading user requests...</div>
  }

  if (error) {
    return <div>{error}</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: '15px' }}>User Requests (History)</h2>
      <p style={{ marginBottom: '15px', color: '#555' }}>
        This table shows all requests that have been sent to you, including those you have marked as read.
      </p>

      {requests.length === 0 ? (
        <p>No user requests found.</p>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>From</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Requested At</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{req.requester_email}</td>
                  <td style={{ padding: '10px' }}>
                    {req.created_at ? new Date(req.created_at).toLocaleString() : '-'}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {req.is_resolved ? 'Read' : 'New'}
                  </td>
                  <td style={{ padding: '10px', whiteSpace: 'pre-wrap' }}>{req.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
