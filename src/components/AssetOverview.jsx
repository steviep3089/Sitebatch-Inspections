import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import AssetTimeline from './AssetTimeline'
import InspectionModal from './InspectionModal'
import InspectionChecklistModal from './InspectionChecklistModal'
import InspectionChecklistViewModal from './InspectionChecklistViewModal'

export default function AssetOverview() {
  const [assets, setAssets] = useState([])
  const [expandedAsset, setExpandedAsset] = useState(null)
  const [showEventForm, setShowEventForm] = useState(null) // Track which asset's event form is open
  const [selectedInspection, setSelectedInspection] = useState(null)
  const [filterMode, setFilterMode] = useState('full') // full, due, complete
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState(null)
  const [checklistInspection, setChecklistInspection] = useState(null)
  const [inspectionChecklists, setInspectionChecklists] = useState({})
  const [viewChecklist, setViewChecklist] = useState(null) // { inspection, checklistId }
  const [eventFormData, setEventFormData] = useState({
    start_date: '',
    end_date: '',
    description: '',
    end_status: 'active',
    location: '',
  })

  useEffect(() => {
    fetchAssetsWithInspections()
  }, [])

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single()

          setUserRole(data?.role || null)
        }
      } catch (error) {
        console.error('Error fetching user role in AssetOverview:', error)
      }
    }

    fetchRole()
  }, [])

  const fetchAssetsWithInspections = async () => {
    try {
      // Fetch all assets
      const { data: assetData, error: assetError } = await supabase
        .from('asset_items')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: true })
        .order('asset_id', { ascending: true })

      if (assetError) throw assetError

      // Fetch all inspections and events for each asset
      const assetsWithInspections = await Promise.all(
        (assetData || []).map(async (asset) => {
          const { data: inspections } = await supabase
            .from('inspections')
            .select(`
              id,
              due_date,
              completed_date,
              date_completed,
              status,
              notes,
              assigned_to,
              certs_received,
              certs_link,
              certs_na,
              next_inspection_date,
              next_inspection_na,
              defect_portal_actions,
              defect_portal_na,
              linked_group_id,
              inspection_types (name, frequency, google_drive_url)
            `)
            .eq('asset_id', asset.id)
            .order('due_date', { ascending: true })

          const { data: events } = await supabase
            .from('asset_events')
            .select('*')
            .eq('asset_id', asset.id)
            .order('start_date', { ascending: true })

          return {
            ...asset,
            inspections: inspections || [],
            events: events || []
          }
        })
      )

      setAssets(assetsWithInspections)

      // Build a map of the latest checklist per inspection across all assets
      const allInspections = assetsWithInspections.flatMap((asset) => asset.inspections || [])
      const inspectionIds = allInspections.map((insp) => insp.id)
      const linkedGroupIds = Array.from(
        new Set(allInspections.map((insp) => insp.linked_group_id).filter(Boolean))
      )
      const checklistMap = {}

      if (inspectionIds.length > 0 || linkedGroupIds.length > 0) {
        const checklistRows = []

        if (inspectionIds.length > 0) {
          const { data: checklistData, error: checklistError } = await supabase
            .from('inspection_checklists')
            .select('id, inspection_id, linked_group_id, status, created_at')
            .in('inspection_id', inspectionIds)
            .order('created_at', { ascending: false })

          if (checklistError) throw checklistError
          checklistRows.push(...(checklistData || []))
        }

        if (linkedGroupIds.length > 0) {
          const { data: linkedChecklistData, error: linkedChecklistError } = await supabase
            .from('inspection_checklists')
            .select('id, inspection_id, linked_group_id, status, created_at')
            .in('linked_group_id', linkedGroupIds)
            .order('created_at', { ascending: false })

          if (linkedChecklistError) throw linkedChecklistError
          checklistRows.push(...(linkedChecklistData || []))
        }

        const uniqueRows = Array.from(
          new Map(checklistRows.map((row) => [row.id, row])).values()
        )

        const byInspection = {}
        const byLinkedGroup = {}

        uniqueRows.forEach((row) => {
          if (row.inspection_id && !byInspection[row.inspection_id]) {
            byInspection[row.inspection_id] = { id: row.id, status: row.status }
          }
          if (row.linked_group_id && !byLinkedGroup[row.linked_group_id]) {
            byLinkedGroup[row.linked_group_id] = { id: row.id, status: row.status }
          }
        })

        allInspections.forEach((insp) => {
          const linkedChecklist = insp.linked_group_id
            ? byLinkedGroup[insp.linked_group_id]
            : null
          const directChecklist = byInspection[insp.id]
          const chosen = linkedChecklist || directChecklist
          if (chosen) {
            checklistMap[insp.id] = chosen
          }
        })
      }

      setInspectionChecklists(checklistMap)
    } catch (error) {
      console.error('Error fetching assets:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleAsset = (assetId) => {
    setExpandedAsset(expandedAsset === assetId ? null : assetId)
  }

  const handleEventSubmit = async (e, assetId) => {
    e.preventDefault()
    try {
      // Basic validation to avoid DB constraint errors
      if (eventFormData.start_date && eventFormData.end_date) {
        const start = new Date(eventFormData.start_date)
        const end = new Date(eventFormData.end_date)
        if (end < start) {
          alert('End Date must be on or after Start Date.')
          return
        }
      }

      const { data: { user } } = await supabase.auth.getUser()
      
      // Insert the event
      const { error: eventError } = await supabase.from('asset_events').insert([{
        asset_id: assetId,
        start_date: eventFormData.start_date,
        end_date: eventFormData.end_date,
        description: eventFormData.description,
        end_status: eventFormData.end_status,
        created_by: user?.id
      }])

      if (eventError) throw eventError

      // Update the asset status (and location if provided) to reflect the event outcome
      const updateFields = {
        status: eventFormData.end_status,
      }

      if (eventFormData.location) {
        updateFields.location = eventFormData.location
      }

      const { error: updateError } = await supabase
        .from('asset_items')
        .update(updateFields)
        .eq('id', assetId)

      if (updateError) throw updateError

      setShowEventForm(null)
      setEventFormData({
        start_date: '',
        end_date: '',
        description: '',
        end_status: 'active',
        location: '',
      })
      // Refresh data
      fetchAssetsWithInspections()
    } catch (error) {
      console.error('Error adding event:', error, error?.message, error?.details)
      alert('Error adding event. Please check the console for details.')
    }
  }

  const getFilteredInspections = (inspections) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    switch (filterMode) {
      case 'due':
        return inspections.filter(i => 
          i.status === 'pending' && new Date(i.due_date) >= today
        )
      case 'complete':
        return inspections.filter(i => i.status === 'completed')
      case 'full':
      default:
        return inspections
    }
  }

  const getInspectionStatusClass = (inspection) => {
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
    return <div>Loading asset overview...</div>
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ marginBottom: '15px' }}>Asset Overview</h2>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            className={`btn ${filterMode === 'full' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterMode('full')}
          >
            Full
          </button>
          <button 
            className={`btn ${filterMode === 'due' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterMode('due')}
          >
            Due
          </button>
          <button 
            className={`btn ${filterMode === 'complete' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterMode('complete')}
          >
            Complete
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <p>No assets found. Create assets to get started.</p>
      ) : (
        assets.map((asset) => {
          const filteredInspections = getFilteredInspections(asset.inspections)
          const isExpanded = expandedAsset === asset.id

          return (
            <div key={asset.id} className="card" style={{ marginBottom: '15px' }}>
              {/* Asset Header */}
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  padding: '10px 0'
                }}
                onClick={() => toggleAsset(asset.id)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0 }}>
                      {asset.asset_id}
                    </h3>
                    <span className={`status-badge ${asset.status === 'active' ? 'status-compliant' : 'status-decommissioned'}`}>
                      {asset.status.toUpperCase()}
                    </span>
                    <span style={{ color: '#666', fontSize: '0.9rem' }}>
                      {filteredInspections.length} inspection{filteredInspections.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p style={{ margin: '5px 0', color: '#666', fontSize: '0.9rem' }}>
                    {asset.location || 'No location specified'}
                  </p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {userRole === 'admin' && (
                    <button 
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowEventForm(showEventForm === asset.id ? null : asset.id)
                      }}
                    >
                      {showEventForm === asset.id ? 'Cancel' : 'Add Event'}
                    </button>
                  )}

                  <button 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      fontSize: '1.5rem', 
                      cursor: 'pointer',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.3s'
                    }}
                  >
                    ▼
                  </button>
                </div>
              </div>

              {/* Event Form */}
              {userRole === 'admin' && showEventForm === asset.id && (
                <div style={{ marginTop: '15px', marginBottom: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <h4 style={{ marginBottom: '10px' }}>Add Event</h4>
                  <form onSubmit={(e) => handleEventSubmit(e, asset.id)}>
                    <div className="form-group">
                      <label htmlFor={`start_date_${asset.id}`}>Start Date *</label>
                      <input
                        id={`start_date_${asset.id}`}
                        type="date"
                        value={eventFormData.start_date}
                        onChange={(e) => setEventFormData({ ...eventFormData, start_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`end_date_${asset.id}`}>End Date *</label>
                      <input
                        id={`end_date_${asset.id}`}
                        type="date"
                        value={eventFormData.end_date}
                        onChange={(e) => setEventFormData({ ...eventFormData, end_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`description_${asset.id}`}>Description of Action Taken *</label>
                      <textarea
                        id={`description_${asset.id}`}
                        rows="3"
                        value={eventFormData.description}
                        onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                        placeholder="Describe the event or action taken..."
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`end_status_${asset.id}`}>Status After Event *</label>
                      <select
                        id={`end_status_${asset.id}`}
                        value={eventFormData.end_status}
                        onChange={(e) => setEventFormData({ ...eventFormData, end_status: e.target.value })}
                      >
                        <option value="active">Active</option>
                        <option value="decommissioned">Decommissioned</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor={`location_${asset.id}`}>New Location (Optional)</label>
                      <input
                        id={`location_${asset.id}`}
                        type="text"
                        value={eventFormData.location}
                        onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                        placeholder="Enter new location if asset was relocated..."
                      />
                    </div>
                    <button type="submit" className="btn btn-primary">
                      Save Event
                    </button>
                  </form>
                </div>
              )}

              {/* Timeline */}
              <AssetTimeline 
                asset={asset} 
                inspections={asset.inspections}
                events={asset.events}
                onInspectionClick={setSelectedInspection}
              />

              {/* Expanded Inspections List */}
              {isExpanded && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #ddd' }}>
                  <h4 style={{ marginBottom: '15px' }}>Inspections</h4>
                  
                  {filteredInspections.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>
                      No inspections match the current filter.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {filteredInspections.map((inspection) => (
                        <div 
                          key={inspection.id}
                          style={{
                            padding: '15px',
                            background: '#f9f9f9',
                            borderRadius: '8px',
                            borderLeft: '4px solid',
                            borderLeftColor: getInspectionStatusClass(inspection).includes('overdue') ? '#f44336' :
                                             getInspectionStatusClass(inspection).includes('due-soon') ? '#ff9800' : '#4CAF50',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          onClick={() => setSelectedInspection(inspection)}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#f9f9f9'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontSize: '1.1rem' }}>
                                {inspection.inspection_types?.name}
                              </strong>
                              {inspection.linked_group_id && (
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
                                  Linked
                                </span>
                              )}
                              <div style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
                                <div>Due: {new Date(inspection.due_date).toLocaleDateString()}</div>
                                {inspection.completed_date && (
                                  <div>Completed: {new Date(inspection.completed_date).toLocaleDateString()}</div>
                                )}
                                {inspection.inspection_types?.frequency && (
                                  <div>Frequency: {inspection.inspection_types.frequency}</div>
                                )}
                              </div>
                              {inspection.notes && (
                                <p style={{ marginTop: '8px', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                  {inspection.notes}
                                </p>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <span className={`status-badge ${getInspectionStatusClass(inspection)}`}>
                                {inspection.status.toUpperCase()}
                              </span>
                              {getDueLabel(inspection) && (
                                <span style={{ fontSize: '0.8rem', color: '#555' }}>
                                  {getDueLabel(inspection)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Inspection Modal */}
      {selectedInspection && (
        <InspectionModal
          inspection={selectedInspection}
          onClose={() => setSelectedInspection(null)}
          onUpdate={fetchAssetsWithInspections}
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
            fetchAssetsWithInspections()
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
