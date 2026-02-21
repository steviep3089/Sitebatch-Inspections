import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function InspectionModal({
  inspection,
  onClose,
  onUpdate,
  onOpenChecklist,
  hasChecklist,
  onViewChecklist,
  checklistStatus,
}) {
  const [formData, setFormData] = useState({
    due_date: '',
    completed_date: '',
    date_completed: '',
    status: 'pending',
    hold_reason: '',
    notes: '',
    assigned_to: '',
    certs_received: false,
    certs_na: false,
    certs_link: '',
    waiting_on_certs: false,
    next_inspection_date: '',
    next_inspection_na: false,
    defect_portal_actions: false,
    defect_portal_na: false,
  })
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState(null)
  const [logUsers, setLogUsers] = useState({})
  const [initialData, setInitialData] = useState(null)
  const [showRepeatOptions, setShowRepeatOptions] = useState(false)
  const [repeatPromptShown, setRepeatPromptShown] = useState(false)
  const [nextInspectionFrequency, setNextInspectionFrequency] = useState('')
  const [sendingAlert, setSendingAlert] = useState(false)

  const createRecurringGroupId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return `recurring-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  useEffect(() => {
    if (inspection) {
      const initial = {
        due_date: inspection.due_date || '',
        completed_date: inspection.completed_date || '',
        date_completed: inspection.date_completed || '',
        status: inspection.status || 'pending',
        hold_reason: inspection.hold_reason || '',
        notes: inspection.notes || '',
        assigned_to: inspection.assigned_to || '',
        certs_received: inspection.certs_received || false,
        certs_na: inspection.certs_na || false,
        certs_link: inspection.certs_link || '',
        waiting_on_certs: inspection.waiting_on_certs || false,
        next_inspection_date: inspection.next_inspection_date || '',
        next_inspection_na: inspection.next_inspection_na || false,
        defect_portal_actions: inspection.defect_portal_actions || false,
        defect_portal_na: inspection.defect_portal_na || false,
      }
      setFormData(initial)
      setInitialData(initial)
      setShowRepeatOptions(false)
      setRepeatPromptShown(false)
      setNextInspectionFrequency('')
    }
  }, [inspection])

  const frequencyConfig = {
    monthly: { months: 1, futureCount: 6 },
    quarterly: { months: 3, futureCount: 3 },
    six_monthly: { months: 6, futureCount: 2 },
    yearly: { months: 12, futureCount: 1 },
    two_yearly: { months: 24, futureCount: 1 },
  }

  const addMonths = (date, monthsToAdd) => {
    const next = new Date(date)
    next.setMonth(next.getMonth() + monthsToAdd)
    return next
  }

  const formatDateForDb = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const syncFutureRecurringDueDates = async ({
    recurringGroupId,
    currentSequence,
    completionDate,
    frequencyMonths,
  }) => {
    if (!recurringGroupId || frequencyMonths == null) return

    const { data: futureRows, error: futureRowsError } = await supabase
      .from('inspections')
      .select('id, recurrence_sequence')
      .eq('recurrence_group_id', recurringGroupId)
      .gt('recurrence_sequence', currentSequence)
      .order('recurrence_sequence', { ascending: true })

    if (futureRowsError) throw futureRowsError

    const updates = (futureRows || []).map((row) => {
      const interval = Math.max(1, (row.recurrence_sequence ?? currentSequence + 1) - currentSequence)
      const nextDueDate = addMonths(completionDate, frequencyMonths * interval)

      return supabase
        .from('inspections')
        .update({ due_date: formatDateForDb(nextDueDate) })
        .eq('id', row.id)
    })

    const results = await Promise.all(updates)
    const firstError = results.find((r) => r.error)?.error
    if (firstError) throw firstError
  }

  const maybePromptRepeatInspection = () => {
    if (isCompleted || formData.next_inspection_na || repeatPromptShown) return
    const createRepeat = window.confirm('Would you like to create a repeat inspection?')
    setShowRepeatOptions(createRepeat)
    if (!createRepeat) {
      setNextInspectionFrequency('')
    }
    setRepeatPromptShown(true)
  }

  const sendAdminAlertEmail = async () => {
    if (!inspection?.id) return

    setSendingAlert(true)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables for function invocation')
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/send-inspection-reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ inspection_id: inspection.id, trigger: 'manual_alert' }),
      })

      const responseBody = await response.json().catch(() => ({}))
      if (!response.ok || responseBody?.error) {
        throw new Error(responseBody?.error || 'Failed to send admin alert email')
      }

      logInspectionAction('alert_sent', 'Manual admin reminder email triggered from inspection modal.')
      alert('Admin alert email sent.')
    } catch (error) {
      console.error('Error sending admin alert email:', error)
      alert('Error sending admin alert email: ' + (error.message || 'Unknown error'))
    } finally {
      setSendingAlert(false)
    }
  }

  const certsUrl =
    formData.certs_link ||
    inspection?.certs_link ||
    inspection?.inspection_types?.google_drive_url ||
    null

  const canMarkComplete = () => {
    if (inspection?.status === 'completed') return false

    // Check 1: Date Next Inspection Required - must have date OR N/A checked
    const nextInspectionValid = formData.next_inspection_na || formData.next_inspection_date
    
    // Check 2: Certs Received - must be ticked AND link provided
    const certsValid =
      formData.certs_na || (formData.certs_received && formData.certs_link)
    
    // Check 3: Defect Portal - Actions created OR N/A must be checked
    const defectPortalValid = formData.defect_portal_actions || formData.defect_portal_na
    
    // Check 4: Date Completed must be entered
    const dateCompletedValid = !!formData.date_completed

      // New logic: If waiting_on_certs is checked and certs_na and certs_received are not, allow completion but do not lock certs
      if (formData.waiting_on_certs && !formData.certs_na && !formData.certs_received) {
        return nextInspectionValid && defectPortalValid && dateCompletedValid
      }
    return nextInspectionValid && certsValid && defectPortalValid && dateCompletedValid
  }


  const logInspectionAction = async (action, details) => {
    if (!inspection?.id) return

    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData?.user?.id || null

      const payload = {
        inspection_id: inspection.id,
        action,
        details,
      }

      if (currentUserId) {
        payload.created_by = currentUserId
      }

      const { error } = await supabase
        .from('inspection_logs')
        .insert(payload)

      if (error) {
        console.error('Error logging inspection action:', error)
      }
    } catch (error) {
      console.error('Error logging inspection action:', error)
    }
  }

  useEffect(() => {
    const loadLogs = async () => {
      if (!inspection?.id) return

      setLogsLoading(true)
      setLogsError(null)

      const { data, error } = await supabase
        .from('inspection_logs')
        .select('*')
        .eq('inspection_id', inspection.id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error loading inspection logs:', error)
        setLogsError('Error loading logs')
        setLogs([])
      } else {
        setLogs(data || [])
      }

      setLogsLoading(false)
    }

    loadLogs()
  }, [inspection?.id])

  useEffect(() => {
    const loadLogUsers = async () => {
      const userIds = Array.from(new Set((logs || []).map((l) => l.created_by).filter(Boolean)))
      if (userIds.length === 0) {
        setLogUsers({})
        return
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email')
        .in('id', userIds)

      if (error) {
        console.error('Error loading log users:', error)
        return
      }

      const map = {}
      ;(data || []).forEach((u) => {
        map[u.id] = u.email
      })
      setLogUsers(map)
    }

    loadLogUsers()
  }, [logs])


  const handleMarkComplete = async () => {
    if (!canMarkComplete()) {
      let messages = []
      
      if (!formData.next_inspection_na && !formData.next_inspection_date) {
        messages.push('- Date Next Inspection is required (enter date or mark N/A)')
      }
      
      if (!formData.certs_na && (!formData.certs_received || !formData.certs_link)) {
        if (!formData.certs_received && !formData.certs_na) {
          messages.push('- Certs Received or Certs N/A must be ticked')
        }
        if (formData.certs_received && !formData.certs_link) {
          messages.push('- Google Drive Link for Certs must be provided')
        }
      }
      
      if (!formData.defect_portal_actions && !formData.defect_portal_na) {
        messages.push('- Actions created in Defect Portal OR N/A must be selected')
      }
      
      if (!formData.date_completed) {
        messages.push('- Date Completed must be entered')
      }
      
      alert('Cannot mark as complete. Please complete:\n\n' + messages.join('\n'))
      return
    }

    if (showRepeatOptions && !nextInspectionFrequency) {
      alert('Please select a repeat frequency or choose No when prompted for repeat inspection.')
      return
    }

    setLoading(true)
    try {
      const selectedRepeatConfig = showRepeatOptions
        ? frequencyConfig[nextInspectionFrequency]
        : null

      let recurrenceGroupId = inspection.recurrence_group_id || null
      let recurrenceFrequencyMonths = inspection.recurrence_frequency_months ?? null
      let recurrenceSequence = inspection.recurrence_sequence ?? null

      if (selectedRepeatConfig) {
        if (!recurrenceGroupId) {
          recurrenceGroupId = createRecurringGroupId()
        }
        recurrenceFrequencyMonths = selectedRepeatConfig.months
        if (recurrenceSequence == null) {
          recurrenceSequence = 0
        }
      }

      // Persist all current form values along with the completed status
      const cleanedData = {
        ...formData,
        due_date: formData.due_date || null,
        completed_date: formData.completed_date || null,
        date_completed: formData.date_completed || null,
        next_inspection_date: formData.next_inspection_date || null,
        certs_link: formData.certs_link || null,
        assigned_to: formData.assigned_to || null,
        notes: formData.notes || null,
        status: 'completed',
        recurrence_group_id: recurrenceGroupId,
        recurrence_frequency_months: recurrenceFrequencyMonths,
        recurrence_sequence: recurrenceSequence,
      }

      const { error } = await supabase
        .from('inspections')
        .update(cleanedData)
        .eq('id', inspection.id)

      if (error) throw error

      if (
        showRepeatOptions &&
        nextInspectionFrequency &&
        formData.next_inspection_date &&
        !formData.next_inspection_na
      ) {
        const config = frequencyConfig[nextInspectionFrequency]
        if (config && recurrenceGroupId != null && recurrenceSequence != null) {
          const { data: existingFutureRows, error: existingFutureError } = await supabase
            .from('inspections')
            .select('id')
            .eq('recurrence_group_id', recurrenceGroupId)
            .gt('recurrence_sequence', recurrenceSequence)
            .limit(1)

          if (existingFutureError) throw existingFutureError

          if ((existingFutureRows || []).length === 0) {
          const startDate = new Date(`${formData.next_inspection_date}T00:00:00`)
          const dueDates = [formatDateForDb(startDate)]
          for (let index = 1; index <= config.futureCount; index += 1) {
            const futureDate = addMonths(startDate, config.months * index)
            dueDates.push(formatDateForDb(futureDate))
          }

            const futurePayloads = dueDates.map((dueDate, index) => ({
              asset_id: inspection.asset_id,
              inspection_type_id: inspection.inspection_type_id,
              due_date: dueDate,
              status: 'pending',
              notes: inspection.notes || null,
              assigned_to: inspection.assigned_to || null,
              recurrence_group_id: recurrenceGroupId,
              recurrence_frequency_months: config.months,
              recurrence_sequence: recurrenceSequence + index + 1,
            }))

            const { error: futureError } = await supabase
              .from('inspections')
              .insert(futurePayloads)

            if (futureError) throw futureError

            logInspectionAction(
              'created',
              `Created repeat inspections from modal using ${nextInspectionFrequency.replace('_', ' ')} frequency.`
            )
          }
        }
      }

      if (
        recurrenceGroupId &&
        recurrenceSequence != null &&
        recurrenceFrequencyMonths != null &&
        formData.date_completed
      ) {
        const completionDate = new Date(`${formData.date_completed}T00:00:00`)
        await syncFutureRecurringDueDates({
          recurringGroupId: recurrenceGroupId,
          currentSequence: recurrenceSequence,
          completionDate,
          frequencyMonths: recurrenceFrequencyMonths,
        })
      }

      // Log completion
      logInspectionAction('completed', 'Inspection marked as complete in modal.')

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
      // If for some reason we don't have a baseline, fall back to generic logging
      const baseline = initialData

      if (formData.status === 'on_hold' && !formData.hold_reason?.trim()) {
        alert('On hold comment is required before saving.')
        return
      }

      // Clean up empty date strings - convert to null
      const cleanedData = {
        ...formData,
        due_date: formData.due_date || null,
        completed_date: formData.completed_date || null,
        date_completed: formData.date_completed || null,
        next_inspection_date: formData.next_inspection_date || null,
        certs_link: formData.certs_link || null,
        assigned_to: formData.assigned_to || null,
        hold_reason: formData.status === 'on_hold' ? formData.hold_reason?.trim() || null : null,
        notes: formData.notes || null
      }

      // Work out what actually changed, and build a full snapshot for the log
      const formatValue = (value) => {
        if (value === undefined || value === null || value === '') return 'blank'
        if (typeof value === 'boolean') return value ? 'Yes' : 'No'
        return String(value)
      }

      const fieldMeta = [
        { key: 'status', label: 'Status' },
        { key: 'hold_reason', label: 'On hold reason' },
        { key: 'assigned_to', label: 'Assigned to' },
        { key: 'due_date', label: 'Due date' },
        { key: 'date_completed', label: 'Date completed' },
        { key: 'next_inspection_date', label: 'Next inspection date' },
        { key: 'next_inspection_na', label: 'Next inspection N/A' },
        { key: 'certs_received', label: 'Certs received' },
        { key: 'certs_na', label: 'Certs N/A' },
        { key: 'certs_link', label: 'Certs link' },
        { key: 'defect_portal_actions', label: 'Defect portal actions' },
        { key: 'defect_portal_na', label: 'Defect portal N/A' },
        { key: 'notes', label: 'Notes' },
      ]

      const changedDescriptions = []

      if (baseline) {
        fieldMeta.forEach(({ key, label }) => {
          const before = baseline[key]
          const after = formData[key]
          if (before !== after) {
            changedDescriptions.push(`${label}: ${formatValue(before)} -> ${formatValue(after)}`)
          }
        })
      }

      const { error } = await supabase
        .from('inspections')
        .update(cleanedData)
        .eq('id', inspection.id)

      if (error) throw error

      if (baseline && baseline.status !== formData.status) {
        if (formData.status === 'on_hold') {
          logInspectionAction(
            'on_hold',
            `Inspection placed on hold. Reason: ${formData.hold_reason?.trim() || 'No reason provided.'}`
          )
        } else if (baseline.status === 'on_hold') {
          logInspectionAction('resumed', `Inspection removed from hold. New status: ${formData.status}.`)
        }
      }

      // Log only the fields that actually changed (if any)
      if (baseline && changedDescriptions.length > 0) {
        const details = `Updated fields: ${changedDescriptions.join('; ')}`
        logInspectionAction('updated', details)
      } else {
        // Fallback if we somehow don't have a baseline or no clear changes
        logInspectionAction('updated', 'Inspection details updated in modal.')
      }

      // If the due date was changed, trigger the reminder function
      // immediately for this single inspection. The function itself
      // will decide whether any of the 30/14/7/1 day thresholds are
      // hit today and create/send the appropriate reminders.
      const newDueDateStr = cleanedData.due_date
      if (newDueDateStr) {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

          if (supabaseUrl && supabaseAnonKey) {
            await fetch(`${supabaseUrl}/functions/v1/send-inspection-reminders`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: supabaseAnonKey,
              },
              body: JSON.stringify({ inspection_id: inspection.id }),
            })
          }
        } catch (invokeError) {
          console.error('Error invoking send-inspection-reminders for single inspection:', invokeError)
          // Non-fatal: the inspection update has already succeeded.
        }
      }

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

  const isCompleted = inspection.status === 'completed'
  const isOnHold = formData.status === 'on_hold'

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
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '30px',
          maxWidth: '800px',
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>
              {inspection.inspection_types?.name || 'Inspection Details'}
            </h2>
            {inspection.linked_group_id && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#0f766e',
                  background: '#e6fffb',
                  border: '1px solid #99f6e4',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                Linked inspection
              </span>
            )}
          </div>
          {!isCompleted && (
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  status: prev.status === 'on_hold' ? 'pending' : 'on_hold',
                }))
              }
              style={{
                backgroundColor: '#c62828',
                color: '#fff',
                border: 'none',
                borderRadius: '999px',
                padding: '6px 12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isOnHold ? 'ON HOLD' : 'Put on hold'}
            </button>
          )}
        </div>
        {/* Details section */}
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
            disabled={isCompleted}
          />
        </div>

        <div className="form-group">
          <label htmlFor="due_date">Due Date</label>
          <input
            id="due_date"
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            disabled={isCompleted}
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
            disabled={isCompleted}
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
                disabled={isCompleted}
              />
              N/A
            </label>
          </div>
          {!formData.next_inspection_na && (
            <input
              id="next_inspection_date"
              type="date"
              value={formData.next_inspection_date}
              onFocus={maybePromptRepeatInspection}
              onChange={(e) => setFormData({ ...formData, next_inspection_date: e.target.value })}
              disabled={isCompleted}
            />
          )}
          {showRepeatOptions && !formData.next_inspection_na && (
            <div style={{ marginTop: '10px' }}>
              <label htmlFor="next_inspection_frequency">Repeat Frequency</label>
              <select
                id="next_inspection_frequency"
                value={nextInspectionFrequency}
                onChange={(e) => setNextInspectionFrequency(e.target.value)}
                disabled={isCompleted}
              >
                <option value="">Select frequency</option>
                <option value="monthly">Monthly (next 6)</option>
                <option value="quarterly">Quarterly (next 3)</option>
                <option value="six_monthly">6 Monthly (next 2)</option>
                <option value="yearly">Yearly (next 1)</option>
                <option value="two_yearly">Two Yearly (next 1)</option>
              </select>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '15px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <input
                        type="checkbox"
                        id="waiting_on_certs_checkbox"
                        checked={formData.waiting_on_certs}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            waiting_on_certs: e.target.checked,
                            certs_received: false,
                            certs_na: false,
                          })
                        }
                        disabled={isCompleted}
                      />
                      Waiting on Certs
                    </label>
                  </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                id="certs_received_checkbox"
                checked={formData.certs_received}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    certs_received: e.target.checked,
                    certs_na: e.target.checked ? false : formData.certs_na,
                  })
                }
                disabled={isCompleted}
              />
              <label htmlFor="certs_received_checkbox" style={{ margin: 0, cursor: 'pointer' }}>
                Certs Received *
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                <input
                  type="checkbox"
                  id="certs_na_checkbox"
                  checked={formData.certs_na}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      certs_na: e.target.checked,
                      certs_received: e.target.checked ? false : formData.certs_received,
                      certs_link: e.target.checked ? '' : formData.certs_link,
                    })
                  }
                  disabled={isCompleted}
                />
                Certs N/A *
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

        {formData.certs_received && !formData.certs_na && (
          <div className="form-group">
            <label htmlFor="certs_link">Google Drive Link for Certs *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                id="certs_link"
                type="url"
                value={formData.certs_link}
                onChange={(e) => setFormData({ ...formData, certs_link: e.target.value })}
                placeholder="https://drive.google.com/..."
                required={formData.certs_received && !formData.certs_na}
                style={{ flex: 1 }}
                disabled={isCompleted}
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
              disabled={isCompleted}
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
              disabled={isCompleted}
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
            disabled={isCompleted}
          />
        </div>

        {isOnHold && (
          <div className="form-group">
            <label htmlFor="hold_reason">On hold comment *</label>
            <textarea
              id="hold_reason"
              rows="3"
              value={formData.hold_reason}
              onChange={(e) => setFormData({ ...formData, hold_reason: e.target.value })}
              disabled={isCompleted}
              placeholder="Required reason for putting this inspection on hold"
            />
          </div>
        )}

        <div className="form-group">
          <label>Current Status</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span 
              className={`status-badge ${
                formData.status === 'completed' ? 'status-compliant' : 
                formData.status === 'on_hold' ? 'status-overdue' :
                formData.status === 'overdue' ? 'status-overdue' : 
                'status-due-soon'
              }`}
            >
              {formData.status.toUpperCase()}
            </span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {hasChecklist && onViewChecklist && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onViewChecklist}
                  >
                    View checklist
                  </button>
                )}
                {onOpenChecklist && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onOpenChecklist(inspection)}
                  >
                    Create inspection checklist
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={sendAdminAlertEmail}
                  disabled={sendingAlert}
                >
                  {sendingAlert ? 'Sending alert...' : 'Alert Admin'}
                </button>
              </div>
              {hasChecklist && checklistStatus && (
                <div style={{ fontSize: '0.9rem', color: '#555' }}>
                  Checklist status:{' '}
                  <strong>
                    {checklistStatus === 'completed'
                      ? 'Completed'
                      : checklistStatus.charAt(0).toUpperCase() + checklistStatus.slice(1)}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {!isCompleted && (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          )}
          <button
            className="btn"
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
        </div>

        {/* Mark Complete / Locked indicator at Bottom */}
        <div style={{ marginTop: '20px' }}>
          {isCompleted ? (
            <button
              type="button"
              disabled
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#DAA520', // gold
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'default',
              }}
            >
              🔒 Inspection locked (completed)
            </button>
          ) : (
            <>
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
                    <li>Date Completed</li>
                    <li>Date Next Inspection (enter date or mark N/A)</li>
                    <li>Certs Received (tick and add Google Drive link) or Certs N/A</li>
                    <li>Defect Portal (select "Actions created" or "N/A")</li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Logs section - appears below completion requirements, one line per log */}
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '8px' }}>Inspection Logs</h3>
          <p style={{ marginTop: 0, marginBottom: '12px', fontSize: '0.9rem', color: '#555' }}>
            Recent activity recorded for this inspection.
          </p>

          {logsLoading && <p>Loading logs...</p>}

          {!logsLoading && logsError && (
            <p style={{ color: '#d32f2f' }}>Error loading logs. Please try again.</p>
          )}

          {!logsLoading && !logsError && logs.length === 0 && (
            <p style={{ fontStyle: 'italic' }}>No logs found for this inspection yet.</p>
          )}

          {!logsLoading && !logsError && logs.length > 0 && (
            <ul style={{ paddingLeft: '18px', margin: 0 }}>
              {logs.map((log) => {
                const when = log.created_at
                  ? new Date(log.created_at).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : ''
                const actorEmail = log.created_by ? logUsers[log.created_by] : null
                const baseText = log.details || log.action || ''
                const text = actorEmail ? `${actorEmail}: ${baseText}` : baseText
                return (
                  <li
                    key={log.id}
                    style={{ fontSize: '0.9rem', marginBottom: '4px' }}
                  >
                    {when && (
                      <span style={{ fontWeight: 'bold' }}>{when}</span>
                    )}
                    {when && text ? ' — ' : ''}
                    {text}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
