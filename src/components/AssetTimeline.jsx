import { useMemo, useRef, useEffect, useState } from 'react'

export default function AssetTimeline({ asset, inspections, events = [], onInspectionClick }) {
  const timelineRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(600)
  const [viewWindow, setViewWindow] = useState({ start: null, end: null })

  // Responsive: 4 months = container width
  useEffect(() => {
    if (timelineRef.current) {
      setContainerWidth(timelineRef.current.offsetWidth)
    }
    const handleResize = () => {
      if (timelineRef.current) {
        setContainerWidth(timelineRef.current.offsetWidth)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const timelineData = useMemo(() => {
    if (inspections.length === 0 && events.length === 0) {
      return { startDate: new Date(), endDate: new Date(), inspectionMarkers: [], eventPeriods: [], visibleWidthPx: containerWidth, totalWidthPx: containerWidth }
    }

    // Get all due_dates and completed_dates for range
    const allDueDates = inspections.map(i => new Date(i.due_date))
    const allCompletedDates = inspections.filter(i => i.completed_date).map(i => new Date(i.completed_date))
    const allEventDates = events.flatMap(e => [new Date(e.start_date), new Date(e.end_date)])
    const allDates = [...allDueDates, ...allCompletedDates, ...allEventDates]
    
    const earliestDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date()
    const latestDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date()
    
    // DEBUG: Log all dates and latestDate
    console.log('allDates:', allDates.map(d => d.toISOString()), 'latestDate:', latestDate.toISOString())

    // Window: 1 month before today, 3 months after today
    const today = new Date()
    const visibleStart = new Date(today)
    visibleStart.setMonth(today.getMonth() - 1)
    const visibleEnd = new Date(today)
    visibleEnd.setMonth(today.getMonth() + 3)

    // Timeline range: min(earliestDate, visibleStart) to max(latestDate, visibleEnd)
    const startDate = earliestDate < visibleStart ? earliestDate : visibleStart
    const endDate = latestDate > visibleEnd ? latestDate : visibleEnd
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))

    // Calculate the percent of the total timeline that 4 months represents
    const fourMonthsDays = Math.ceil((visibleEnd - visibleStart) / (1000 * 60 * 60 * 24))
    const visiblePercent = (fourMonthsDays / totalDays)
    const visibleWidthPx = containerWidth
    const totalWidthPx = visibleWidthPx / visiblePercent

    // Visible window in percent
    const visibleStartDays = Math.ceil((visibleStart - startDate) / (1000 * 60 * 60 * 24))
    const visibleEndDays = Math.ceil((visibleEnd - startDate) / (1000 * 60 * 60 * 24))
    const visibleStartPercent = (visibleStartDays / totalDays) * 100
    const visibleEndPercent = (visibleEndDays / totalDays) * 100

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
      todayPosition: Math.max(0, Math.min(100, todayPosition)),
      visibleStartPercent,
      visibleEndPercent,
      visibleStart,
      visibleEnd,
      visibleWidthPx,
      totalWidthPx,
      totalDays
    }
  }, [asset, inspections, events, containerWidth])

  // Auto-scroll to 4‑month window on mount and keep header dates aligned with visible section
  useEffect(() => {
    const container = timelineRef.current
    if (!container) return

    const dayMs = 1000 * 60 * 60 * 24

    const updateViewWindow = () => {
      const pxPerDay = timelineData.totalWidthPx / timelineData.totalDays
      const scrollLeft = container.scrollLeft
      const visibleWidth = container.clientWidth

      const leftDays = scrollLeft / pxPerDay
      const rightDays = (scrollLeft + visibleWidth) / pxPerDay

      const start = new Date(timelineData.startDate.getTime() + leftDays * dayMs)
      const end = new Date(timelineData.startDate.getTime() + rightDays * dayMs)
      setViewWindow({ start, end })
    }

    // Initial scroll so that 1 month before today is at left of view
    const pxPerDay = timelineData.totalWidthPx / timelineData.totalDays
    const offsetDays = Math.max(0, Math.floor((timelineData.visibleStart - timelineData.startDate) / dayMs))
    container.scrollLeft = offsetDays * pxPerDay
    updateViewWindow()

    container.addEventListener('scroll', updateViewWindow)
    return () => container.removeEventListener('scroll', updateViewWindow)
  }, [timelineData.startDate, timelineData.visibleStart, timelineData.totalWidthPx, timelineData.totalDays])

  return (
    <div style={{ marginTop: '15px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: '8px',
        fontSize: '0.85rem',
        color: '#666'
      }}>
        <span>{(viewWindow.start || timelineData.visibleStart).toLocaleDateString()}</span>
        <span>Timeline</span>
        <span>{(viewWindow.end || timelineData.visibleEnd).toLocaleDateString()}</span>
      </div>

      {/* Intermediate markers across current visible window */}
      {(() => {
        const start = viewWindow.start || timelineData.visibleStart
        const end = viewWindow.end || timelineData.visibleEnd
        const diffMs = end - start
        if (diffMs <= 0) return null

        const markers = []
        for (let i = 1; i <= 4; i++) {
          const ratio = i / 5 // 4 markers between start and end
          const d = new Date(start.getTime() + diffMs * ratio)
          markers.push(
            <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', color: '#999' }}>
              {d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
            </span>
          )
        }

        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', marginTop: '-4px' }}>
            <span style={{ width: '60px' }} />
            {markers}
            <span style={{ width: '60px' }} />
          </div>
        )
      })()}

      {/* Scrollable Timeline bar */}
      <div
        ref={timelineRef}
        style={{
          position: 'relative',
          height: '80px',
          overflowX: 'scroll',
          overflowY: 'visible',
          // Neutral base; event periods show status colouring
          background: 'linear-gradient(to right, #f5f5f5 0%, #f5f5f5 100%)',
          borderRadius: '8px',
          border: '2px solid #ddd',
          whiteSpace: 'nowrap',
          width: '100%',
          minWidth: '300px',
          scrollbarWidth: 'auto',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: '100%',
            width: timelineData.totalWidthPx + 'px',
          }}
        >
          {/* Visible window highlight */}
          <div
            style={{
              position: 'absolute',
              left: `${timelineData.visibleStartPercent}%`,
              width: `${timelineData.visibleEndPercent - timelineData.visibleStartPercent}%`,
              top: 0,
              bottom: 0,
              background: 'rgba(33,150,243,0.08)',
              zIndex: 0,
              pointerEvents: 'none',
              borderLeft: '2px dashed #2196F3',
              borderRight: '2px dashed #2196F3',
            }}
          />
          {/* Event periods (horizontal bars) */}
          {timelineData.eventPeriods.map((eventPeriod, index) => (
            <div
              key={`event-${index}`}
              style={{
                position: 'absolute',
                left: `${eventPeriod.startPosition}%`,
                width: `${eventPeriod.width}%`,
                top: 0,
                bottom: 0,
                background: eventPeriod.event.end_status === 'active' 
                  ? 'rgba(76, 175, 80, 0.4)' 
                  : 'rgba(226, 227, 229, 0.6)',
                border: eventPeriod.event.end_status === 'active'
                  ? '2px solid #4CAF50'
                  : '2px solid #999',
                borderRadius: '8px',
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
            top: 14,
            bottom: 6,
            width: '2px',
            background: '#333',
            zIndex: 2
          }}>
            <div style={{
              position: 'absolute',
              top: '-16px',
              left: '-18px',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              color: '#333',
              background: 'white',
              padding: '0 2px',
              borderRadius: '3px'
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
                onClick={() => {
                  if (onInspectionClick) {
                    onInspectionClick(marker.inspection)
                  }
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

          {/* (Month markers and extra window labels removed for cleaner layout; header shows 4-month range) */}
        </div>
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
