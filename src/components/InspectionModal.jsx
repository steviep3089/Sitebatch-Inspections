import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function InspectionModal({ inspection, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    due_date: '',
    completed_date: '',
    date_completed: '',
    status: 'pending',
    notes: '',
    assigned_to: '',
    certs_received: false,
    certs_link: '',
    next_inspection_date: '',
    next_inspection_na: false,
    defect_portal_actions: false,
    defect_portal_na: false
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (inspection) {
      setFormData({
        due_date: inspection.due_date || '',
        completed_date: inspection.completed_date || '',
        date_completed: inspection.date_completed || '',
        status: inspection.status || 'pending',
        notes: inspection.notes || '',
        assigned_to: inspection.assigned_to || '',
        certs_received: inspection.certs_received || false,
        certs_link: inspection.certs_link || '',
        next_inspection_date: inspection.next_inspection_date || '',
        next_inspection_na: inspection.next_inspection_na || false,
        defect_portal_actions: inspection.defect_portal_actions || false,
        defect_portal_na: inspection.defect_portal_na || false
      })
    }
  }, [inspection])

  const certsUrl =
    formData.certs_link ||
    inspection?.certs_link ||
    inspection?.inspection_types?.google_drive_url ||
    null

  const canMarkComplete = () => {
    // Check 1: Date Next Inspection Required - must have date OR N/A checked
    const nextInspectionValid = formData.next_inspection_na || formData.next_inspection_date
    
    // Check 2: Certs Received - must be ticked AND link provided
    const certsValid = formData.certs_received && formData.certs_link
    
    // Check 3: Defect Portal - Actions created OR N/A must be checked
    const defectPortalValid = formData.defect_portal_actions || formData.defect_portal_na
    
    return nextInspectionValid && certsValid && defectPortalValid
  }

  const handleMarkComplete = async () => {
    if (!canMarkComplete()) {
      let messages = []
      
      if (!formData.next_inspection_na && !formData.next_inspection_date) {
        messages.push('- Date Next Inspection is required (enter date or mark N/A)')
      }
      
      if (!formData.certs_received || !formData.certs_link) {
        if (!formData.certs_received) {
          messages.push('- Certs Received must be ticked')
        }
        if (formData.certs_received && !formData.certs_link) {
          messages.push('- Google Drive Link for Certs must be provided')
        }
      }
      
      if (!formData.defect_portal_actions && !formData.defect_portal_na) {
        messages.push('- Actions created in Defect Portal OR N/A must be selected')
      }
      
      alert('Cannot mark as complete. Please complete:\n\n' + messages.join('\n'))
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('inspections')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', inspection.id)

      if (error) throw error

      alert('Inspection marked as complete!')
      onUpdate()
      onClose()
    } catch (error) {
      console.error('Error marking complete:', error)
      alert('Error marking complete: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      // Clean up empty date strings - convert to null
      const cleanedData = {
        ...formData,
        due_date: formData.due_date || null,
        completed_date: formData.completed_date || null,
        date_completed: formData.date_completed || null,
        next_inspection_date: formData.next_inspection_date || null,
        certs_link: formData.certs_link || null,
        assigned_to: formData.assigned_to || null,
        notes: formData.notes || null
      }

      const { error } = await supabase
        .from('inspections')
        .update(cleanedData)
        .eq('id', inspection.id)

      if (error) throw error

      alert('Inspection updated successfully!')
      onUpdate()
      onClose()
    } catch (error) {
      console.error('Error updating inspection:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      alert('Error updating inspection: ' + (error.message || JSON.stringify(error)))
    } finally {
      setLoading(false)
    }
  }

  if (!inspection) return null

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
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '30px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#666'
          }}
        >
          ×
        </button>

        <h2 style={{ marginBottom: '20px' }}>
          {inspection.inspection_types?.name || 'Inspection Details'}
        </h2>

        <div className="form-group">
          <label>Inspection Type</label>
          <input
            type="text"
            value={inspection.inspection_types?.name || 'N/A'}
            disabled
            style={{ backgroundColor: '#f5f5f5' }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="assigned_to">Company / Person Assigned To</label>
          <input
            id="assigned_to"
            type="text"
            value={formData.assigned_to}
            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="due_date">Due Date</label>
          <input
            id="due_date"
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="date_completed">Date Completed</label>
          <input
            id="date_completed"
            type="date"
            value={formData.date_completed}
            onChange={(e) => setFormData({ ...formData, date_completed: e.target.value })}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="next_inspection_date">Date Next Inspection Required *</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={formData.next_inspection_na}
                onChange={(e) => setFormData({ ...formData, next_inspection_na: e.target.checked, next_inspection_date: '' })}
              />
              N/A
            </label>
          </div>
          {!formData.next_inspection_na && (
            <input
              id="next_inspection_date"
              type="date"
              value={formData.next_inspection_date}
              onChange={(e) => setFormData({ ...formData, next_inspection_date: e.target.value })}
            />
          )}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="certs_received_checkbox"
                checked={formData.certs_received}
                onChange={(e) => setFormData({ ...formData, certs_received: e.target.checked })}
              />
              <label htmlFor="certs_received_checkbox" style={{ margin: 0, cursor: 'pointer' }}>
                Certs Received *
              </label>
            </div>
            {certsUrl && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                onClick={() => {
                  window.open(
                    certsUrl,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }}
              >
                Open Folder
              </button>
            )}
          </div>
        </div>

        {formData.certs_received && (
          <div className="form-group">
            <label htmlFor="certs_link">Google Drive Link for Certs *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                id="certs_link"
                type="url"
                value={formData.certs_link}
                onChange={(e) => setFormData({ ...formData, certs_link: e.target.value })}
                placeholder="https://drive.google.com/..."
                required={formData.certs_received}
                style={{ flex: 1 }}
              />
              {formData.certs_link && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                  onClick={() => {
                    window.open(formData.certs_link, '_blank', 'noopener,noreferrer')
                  }}
                >
                  ↗
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="defect_portal_actions_checkbox"
              checked={formData.defect_portal_actions}
              onChange={(e) => setFormData({ ...formData, defect_portal_actions: e.target.checked, defect_portal_na: false })}
            />
            <label htmlFor="defect_portal_actions_checkbox" style={{ margin: 0, cursor: 'pointer' }}>
              Actions created in Defect Portal *
            </label>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="defect_portal_na_checkbox"
              checked={formData.defect_portal_na}
              onChange={(e) => setFormData({ ...formData, defect_portal_na: e.target.checked, defect_portal_actions: false })}
            />
            <label htmlFor="defect_portal_na_checkbox" style={{ margin: 0, cursor: 'pointer' }}>
              Defect Portal N/A *
            </label>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            rows="4"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Current Status</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span 
              className={`status-badge ${
                formData.status === 'completed' ? 'status-compliant' : 
                formData.status === 'overdue' ? 'status-overdue' : 
                'status-due-soon'
              }`}
            >
              {formData.status.toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            className="btn"
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
        </div>

        {/* Mark Complete Button at Bottom */}
        <div style={{ marginTop: '20px' }}>
          <button
            className="btn btn-primary"
            onClick={handleMarkComplete}
            disabled={loading || !canMarkComplete()}
            style={{
              width: '100%',
              backgroundColor: canMarkComplete() ? '#4CAF50' : '#ccc',
              cursor: canMarkComplete() ? 'pointer' : 'not-allowed'
            }}
          >
            {loading ? 'Processing...' : 'Mark as Complete'}
          </button>
          {!canMarkComplete() && (
            <div style={{ fontSize: '0.85rem', color: '#f44336', marginTop: '8px', fontStyle: 'italic' }}>
              <strong>Required to complete:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                <li>Date Next Inspection (enter date or mark N/A)</li>
                <li>Certs Received (tick and add Google Drive link)</li>
                <li>Defect Portal (select "Actions created" or "N/A")</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
