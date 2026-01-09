import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    role: 'user',
  })
  const [currentUserRole, setCurrentUserRole] = useState(null)

  useEffect(() => {
    checkAdminStatus()
    fetchUsers()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        setCurrentUserRole(data?.role)
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Generate a temporary password; user will set their own via email link
      const tempPassword = Math.random().toString(36).slice(-12)

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: tempPassword,
        options: {
          emailRedirectTo: window.location.origin,
        }
      })

      if (authError) throw authError

      // Update user role in profiles table
      if (authData.user) {
        const { data: { user } } = await supabase.auth.getUser()
        
        const { error: profileError } = await supabase
          .from('user_profiles')
          .update({ 
            role: formData.role,
            created_by: user.id
          })
          .eq('id', authData.user.id)

        if (profileError) throw profileError
      }

      // Send a password setup email so the user chooses their own password
      const redirectUrl = `${window.location.origin}/change-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: redirectUrl,
      })

      if (resetError) {
        console.error('Error sending password setup email:', resetError)
      }

      alert('User created successfully! They will receive an email to set their password.')
      setShowForm(false)
      setFormData({ email: '', role: 'user' })
      fetchUsers()
    } catch (error) {
      console.error('Error creating user:', error)
      alert('Error creating user: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId, userRole) => {
    if (userRole === 'admin') {
      alert('Cannot delete admin users!')
      return
    }

    if (!confirm('Are you sure you want to delete this user?')) {
      return
    }

    try {
      // Delete from user_profiles (this will cascade to auth.users if set up)
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId)

      if (error) throw error

      alert('User deleted successfully!')
      fetchUsers()
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error deleting user: ' + error.message)
    }
  }

  if (currentUserRole !== 'admin') {
    return (
      <div>
        <h2>Access Denied</h2>
        <p>You do not have permission to access this page.</p>
      </div>
    )
  }

  if (loading && users.length === 0) {
    return <div>Loading users...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>User Management</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Create New User'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>Create New User</h3>
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label htmlFor="email">Email *</label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="role">Role *</label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '15px' }}>All Users</h3>
        {users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Role</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Created</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{user.email}</td>
                  <td style={{ padding: '10px' }}>
                    <span className={`status-badge ${user.role === 'admin' ? 'status-compliant' : 'status-due-soon'}`}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {user.role !== 'admin' ? (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '5px 10px', fontSize: '0.85rem' }}
                        onClick={() => handleDeleteUser(user.id, user.role)}
                      >
                        Delete
                      </button>
                    ) : (
                      <span style={{ color: '#666', fontSize: '0.85rem' }}>Protected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
