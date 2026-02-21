import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ReportsAdmin() {
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recipients, setRecipients] = useState([])
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  const loadData = async () => {
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      setRole(null)
      setRecipients([])
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role || null
    setRole(userRole)

    if (userRole === 'admin') {
      const { data: rows, error } = await supabase
        .from('report_recipients')
        .select('id, email, is_active, created_at')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error loading report recipients:', error)
      }
      setRecipients(rows || [])
    } else {
      setRecipients([])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const addRecipient = async (e) => {
    e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail) return

    setSaving(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData?.user?.id || null

      const payload = {
        email: cleanEmail,
        is_active: true,
      }

      if (currentUserId) {
        payload.created_by = currentUserId
      }

      const { error } = await supabase
        .from('report_recipients')
        .insert(payload)

      if (error) throw error

      setEmail('')
      await loadData()
    } catch (error) {
      console.error('Error adding report recipient:', error)
      alert('Error adding report recipient: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleRecipient = async (recipient) => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('report_recipients')
        .update({ is_active: !recipient.is_active })
        .eq('id', recipient.id)

      if (error) throw error

      await loadData()
    } catch (error) {
      console.error('Error updating report recipient:', error)
      alert('Error updating report recipient: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteRecipient = async (id) => {
    const confirmed = window.confirm('Remove this recipient from weekly reports?')
    if (!confirmed) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('report_recipients')
        .delete()
        .eq('id', id)

      if (error) throw error

      await loadData()
    } catch (error) {
      console.error('Error deleting report recipient:', error)
      alert('Error deleting report recipient: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const sendNow = async () => {
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-weekly-inspection-report', {
        body: { trigger: 'manual' },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const recipientsText = Array.isArray(data?.recipients) && data.recipients.length > 0
        ? `\nSent to: ${data.recipients.join(', ')}`
        : ''

      alert(`Weekly report sent.${recipientsText}`)
    } catch (error) {
      console.error('Error sending weekly report:', error)
      alert('Error sending weekly report: ' + (error.message || 'Unknown error'))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div>Loading reports settings...</div>
  }

  if (role !== 'admin') {
    return (
      <div>
        <h2 style={{ marginBottom: '10px' }}>Reports</h2>
        <p style={{ color: '#555' }}>You do not have admin access to reports.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Reports</h2>
      <p style={{ marginBottom: '15px', color: '#555' }}>
        Weekly report recipients for inspections due in 14 days, on hold inspections, and waiting certs.
      </p>

      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '12px' }}>Recipients</h3>
        <form onSubmit={addRecipient} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            required
            disabled={saving}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" type="submit" disabled={saving}>
            Add
          </button>
        </form>

        {recipients.length === 0 ? (
          <p style={{ color: '#555' }}>No report recipients configured yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Active</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((recipient) => (
                <tr key={recipient.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{recipient.email}</td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="checkbox"
                      checked={recipient.is_active}
                      onChange={() => toggleRecipient(recipient)}
                      disabled={saving}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button className="btn" type="button" onClick={() => deleteRecipient(recipient.id)} disabled={saving}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '10px' }}>Run report now</h3>
        <p style={{ marginBottom: '12px', color: '#555' }}>
          Sends the weekly report immediately to all active recipients.
        </p>
        <button className="btn btn-secondary" onClick={sendNow} disabled={sending || saving || recipients.filter((r) => r.is_active).length === 0}>
          {sending ? 'Sending...' : 'Send Weekly Report Now'}
        </button>
      </div>
    </div>
  )
}
