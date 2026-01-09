import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Events() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState(null)

  useEffect(() => {
    fetchRoleAndEvents()
  }, [])

  const fetchRoleAndEvents = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        setCurrentUserRole(profile?.role || null)
      }

      const { data: assetsData } = await supabase
        .from('asset_items')
        .select('id, asset_id, name')

      const assetsById = new Map((assetsData || []).map(asset => [asset.id, asset]))

      const { data: eventsData, error: eventsError } = await supabase
        .from('asset_events')
        .select('*')
        .order('start_date', { ascending: false })

      if (eventsError) throw eventsError

      const enrichedEvents = (eventsData || []).map(event => ({
        ...event,
        asset: assetsById.get(event.asset_id) || null,
      }))

      setEvents(enrichedEvents)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEvent = async (eventId) => {
    if (currentUserRole !== 'admin') {
      alert('Only admins can delete events.')
      return
    }

    if (!confirm('Are you sure you want to delete this event?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('asset_events')
        .delete()
        .eq('id', eventId)

      if (error) throw error

      await fetchRoleAndEvents()
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Error deleting event: ' + error.message)
    }
  }

  if (loading) {
    return <div>Loading events...</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Events</h2>

      {events.length === 0 ? (
        <p>No events found.</p>
      ) : (
        <div className="card">
          <h3 style={{ marginBottom: '15px' }}>All Events</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>Asset ID</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Asset Name</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Start Date</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>End Date</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Status After</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Description</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{event.asset?.asset_id || '-'}</td>
                  <td style={{ padding: '10px' }}>{event.asset?.name || '-'}</td>
                  <td style={{ padding: '10px' }}>
                    {event.start_date ? new Date(event.start_date).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {event.end_date ? new Date(event.end_date).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span className={`status-badge ${event.end_status === 'decommissioned' ? 'status-overdue' : 'status-compliant'}`}>
                      {event.end_status ? event.end_status.toUpperCase() : '-'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', maxWidth: '300px', whiteSpace: 'pre-wrap' }}>
                    {event.description}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {currentUserRole === 'admin' ? (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '5px 10px', fontSize: '0.85rem' }}
                        onClick={() => handleDeleteEvent(event.id)}
                      >
                        Delete
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: '#777' }}>View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
