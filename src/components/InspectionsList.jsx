import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import InspectionModal from './InspectionModal'

export default function InspectionsList() {
  const [inspections, setInspections] = useState([])
  const [plantItems, setPlantItems] = useState([])
  const [inspectionTypes, setInspectionTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showOtherType, setShowOtherType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [selectedInspection, setSelectedInspection] = useState(null)
  const [formData, setFormData] = useState({
    asset_id: '',
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
          due_date,
          completed_date,
          status,
          notes,
          asset_items (asset_id, name),
          inspection_types (name, google_drive_url)
        `)
        .order('due_date', { ascending: true })

      if (inspectionsError) throw inspectionsError

      // Fetch assets for dropdown
      const { data: assetData, error: assetError } = await supabase
        .from('asset_items')
        .select('id, asset_id, name, status')
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
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
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

      const { error } = await supabase.from('inspections').insert([{
        asset_id: formData.asset_id,
        inspection_type_id: inspectionTypeId,
        due_date: formData.due_date || null,
        status: formData.status,
        notes: formData.notes || null,
        assigned_to: formData.assigned_to || null,
      }])

      if (error) throw error

      setShowForm(false)
      setShowOtherType(false)
      setNewTypeName('')
      setFormData({
        asset_id: '',
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
              <select
                id="asset_id"
                value={formData.asset_id}
                onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}
                required
              >
                <option value="">Select an asset</option>
                {plantItems.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.asset_id} - {asset.name}
                  </option>
                ))}
              </select>
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
                    {inspection.status === 'pending' && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '5px 10px', fontSize: '0.85rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCompleteInspection(inspection.id)
                        }}
                      >
                        Mark Complete
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
        />
      )}
    </div>
  )
}
