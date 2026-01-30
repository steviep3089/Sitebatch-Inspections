import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import MyChecklistDetailModal from './MyChecklistDetailModal'

export default function MyChecklists() {
  const [loading, setLoading] = useState(true)
  const [checklists, setChecklists] = useState([])
  const [activeChecklistId, setActiveChecklistId] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)

  useEffect(() => {
    const init = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData?.user?.id || null
        setCurrentUserId(userId)
        if (!userId) {
          setChecklists([])
          setLoading(false)
          return
        }
        await loadChecklists(userId)
      } catch (error) {
        console.error('Error initialising MyChecklists:', error)
        setLoading(false)
      }
    }

    init()
  }, [])

  // Keep this view in sync with the bell; when Header's
  // realtime subscription sees checklist changes it emits
  // a 'checklists-updated' event that we listen for here.
  useEffect(() => {
    const handler = () => {
      if (currentUserId) {
        // Small delay to avoid any race with the realtime
        // event firing before the new data is fully visible.
        setTimeout(() => {
          loadChecklists(currentUserId)
        }, 300)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('checklists-updated', handler)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('checklists-updated', handler)
      }
    }
  }, [currentUserId])

  const loadChecklists = async (userId) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('inspection_checklists')
        .select(`
          id,
          status,
          due_date,
          created_at,
          inspections:inspection_id (
            id,
            linked_group_id,
            asset_items (asset_id, name),
            inspection_types (name)
          )
        `)
        .eq('assigned_user_id', userId)
        .order('due_date', { ascending: true })

      if (error) throw error

      const list = data || []
      setChecklists(list)

      // Sync the bell badge with what this page sees: we
      // count only non-completed checklists for notifications.
      const pending = list.filter((cl) => cl.status !== 'completed').length
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('notifications-sync', {
            detail: { pendingChecklists: pending },
          })
        )
      }
    } catch (error) {
      console.error('Error loading my checklists:', error)
      alert('Error loading your checklists: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChecklist = (id) => {
    setActiveChecklistId(id)
  }

  const handleModalUpdated = () => {
    if (currentUserId) {
      loadChecklists(currentUserId)
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: '15px' }}>My Assigned Checklists</h3>
      {loading ? (
        <p>Loading your checklists...</p>
      ) : checklists.length === 0 ? (
        <p>You currently have no assigned checklists.</p>
      ) : (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span>{cl.inspections?.inspection_types?.name || 'N/A'}</span>
                    {cl.inspections?.linked_group_id && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#0f766e',
                          background: '#e6fffb',
                          border: '1px solid #99f6e4',
                          padding: '2px 6px',
                          borderRadius: '999px',
                        }}
                      >
                        Linked
                      </span>
                    )}
                  </div>
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
                    onClick={() => handleOpenChecklist(cl.id)}
                  >
                    {cl.status === 'completed' ? 'View' : 'Complete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeChecklistId && (
        <MyChecklistDetailModal
          checklistId={activeChecklistId}
          onClose={() => setActiveChecklistId(null)}
          onUpdated={handleModalUpdated}
        />
      )}
    </div>
  )
}
