import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ChecklistAlertResolveModal({ alertId, checklistId, onClose, onResolved }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checklist, setChecklist] = useState(null)
  const [issueItems, setIssueItems] = useState([])
  const [resolutions, setResolutions] = useState({})
  const [alert, setAlert] = useState(null)
  const isResolved = alert?.is_resolved === true

  useEffect(() => {
    if (!alertId || !checklistId) return
    loadChecklist()
  }, [alertId, checklistId])

  const loadChecklist = async () => {
    setLoading(true)
    try {
      const { data: alertData, error: alertError } = await supabase
        .from('checklist_alerts')
        .select('id, is_resolved, resolved_at, resolved_by')
        .eq('id', alertId)
        .single()

      if (alertError) throw alertError
      setAlert(alertData)

      const { data: checklistData, error: checklistError } = await supabase
        .from('inspection_checklists')
        .select(`
          id,
          status,
          inspections:inspection_id (
            id,
            linked_group_id,
            asset_items (asset_id, name),
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

      const issues = (itemsData || []).filter((item) => {
        return item.comments && item.comments.trim().length > 0
      })

      const { data: resolutionData, error: resolutionError } = await supabase
        .from('checklist_alert_resolutions')
        .select('checklist_item_id, resolution_text')
        .eq('alert_id', alertId)

      if (resolutionError) throw resolutionError

      setChecklist(checklistData)
      setIssueItems(issues)
      const resolutionMap = (resolutionData || []).reduce((acc, row) => {
        acc[row.checklist_item_id] = row.resolution_text
        return acc
      }, {})
      setResolutions(
        issues.reduce((acc, item) => {
          acc[item.id] = resolutionMap[item.id] || ''
          return acc
        }, {})
      )
    } catch (error) {
      console.error('Error loading checklist alert resolution:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateResolution = (itemId, value) => {
    setResolutions((prev) => ({ ...prev, [itemId]: value }))
  }

  const handleResolve = async () => {
    if (isResolved) {
      onClose?.()
      return
    }

    if (issueItems.length === 0) {
      alert('No issue items found for this checklist.')
      return
    }

    const missing = issueItems.filter((item) => !resolutions[item.id]?.trim())
    if (missing.length > 0) {
      alert('Please enter a resolution for each item that has comments.')
      return
    }

    setSaving(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id || null

      const rows = issueItems.map((item) => ({
        alert_id: alertId,
        checklist_item_id: item.id,
        resolution_text: resolutions[item.id].trim(),
        created_by: userId,
      }))

      const { error: insertError } = await supabase
        .from('checklist_alert_resolutions')
        .insert(rows)

      if (insertError) throw insertError

      const { error: alertError } = await supabase
        .from('checklist_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        })
        .eq('id', alertId)

      if (alertError) throw alertError

      const inspectionId = checklist?.inspections?.id || null
      if (inspectionId) {
        const summary = issueItems
          .map((item) => `${item.label}: ${resolutions[item.id].trim()}`)
          .join('; ')

        const { error: logError } = await supabase
          .from('inspection_logs')
          .insert({
            inspection_id: inspectionId,
            action: 'checklist_issue_resolved',
            details: summary,
            created_by: userId,
          })

        if (logError) {
          console.warn('Unable to log checklist resolution:', logError.message)
        }
      }

      alert('Resolution saved and checklist alert resolved.')
      onResolved?.()
      onClose?.()
    } catch (error) {
      console.error('Error resolving checklist alert:', error)
      alert(error.message || 'Error resolving checklist alert.')
    } finally {
      setSaving(false)
    }
  }

  if (!alertId || !checklistId) return null

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

        <h2 style={{ marginBottom: '10px' }}>Resolve Checklist Issues</h2>
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
        ) : issueItems.length === 0 ? (
          <p style={{ color: '#777' }}>No issue items found for this checklist.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Comment</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Resolution</th>
              </tr>
            </thead>
            <tbody>
        {issueItems.map((item) => (
          <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '8px' }}>{item.label}</td>
            <td style={{ padding: '8px' }}>{item.status || 'unknown'}</td>
            <td style={{ padding: '8px' }}>{item.comments || ''}</td>
            <td style={{ padding: '8px' }}>
              <input
                type="text"
                value={resolutions[item.id] || ''}
                onChange={(e) => updateResolution(item.id, e.target.value)}
                disabled={isResolved}
                style={{ width: '100%' }}
              />
            </td>
          </tr>
        ))}
      </tbody>
          </table>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleResolve}
            disabled={saving || issueItems.length === 0 || isResolved}
            style={{ marginLeft: '10px' }}
          >
            {isResolved ? 'Resolved' : saving ? 'Resolving...' : 'Resolve Checklist'}
          </button>
        </div>
      </div>
    </div>
  )
}
