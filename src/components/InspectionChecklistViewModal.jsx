import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function InspectionChecklistViewModal({ inspection, checklistId, onClose, onDeleted }) {
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState(null)
  const [items, setItems] = useState([])
  const [users, setUsers] = useState([])
  const [assignedUserId, setAssignedUserId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!checklistId) return

    const load = async () => {
      setLoading(true)
      try {
        const [checklistRes, itemsRes, usersRes] = await Promise.all([
          supabase
            .from('inspection_checklists')
            .select('id, status, due_date, completed_at, created_at, assigned_user_id')
            .eq('id', checklistId)
            .single(),
          supabase
            .from('inspection_checklist_items')
            .select('id, label, status, comments, sort_order, template_id')
            .eq('checklist_id', checklistId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('user_profiles')
            .select('id, email, role')
            .order('email'),
        ])
        if (checklistRes.error) throw checklistRes.error
        if (itemsRes.error) throw itemsRes.error
        if (usersRes.error) throw usersRes.error

        setChecklist(checklistRes.data)
        setItems(itemsRes.data || [])
        setUsers(usersRes.data || [])
        setAssignedUserId(checklistRes.data?.assigned_user_id || '')

        const rawDue = checklistRes.data?.due_date || inspection?.due_date || null
        if (rawDue) {
          const d = new Date(rawDue)
          const iso = d.toISOString().split('T')[0]
          setDueDate(iso)
        } else {
          setDueDate('')
        }
      } catch (error) {
        console.error('Error loading checklist for view:', error)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [checklistId])

  const getStatusLabel = (status) => {
    switch (status) {
      case 'inspected':
        return 'Inspected'
      case 'not_available':
        return 'Not available'
      case 'defective':
        return 'Defective'
      case 'not_checked':
      default:
        return 'Not checked'
    }
  }

  const handleSaveChanges = async () => {
    if (!checklistId) return

    setSaving(true)
    try {
      const updates = {
        assigned_user_id: assignedUserId || null,
        due_date: dueDate || null,
      }

      const { error } = await supabase
        .from('inspection_checklists')
        .update(updates)
        .eq('id', checklistId)

      if (error) throw error

      setChecklist((prev) => (prev ? { ...prev, ...updates } : prev))

      alert('Checklist details updated.')
    } catch (error) {
      console.error('Error saving checklist changes:', error)
      alert('Error saving changes: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleResendEmail = async () => {
    if (!checklistId) return

    setResending(true)
    try {
      await supabase.functions.invoke('send-checklist-email', {
        body: { checklist_id: checklistId },
      })

      alert('Checklist email resent to the assigned user.')
    } catch (error) {
      console.error('Error resending checklist email:', error)
      let details = error?.message || 'Unknown error'
      try {
        const resp = error?.context?.response
        if (resp) {
          const text = await resp.text()
          if (text) {
            details += ' | ' + text
          }
        }
      } catch (inner) {
        console.error('Error reading function error response:', inner)
      }
      alert('Error resending checklist email: ' + details)
    } finally {
      setResending(false)
    }
  }

  const handleDeleteItem = async (itemId) => {
    if (!itemId) return
    const confirmed = window.confirm('Remove this item from the checklist?')
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('inspection_checklist_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      setItems((prev) => prev.filter((item) => item.id !== itemId))
    } catch (error) {
      console.error('Error deleting checklist item:', error)
      alert('Error deleting item: ' + (error.message || 'Unknown error'))
    }
  }

  const handleDeleteChecklist = async () => {
    if (!checklistId) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this checklist and all of its items? This cannot be undone.'
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const { error: itemsError } = await supabase
        .from('inspection_checklist_items')
        .delete()
        .eq('checklist_id', checklistId)

      if (itemsError) throw itemsError

      const { error: checklistError } = await supabase
        .from('inspection_checklists')
        .delete()
        .eq('id', checklistId)

      if (checklistError) throw checklistError

      alert('Checklist deleted.')
      if (onDeleted) {
        onDeleted()
      } else if (onClose) {
        onClose()
      }
    } catch (error) {
      console.error('Error deleting checklist:', error)
      alert('Error deleting checklist: ' + (error.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  if (!inspection || !checklistId) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '800px',
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          ×
        </button>

        <h2 style={{ marginBottom: '10px' }}>Inspection Checklist</h2>
        <p style={{ marginBottom: '8px', color: '#555' }}>
          Inspection: {inspection.inspection_types?.name || 'Unknown'} – Asset{' '}
          {inspection.asset_items?.asset_id || ''}
        </p>
        {checklist && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '16px',
              alignItems: 'flex-end',
            }}
          >
            <p style={{ margin: 0, color: '#777', fontSize: '0.9rem' }}>
              Status: {checklist.status}
            </p>

            <div className="form-group" style={{ minWidth: '170px' }}>
              <label>Checklist due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ minWidth: '220px' }}>
              <label>Assigned user</label>
              <select
                value={assignedUserId || ''}
                onChange={(e) => setAssignedUserId(e.target.value)}
              >
                <option value="">(none)</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email} {user.role ? `(${user.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginLeft: 'auto',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDeleteChecklist}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete checklist'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleSaveChanges}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResendEmail}
                disabled={resending}
              >
                {resending ? 'Resending...' : 'Resend checklist email'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p>Loading checklist...</p>
        ) : items.length === 0 ? (
          <p style={{ color: '#777' }}>No items found for this checklist.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Comments</th>
                <th style={{ padding: '8px', textAlign: 'left' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{item.label}</td>
                  <td style={{ padding: '8px' }}>{getStatusLabel(item.status)}</td>
                  <td style={{ padding: '8px' }}>{item.comments || ''}</td>
                  <td style={{ padding: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
