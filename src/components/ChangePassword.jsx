import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ChangePassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')

    if (!newPassword || !confirmPassword) {
      setMessage('Please enter and confirm your new password.')
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    if (newPassword.length < 8) {
      setMessage('Password must be at least 8 characters long.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setMessage('Password updated successfully. Please sign in with your new password.')
      setNewPassword('')
      setConfirmPassword('')

      // After changing the password (from email or inside the portal),
      // sign the user out and send them back to the login screen so
      // they start a clean session with their new credentials.
      await supabase.auth.signOut()

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('force_password_change')
        setTimeout(() => {
          window.location.replace('/')
        }, 1000)
      }
    } catch (error) {
      setMessage(error.message || 'Error updating password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '15px' }}>Change Password</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="new_password">New Password</label>
          <input
            id="new_password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirm_password">Confirm New Password</label>
          <input
            id="confirm_password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', marginTop: '10px' }}
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
      {message && (
        <p style={{ marginTop: '15px', color: message.includes('successfully') ? '#2e7d32' : '#f44336' }}>
          {message}
        </p>
      )}
    </div>
  )
}
