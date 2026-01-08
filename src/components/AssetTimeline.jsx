import { useMemo } from 'react'

export default function AssetTimeline({ asset, inspections, events = [] }) {
  const timelineData = useMemo(() => {
    if (inspections.length === 0 && events.length === 0) {
      return { startDate: new Date(), endDate: new Date(), inspectionMarkers: [], eventPeriods: [] }
    }

    // Get all dates to determine range
    const allDates = [
      ...inspections.map(i => new Date(i.completed_date || i.due_date)),
      ...events.flatMap(e => [new Date(e.start_date), new Date(e.end_date)])
    ]
    
    const earliestDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date()
    
    // End date is 12 months from today
    const today = new Date()
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 12)
    
    // Use earlier of earliest date or today
    const startDate = earliestDate < today ? earliestDate : today

    // Calculate total range in days
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))

    // Create inspection markers
    const inspectionMarkers = inspections.map(inspection => {
      const eventDate = new Date(inspection.completed_date || inspection.due_date)
      const daysFromStart = Math.ceil((eventDate - startDate) / (1000 * 60 * 60 * 24))
      const position = (daysFromStart / totalDays) * 100

      const isCompleted = inspection.status === 'completed'
      const isOverdue = !isCompleted && new Date(inspection.due_date) < today
      const isDueSoon = !isCompleted && !isOverdue && 
        new Date(inspection.due_date) <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

      return {
        position: Math.max(0, Math.min(100, position)),
        inspection,
        isCompleted,
        isOverdue,
        isDueSoon,
        date: eventDate
      }
    })

    // Create event periods (horizontal bars)
    const eventPeriods = events.map(event => {
      const startEventDate = new Date(event.start_date)
      const endEventDate = new Date(event.end_date)
      
      const startDays = Math.ceil((startEventDate - startDate) / (1000 * 60 * 60 * 24))
      const endDays = Math.ceil((endEventDate - startDate) / (1000 * 60 * 60 * 24))
      
      const startPosition = Math.max(0, (startDays / totalDays) * 100)
      const endPosition = Math.min(100, (endDays / totalDays) * 100)
      const width = endPosition - startPosition

      return {
        startPosition,
        width,
        event,
        startDate: startEventDate,
        endDate: endEventDate
      }
    })

    // Add commission marker if install date exists
    const commissionMarker = asset.install_date ? (() => {
      const installDate = new Date(asset.install_date)
      if (installDate >= startDate && installDate <= endDate) {
        const daysFromStart = Math.ceil((installDate - startDate) / (1000 * 60 * 60 * 24))
        const position = (daysFromStart / totalDays) * 100
        return {
          position: Math.max(0, Math.min(100, position)),
          type: 'commissioned',
          date: installDate
        }
      }
      return null
    })() : null

    // Today marker
    const todayDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24))
    const todayPosition = (todayDays / totalDays) * 100

    return { 
      startDate, 
      endDate, 
      inspectionMarkers, 
      eventPeriods,
      commissionMarker,
      todayPosition: Math.max(0, Math.min(100, todayPosition)) 
    }
  }, [asset, inspections, events])

  return (
    <div style={{ marginTop: '15px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: '8px',
        fontSize: '0.85rem',
        color: '#666'
      }}>
        <span>{timelineData.startDate.toLocaleDateString()}</span>
        <span>Timeline</span>
        <span>{timelineData.endDate.toLocaleDateString()}</span>
      </div>

      {/* Timeline bar */}
      <div style={{ 
        position: 'relative',
        height: '40px',
        background: asset.status === 'active' 
          ? 'linear-gradient(to right, #d4edda 0%, #d4edda 100%)'
          : 'linear-gradient(to right, #e2e3e5 0%, #e2e3e5 100%)',
        borderRadius: '8px',
        border: '2px solid #ddd'
      }}>
        {/* Event periods (horizontal bars) */}
        {timelineData.eventPeriods.map((eventPeriod, index) => (
          <div
            key={`event-${index}`}
            style={{
              position: 'absolute',
              left: `${eventPeriod.startPosition}%`,
              width: `${eventPeriod.width}%`,
              top: '5px',
              bottom: '5px',
              background: eventPeriod.event.end_status === 'active' 
                ? 'rgba(76, 175, 80, 0.4)' 
                : 'rgba(226, 227, 229, 0.6)',
              border: eventPeriod.event.end_status === 'active'
                ? '2px solid #4CAF50'
                : '2px solid #999',
              borderRadius: '4px',
              zIndex: 1,
              cursor: 'pointer'
            }}
            title={`${eventPeriod.event.description}\n${eventPeriod.startDate.toLocaleDateString()} - ${eventPeriod.endDate.toLocaleDateString()}\nStatus: ${eventPeriod.event.end_status.toUpperCase()}`}
          >
            <div style={{
              fontSize: '0.7rem',
              padding: '2px 4px',
              color: eventPeriod.event.end_status === 'active' ? '#2e7d32' : '#666',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {eventPeriod.event.description.substring(0, 20)}{eventPeriod.event.description.length > 20 ? '...' : ''}
            </div>
          </div>
        ))}

        {/* Today marker */}
        <div style={{
          position: 'absolute',
          left: `${timelineData.todayPosition}%`,
          top: 0,
          bottom: 0,
          width: '2px',
          background: '#333',
          zIndex: 2
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            left: '-15px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            color: '#333'
          }}>
            Today
          </div>
        </div>

        {/* Commission marker */}
        {timelineData.commissionMarker && (
          <div
            style={{
              position: 'absolute',
              left: `${timelineData.commissionMarker.position}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '3px',
              height: '100%',
              background: '#4CAF50',
              zIndex: 1
            }}
            title={`Commissioned: ${timelineData.commissionMarker.date.toLocaleDateString()}`}
          />
        )}

        {/* Inspection markers */}
        {timelineData.inspectionMarkers.map((marker, index) => {
          const color = marker.isCompleted ? '#4CAF50' : 
                       marker.isOverdue ? '#f44336' : 
                       marker.isDueSoon ? '#ff9800' : '#2196F3'

          return (
            <div
              key={`inspection-${index}`}
              style={{
                position: 'absolute',
                left: `${marker.position}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: color,
                border: '2px solid white',
                cursor: 'pointer',
                zIndex: 3,
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
              title={`${marker.inspection.inspection_types?.name}\n${marker.date.toLocaleDateString()}\nStatus: ${marker.inspection.status}`}
            />
          )
        })}

        {/* Decommissioned overlay */}
        {asset.status === 'decommissioned' && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: '0',
            background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px)',
            borderRadius: '8px',
            pointerEvents: 'none'
          }} />
        )}
      </div>

      {/* Legend */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginTop: '10px',
        fontSize: '0.8rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4CAF50' }} />
          <span>Completed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff9800' }} />
          <span>Due Soon</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f44336' }} />
          <span>Overdue</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2196F3' }} />
          <span>Upcoming</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '20px', height: '10px', background: 'rgba(76, 175, 80, 0.4)', border: '1px solid #4CAF50' }} />
          <span>Event (Active)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '20px', height: '10px', background: 'rgba(226, 227, 229, 0.6)', border: '1px solid #999' }} />
          <span>Event (Decommissioned)</span>
        </div>
      </div>
    </div>
  )
}
