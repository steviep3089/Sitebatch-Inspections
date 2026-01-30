import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function MyChecklistDetailModal({ checklistId, onClose, onUpdated }) {
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState(null)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [admins, setAdmins] = useState([])
  const [selectedAdmins, setSelectedAdmins] = useState([])

  useEffect(() => {
    if (!checklistId) return

    const load = async () => {
      setLoading(true)
      try {
        const { data: checklistData, error: checklistError } = await supabase
          .from('inspection_checklists')
          .select(`
            id,
            status,
            due_date,
            inspections:inspection_id (
              id,
              linked_group_id,
              asset_items (asset_id, name, location),
              inspection_types (name)
            )
          `)
          .eq('id', checklistId)
          .single()

        if (checklistError) throw checklistError

        const { data: itemsData, error: itemsError } = await supabase
          .from('inspection_checklist_items')
          .select('id, label, status, comments, sort_order')
          .eq('checklist_id', checklistId)
          .order('sort_order', { ascending: true })

        if (itemsError) throw itemsError

        setChecklist(checklistData)
        setItems((itemsData || []).map((item) => ({
          ...item,
          status: item.status || 'not_checked',
          comments: item.comments || '',
        })))
      } catch (error) {
        console.error('Error loading checklist for completion:', error)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [checklistId])

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, email, role')
          .eq('role', 'admin')
          .order('email', { ascending: true })

        if (error) throw error
        setAdmins(data || [])
        setSelectedAdmins([])
      } catch (error) {
        console.error('Error loading admins:', error)
        setAdmins([])
        setSelectedAdmins([])
      }
    }

    loadAdmins()
  }, [])

  const handleItemChange = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    )
  }

  const toggleAdmin = (id) => {
    setSelectedAdmins((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    if (!checklistId || items.length === 0) {
      onClose?.()
      return
    }

    const incomplete = items.filter(
      (item) => !item.status || item.status === 'not_checked'
    )

    if (incomplete.length > 0) {
      alert('All items must be categorised before the inspection checklist can be completed.')
      return
    }

    const missingComments = items.filter(
      (item) =>
        (item.status === 'defective' || item.status === 'not_available') &&
        (!item.comments || !item.comments.trim())
    )

    if (missingComments.length > 0) {
      alert('Please add comments for all Defective or Not available items.')
      return
    }

    const hasIssues = items.some(
      (item) => item.status === 'defective' || item.status === 'not_available'
    )

    if (hasIssues && selectedAdmins.length === 0) {
      alert('Please select at least one admin to notify about checklist issues.')
      return
    }

    setSaving(true)
    try {
      const updates = items.map((item) => ({
        id: item.id,
        status: item.status || 'not_checked',
        comments: item.comments || null,
      }))

      // Update each existing checklist item row by id to avoid
      // inserting new rows without checklist_id/template_id.
      for (const row of updates) {
        const { error: itemError } = await supabase
          .from('inspection_checklist_items')
          .update({
            status: row.status,
            comments: row.comments,
          })
          .eq('id', row.id)

        if (itemError) throw itemError
      }

      if (hasIssues) {
        const { data: alertData, error: alertError } = await supabase.functions.invoke(
          'send-checklist-issue-alert',
          {
            body: {
              checklist_id: checklistId,
              admin_ids: selectedAdmins,
            },
          }
        )

        if (alertError) throw alertError
        if (alertData?.error) throw new Error(alertData.error)
      }

      const { error: checklistError } = await supabase
        .from('inspection_checklists')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', checklistId)

      if (checklistError) throw checklistError

      alert('Checklist saved and marked as completed.')
      // Refresh the whole page so header bell count and
      // any other views pick up the latest status without
      // needing a manual reload.
      if (typeof window !== 'undefined') {
        window.location.reload()
      } else {
        if (onUpdated) onUpdated()
        onClose?.()
      }
    } catch (error) {
      console.error('Error saving checklist completion:', error)
      alert('Error saving checklist: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (!checklistId) return null

  const hasIncompleteItems =
    items.length > 0 && items.some((item) => !item.status || item.status === 'not_checked')

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
        zIndex: 1300,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '900px',
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

        <h2 style={{ marginBottom: '10px' }}>Complete Checklist</h2>
        {checklist && (
          <p style={{ marginBottom: '10px', color: '#555' }}>
            Inspection: {checklist.inspections?.inspection_types?.name || 'Unknown'} - Asset{' '}
            {checklist.inspections?.asset_items?.asset_id || ''}
            {checklist.inspections?.linked_group_id && (
              <span
                style={{
                  marginLeft: '8px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#0f766e',
                  background: '#e6fffb',
                  border: '1px solid #99f6e4',
                  padding: '2px 6px',
                  borderRadius: '999px',
                }}
              >
                Linked inspection
              </span>
            )}
          </p>
        )}

        {loading ? (
          <p>Loading checklist...</p>
        ) : items.length === 0 ? (
          <p style={{ color: '#777' }}>No items found for this checklist.</p>
        ) : (
          <>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '10px' }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>{item.label}</td>
                    <td style={{ padding: '8px' }}>
                      <select
                        value={item.status || 'not_checked'}
                        onChange={(e) => handleItemChange(item.id, 'status', e.target.value)}
                      >
                        <option value="not_checked">Not checked</option>
                        <option value="inspected">Inspected</option>
                        <option value="not_available">Not available</option>
                        <option value="defective">Defective</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="text"
                        value={item.comments || ''}
                        onChange={(e) => handleItemChange(item.id, 'comments', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasIncompleteItems && (
              <p style={{ marginTop: '10px', color: '#c53030' }}>
                All items must be categorised before the inspection checklist can be completed.
              </p>
            )}
          </>
        )}

        {items.some((item) => item.status === 'defective' || item.status === 'not_available') && (
          <div
            style={{
              background: '#f0f8ff',
              borderRadius: '6px',
              padding: '12px',
              marginTop: '16px',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '6px' }}>Notify Admins</strong>
            <p style={{ margin: 0, marginBottom: '10px', color: '#555' }}>
              This checklist has issues that require attention. Select the admins to notify.
            </p>
            {admins.length === 0 ? (
              <p style={{ margin: 0, color: '#777' }}>No admins found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {admins.map((admin) => {
                  const selected = selectedAdmins.includes(admin.id)
                  return (
                    <label key={admin.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleAdmin(admin.id)}
                      />
                      <span>{admin.email}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '16px',
          }}
        >
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={
              saving ||
              items.length === 0 ||
              hasIncompleteItems
            }
          >
            {saving ? 'Saving...' : 'Save & mark complete'}
          </button>
        </div>
      </div>
    </div>
  )
}
