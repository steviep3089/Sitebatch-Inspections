import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function RequestItem() {
  const [admins, setAdmins] = useState([])
  const [selectedAdminId, setSelectedAdminId] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, email, role')
          .eq('role', 'admin')
          .order('email')

        if (error) throw error
        setAdmins(data || [])
      } catch (error) {
        console.error('Error loading admins for request form:', error)
        setMessage('Error loading admins. Please try again later.')
      } finally {
        setLoading(false)
      }
    }

    loadAdmins()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')

    if (!selectedAdminId || !description.trim()) {
      setMessage('Please select an admin and enter a description.')
      return
    }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setMessage('You must be logged in to submit a request.')
        return
      }

      const { data, error } = await supabase
        .from('user_requests')
        .insert([
          {
            requester_id: user.id,
            admin_id: selectedAdminId,
            description: description.trim(),
          },
        ])
        .select()
        .single()

      if (error) throw error

      try {
        await supabase.functions.invoke('send-request-email', {
          body: { request_id: data.id },
        })
      } catch (fnError) {
        console.error('Error invoking send-request-email function:', fnError)
      }

      setMessage('Request submitted successfully.')
      setDescription('')
      setSelectedAdminId('')

      // Let the header know that a new pending request exists so
      // the bell count can refresh without requiring a full reload.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('user-requests-updated'))
      }
    } catch (error) {
      console.error('Error submitting request:', error)
      setMessage('Error submitting request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div>Loading request form...</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: '15px' }}>Request Item</h2>
      <p style={{ marginBottom: '20px', color: '#555' }}>
        Use this form if you do not have admin rights and need a new item added or a change made.
      </p>

      <form onSubmit={handleSubmit} style={{ maxWidth: '500px' }}>
        <div className="form-group">
          <label htmlFor="admin">Select Admin *</label>
          <select
            id="admin"
            value={selectedAdminId}
            onChange={(e) => setSelectedAdminId(e.target.value)}
            required
          >
            <option value="">-- Select an admin --</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.email}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="description">Request Description *</label>
          <textarea
            id="description"
            rows="4"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you need added, changed, or updated."
            required
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Request'}
        </button>

        {message && (
          <p style={{ marginTop: '10px', color: '#555' }}>{message}</p>
        )}
      </form>
    </div>
  )
}
