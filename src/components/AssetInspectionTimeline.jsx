import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import AssetTimeline from './AssetTimeline'

export default function AssetInspectionTimeline({ assetId }) {
  const [inspections, setInspections] = useState([])
  const [events, setEvents] = useState([])
  const [asset, setAsset] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (assetId) {
      fetchData()
    }
  }, [assetId])

  const fetchData = async () => {
    if (!assetId) return
    
    try {
      // Fetch asset details
      const { data: assetData, error: assetError } = await supabase
        .from('asset_items')
        .select('*')
        .eq('id', assetId)
        .single()

      if (assetError) throw assetError
      setAsset(assetData)

      // Fetch inspections
      const { data: inspData, error: inspError } = await supabase
        .from('inspections')
        .select(`
          id,
          due_date,
          completed_date,
          status,
          notes,
          inspection_types (name, frequency)
        `)
        .eq('asset_id', assetId)
        .order('due_date', { ascending: false })

      if (inspError) throw inspError
      setInspections(inspData || [])

      // Fetch events
      const { data: eventsData, error: eventsError } = await supabase
        .from('asset_events')
        .select('*')
        .eq('asset_id', assetId)
        .order('start_date', { ascending: false })

      if (eventsError) throw eventsError
      setEvents(eventsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getInspectionClass = (inspection) => {
    if (inspection.status === 'completed') return 'compliant'
    
    const today = new Date()
    const dueDate = new Date(inspection.due_date)
    
    if (dueDate < today) return 'overdue'
    
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    if (dueDate <= thirtyDaysFromNow) return 'due-soon'
    
    return 'compliant'
  }

  if (loading) {
    return <div style={{ marginTop: '15px' }}>Loading inspections...</div>
  }

  if (!asset) {
    return <div style={{ marginTop: '15px' }}>Asset not found.</div>
  }

  return (
    <div className="plant-timeline" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #ddd' }}>
      <h4 style={{ marginBottom: '15px' }}>Inspection & Event Timeline</h4>
      
      {/* Visual Timeline */}
      {(inspections.length > 0 || events.length > 0) && (
        <AssetTimeline asset={asset} inspections={inspections} events={events} />
      )}

      {/* Events List */}
      {events.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h5 style={{ marginBottom: '10px' }}>Events</h5>
          {events.map((event) => (
            <div key={event.id} className="timeline-item" style={{ 
              backgroundColor: event.end_status === 'active' ? '#e8f5e9' : '#f5f5f5',
              borderLeft: `4px solid ${event.end_status === 'active' ? '#4CAF50' : '#999'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <strong>{event.description}</strong>
                <span className={`status-badge status-${event.end_status === 'active' ? 'compliant' : 'decommissioned'}`}>
                  {event.end_status.toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: '0.9rem' }}>
                {new Date(event.start_date).toLocaleDateString()} - {new Date(event.end_date).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Inspections List */}
      {inspections.length === 0 && events.length === 0 ? (
        <p>No inspections or events for this asset.</p>
      ) : inspections.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h5 style={{ marginBottom: '10px' }}>Inspections</h5>
          {inspections.map((inspection) => {
            const itemClass = getInspectionClass(inspection)
            return (
              <div key={inspection.id} className={`timeline-item ${itemClass}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <strong>{inspection.inspection_types?.name}</strong>
                  <span className={`status-badge status-${itemClass}`}>
                    {inspection.status.toUpperCase()}
                  </span>
                </div>
                <p style={{ fontSize: '0.9rem', marginBottom: '5px' }}>
                  Due: {new Date(inspection.due_date).toLocaleDateString()}
                  {inspection.completed_date && (
                    <span> | Completed: {new Date(inspection.completed_date).toLocaleDateString()}</span>
                  )}
                </p>
                {inspection.inspection_types?.frequency && (
                  <p style={{ fontSize: '0.85rem', color: '#666' }}>
                    Frequency: {inspection.inspection_types.frequency}
                  </p>
                )}
                {inspection.notes && (
                  <p style={{ fontSize: '0.85rem', marginTop: '5px', fontStyle: 'italic' }}>
                    {inspection.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
