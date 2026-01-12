import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import MyChecklistDetailModal from './MyChecklistDetailModal'

export default function UserRequestInbox() {
  const [requests, setRequests] = useState([])
  const [checklists, setChecklists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeChecklistId, setActiveChecklistId] = useState(null)

  const loadInboxData = async () => {
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
        .is('is_resolved', false)
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

      // Load incomplete checklists assigned to this admin
      const { data: checklistData, error: checklistError } = await supabase
        .from('inspection_checklists')
        .select(`
          id,
          status,
          due_date,
          inspections:inspection_id (
            id,
            asset_items (asset_id, name),
            inspection_types (name)
          )
        `)
        .eq('assigned_user_id', user.id)
        .neq('status', 'completed')
        .order('due_date', { ascending: true })

      if (checklistError) {
        console.error('Error loading pending checklists for inbox:', checklistError)
        setChecklists([])
      } else {
        setChecklists(checklistData || [])
      }

      // Push the exact counts we see in this view up to the
      // header so the bell badge stays in sync.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('notifications-sync', {
            detail: {
              pendingRequests: enriched.length,
              pendingChecklists: (checklistData || []).length,
            },
          })
        )
      }
    } catch (err) {
      console.error('Error loading user requests inbox:', err)
      setError('Error loading user requests. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInboxData()

    // Listen for global notifications that user requests or
    // checklists have changed (triggered from Header realtime
    // and from the request form) so this inbox stays in sync.
    const handler = () => {
      // Small delay to reduce any chance of reading before
      // the new row is fully visible to queries.
      setTimeout(() => {
        loadInboxData()
      }, 300)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('user-requests-updated', handler)
      window.addEventListener('checklists-updated', handler)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('user-requests-updated', handler)
        window.removeEventListener('checklists-updated', handler)
      }
    }
  }, [])

  const markAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('user_requests')
        .update({ is_resolved: true })
        .eq('id', id)

      if (error) throw error

      await loadInboxData()

      // Let the header know the pending request count has changed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('user-requests-updated'))
      }
    } catch (err) {
      console.error('Error marking request as read:', err)
      alert('Error marking request as read. Please try again.')
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div>{error}</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: '15px' }}>User Requests</h2>
      <p style={{ marginBottom: '15px', color: '#555' }}>
        These are new requests sent to you. Click <strong>Read</strong> when you have noted them. They
        will no longer appear here but will remain available under Admin Tools &gt; User Requests.
      </p>
      {requests.length === 0 ? (
        <p>No new user requests.</p>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>From</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Requested At</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Description</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{req.requester_email}</td>
                  <td style={{ padding: '10px' }}>
                    {req.created_at ? new Date(req.created_at).toLocaleString() : '-'}
                  </td>
                  <td style={{ padding: '10px', whiteSpace: 'pre-wrap' }}>{req.description}</td>
                  <td style={{ padding: '10px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => markAsRead(req.id)}
                    >
                      Read
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: '30px', marginBottom: '15px' }}>Pending Checklists</h2>
      {checklists.length === 0 ? (
        <p>No pending checklists assigned to you.</p>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Asset ID</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Asset Name</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Inspection Type</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Due Date</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {checklists.map((cl) => (
                <tr key={cl.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>
                    {cl.inspections?.asset_items?.asset_id || 'N/A'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {cl.inspections?.asset_items?.name || 'N/A'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {cl.inspections?.inspection_types?.name || 'N/A'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {cl.due_date
                      ? new Date(cl.due_date).toLocaleDateString()
                      : 'N/A'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {cl.status || 'unknown'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setActiveChecklistId(cl.id)}
                    >
                      {cl.status === 'completed' ? 'View' : 'Complete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeChecklistId && (
        <MyChecklistDetailModal
          checklistId={activeChecklistId}
          onClose={() => setActiveChecklistId(null)}
          onUpdated={loadInboxData}
        />
      )}
    </div>
  )
}
