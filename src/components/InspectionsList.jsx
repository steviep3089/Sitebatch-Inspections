import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import InspectionModal from './InspectionModal'
import InspectionChecklistModal from './InspectionChecklistModal'
import InspectionChecklistViewModal from './InspectionChecklistViewModal'

export default function InspectionsList() {
  const [inspections, setInspections] = useState([])
  const [plantItems, setPlantItems] = useState([])
  const [inspectionTypes, setInspectionTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showOtherType, setShowOtherType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [selectedInspection, setSelectedInspection] = useState(null)
  const [checklistInspection, setChecklistInspection] = useState(null)
  const [inspectionChecklists, setInspectionChecklists] = useState({})
  const [viewChecklist, setViewChecklist] = useState(null) // { inspection, checklistId }
  const [selectedAssetIds, setSelectedAssetIds] = useState([])
  const [formData, setFormData] = useState({
    inspection_type_id: '',
    due_date: '',
    status: 'pending',
    notes: '',
    assigned_to: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Fetch inspections
      const { data: inspectionsData, error: inspectionsError } = await supabase
        .from('inspections')
        .select(`
          id,
          asset_id,
          inspection_type_id,
          due_date,
          date_completed,
          completed_date,
          status,
          notes,
          assigned_to,
          next_inspection_date,
          next_inspection_na,
          certs_received,
          certs_link,
          defect_portal_actions,
          defect_portal_na,
          asset_items (asset_id, name),
          inspection_types (name, google_drive_url)
        `)
        .order('due_date', { ascending: true })

      if (inspectionsError) throw inspectionsError

      // Fetch assets for dropdown
      const { data: assetData, error: assetError } = await supabase
        .from('asset_items')
        .select('id, asset_id, name, status')
        .order('sort_order', { ascending: true, nullsFirst: true })
        .order('asset_id')

      if (assetError) throw assetError

      // Fetch inspection types for dropdown
      const { data: typesData, error: typesError } = await supabase
        .from('inspection_types')
        .select('*')
        .order('name')

      if (typesError) throw typesError

      setInspections(inspectionsData || [])
      setPlantItems(assetData || [])
      setInspectionTypes(typesData || [])

      // Fetch any checklists that already exist for these inspections
      const inspectionIds = (inspectionsData || []).map((insp) => insp.id)
      const checklistMap = {}

      if (inspectionIds.length > 0) {
        const { data: checklistData, error: checklistError } = await supabase
          .from('inspection_checklists')
          .select('id, inspection_id, status, created_at')
          .in('inspection_id', inspectionIds)
          .order('created_at', { ascending: false })

        if (checklistError) throw checklistError

        ;(checklistData || []).forEach((row) => {
          // Keep only the most recent checklist per inspection
          if (!checklistMap[row.inspection_id]) {
            checklistMap[row.inspection_id] = {
              id: row.id,
              status: row.status,
            }
          }
        })
      }

      setInspectionChecklists(checklistMap)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (selectedAssetIds.length === 0) {
        alert('Please select at least one asset.')
        return
      }

      let inspectionTypeId = formData.inspection_type_id

      // If "Other" is selected, create new inspection type
      if (formData.inspection_type_id === 'other' && newTypeName) {
        const { data: newType, error: typeError } = await supabase
          .from('inspection_types')
          .insert([{ name: newTypeName, statutory_requirement: true }])
          .select()
          .single()

        if (typeError) throw typeError
        inspectionTypeId = newType.id
      }

      const payloads = selectedAssetIds.map((assetId) => ({
        asset_id: assetId,
        inspection_type_id: inspectionTypeId,
        due_date: formData.due_date || null,
        status: formData.status,
        notes: formData.notes || null,
        assigned_to: formData.assigned_to || null,
      }))

      const { data: newInspections, error } = await supabase
        .from('inspections')
        .insert(payloads)
        .select()

      if (error) throw error

      // Log creation of the inspection
      try {
        const { data: authData } = await supabase.auth.getUser()
        const currentUserId = authData?.user?.id || null
        const currentUserEmail = authData?.user?.email || null

        const assignedText = formData.assigned_to
          ? ` Assigned to ${formData.assigned_to}.`
          : ''

        const assetMap = new Map(
          (plantItems || []).map((asset) => [asset.id, asset.asset_id])
        )

        const logPayloads = (newInspections || []).map((inspection) => {
          const assetLabel = assetMap.get(inspection.asset_id) || 'Unknown asset'
          const payload = {
            inspection_id: inspection.id,
            action: 'created',
            details: `${currentUserEmail || 'Unknown user'}: Inspection scheduled from Inspections list for ${assetLabel}.${assignedText}`,
          }
          if (currentUserId) {
            payload.created_by = currentUserId
          }
          return payload
        })

        if (logPayloads.length > 0) {
          const { error: logError } = await supabase
            .from('inspection_logs')
            .insert(logPayloads)
          if (logError) {
            console.error('Error logging inspection creation:', logError)
          }
        }
      } catch (logError) {
        console.error('Error logging inspection creation:', logError)
      }

      setShowForm(false)
      setShowOtherType(false)
      setNewTypeName('')
      setSelectedAssetIds([])
      setFormData({
        inspection_type_id: '',
        due_date: '',
        status: 'pending',
        notes: '',
        assigned_to: '',
      })
      fetchData()
    } catch (error) {
      console.error('Error adding inspection:', error)
      alert('Error adding inspection: ' + error.message)
    }
  }

  const handleCompleteInspection = async (inspectionId) => {
    try {
      // First fetch the inspection to validate requirements
      const { data: inspection, error: fetchError } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', inspectionId)
        .single()

      if (fetchError) throw fetchError

      // Validate three requirements
      const hasNextInspection = inspection.next_inspection_na || inspection.next_inspection_date
      const hasCerts = inspection.certs_received && inspection.certs_link
      const hasDefectPortal = inspection.defect_portal_actions || inspection.defect_portal_na

      if (!hasNextInspection || !hasCerts || !hasDefectPortal) {
        let messages = []
        
        if (!hasNextInspection) {
          messages.push('- Date Next Inspection is required (enter date or mark N/A)')
        }
        
        if (!hasCerts) {
          if (!inspection.certs_received) {
            messages.push('- Certs Received must be ticked')
          }
          if (inspection.certs_received && !inspection.certs_link) {
            messages.push('- Google Drive Link for Certs must be provided')
          }
        }
        
        if (!hasDefectPortal) {
          messages.push('- Actions created in Defect Portal OR N/A must be selected')
        }
        
        alert('Cannot mark as complete. Please complete:\n\n' + messages.join('\n'))
        return
      }

      const { error } = await supabase
        .from('inspections')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', inspectionId)

      if (error) throw error

      // Log completion from list view
      try {
        const { data: authData } = await supabase.auth.getUser()
        const currentUserId = authData?.user?.id || null
        const currentUserEmail = authData?.user?.email || null

        const payload = {
          inspection_id: inspectionId,
          action: 'completed',
          details: `${currentUserEmail || 'Unknown user'}: Inspection marked as complete from Inspections list.`,
        }
        if (currentUserId) {
          payload.created_by = currentUserId
        }
        const { error: logError } = await supabase
          .from('inspection_logs')
          .insert(payload)
        if (logError) {
          console.error('Error logging inspection completion:', logError)
        }
      } catch (logError) {
        console.error('Error logging inspection completion:', logError)
      }
      fetchData()
    } catch (error) {
      console.error('Error completing inspection:', error)
      alert('Error completing inspection: ' + error.message)
    }
  }

  const getStatusBadge = (inspection) => {
    if (inspection.status === 'completed') return 'status-compliant'
    
    const today = new Date()
    const dueDate = new Date(inspection.due_date)
    
    if (dueDate < today) return 'status-overdue'
    
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    if (dueDate <= thirtyDaysFromNow) return 'status-due-soon'
    
    return 'status-compliant'
  }

  const getDueLabel = (inspection) => {
    if (!inspection.due_date || inspection.status !== 'pending') return ''

    const oneDayMs = 24 * 60 * 60 * 1000
    const today = new Date()
    const dueDate = new Date(inspection.due_date)
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)

    const diffDays = Math.round((dueDate - today) / oneDayMs)

    if (diffDays === 0) return 'Due today'
    if (diffDays > 0) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} until due`
    }

    const overdueDays = Math.abs(diffDays)
    return `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`
  }

  if (loading) {
    return <div>Loading inspections...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Inspections</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Schedule Inspection'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>Schedule New Inspection</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="asset_id">Asset *</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedAssetIds(plantItems.map((asset) => asset.id))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedAssetIds([])}
                >
                  Clear
                </button>
              </div>
              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                {plantItems.map((asset) => (
                  <label
                    key={asset.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      width: 'fit-content',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAssetIds.includes(asset.id)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setSelectedAssetIds((prev) => {
                          if (checked) return [...prev, asset.id]
                          return prev.filter((id) => id !== asset.id)
                        })
                      }}
                    />
                    {asset.asset_id}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="inspection_type_id">Inspection Type *</label>
              <select
                id="inspection_type_id"
                value={formData.inspection_type_id}
                onChange={(e) => {
                  setFormData({ ...formData, inspection_type_id: e.target.value })
                  setShowOtherType(e.target.value === 'other')
                }}
                required
              >
                <option value="">Select inspection type</option>
                {inspectionTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
                <option value="other">Other (Create New Type)</option>
              </select>
            </div>
            {showOtherType && (
              <div className="form-group">
                <label htmlFor="new_type_name">New Inspection Type Name *</label>
                <input
                  id="new_type_name"
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Enter new inspection type name"
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="assigned_to">Company / Person Assigned To</label>
              <input
                id="assigned_to"
                type="text"
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                placeholder="e.g., ABC Inspection Services"
              />
            </div>
            <div className="form-group">
              <label htmlFor="due_date">Due Date *</label>
              <input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                rows="3"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Schedule Inspection
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '15px' }}>All Inspections</h3>
        {inspections.length === 0 ? (
          <p>No inspections found. Schedule your first inspection above.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>Asset ID</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Asset Name</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Inspection Type</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Due Date</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((inspection) => (
                <tr 
                  key={inspection.id} 
                  style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                  onClick={() => setSelectedInspection(inspection)}
                >
                  <td style={{ padding: '10px' }}>{inspection.asset_items?.asset_id}</td>
                  <td style={{ padding: '10px' }}>{inspection.asset_items?.name}</td>
                  <td style={{ padding: '10px' }}>
                    {inspection.inspection_types?.name}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {new Date(inspection.due_date).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span className={`status-badge ${getStatusBadge(inspection)}`}>
                        {inspection.status.toUpperCase()}
                      </span>
                      {getDueLabel(inspection) && (
                        <span style={{ fontSize: '0.8rem', color: '#555' }}>
                          {getDueLabel(inspection)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {inspection.status === 'pending' ? (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '5px 10px', fontSize: '0.85rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          // Open the inspection modal so the user can
                          // complete the required fields before marking complete
                          setSelectedInspection(inspection)
                        }}
                      >
                        Mark Complete
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.85rem',
                          borderRadius: '999px',
                          border: 'none',
                          backgroundColor: '#DAA520', // gold
                          color: '#fff',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'default',
                        }}
                      >
                        <span style={{ fontSize: '1rem' }}>🔒</span>
                        <span>Locked</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedInspection && (
        <InspectionModal
          inspection={selectedInspection}
          onClose={() => setSelectedInspection(null)}
          onUpdate={fetchData}
          onOpenChecklist={(insp) => setChecklistInspection(insp)}
          hasChecklist={!!inspectionChecklists[selectedInspection.id]}
          checklistStatus={inspectionChecklists[selectedInspection.id]?.status}
          onViewChecklist={() => {
            const checklistId = inspectionChecklists[selectedInspection.id]?.id
            if (!checklistId) return
            setViewChecklist({ inspection: selectedInspection, checklistId })
          }}
        />
      )}

      {checklistInspection && (
        <InspectionChecklistModal
          inspection={checklistInspection}
          onClose={() => setChecklistInspection(null)}
          onCreated={() => {
            setChecklistInspection(null)
            // Refresh inspections and checklist mapping so the
            // View checklist button appears immediately
            fetchData()
          }}
        />
      )}

      {viewChecklist && (
        <InspectionChecklistViewModal
          inspection={viewChecklist.inspection}
          checklistId={viewChecklist.checklistId}
          onClose={() => setViewChecklist(null)}
          onDeleted={() => {
            setInspectionChecklists((prev) => {
              const next = { ...prev }
              if (viewChecklist?.inspection?.id) {
                delete next[viewChecklist.inspection.id]
              }
              return next
            })
            setViewChecklist(null)
          }}
        />
      )}
    </div>
  )
}
