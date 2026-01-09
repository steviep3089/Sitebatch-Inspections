import { useState } from 'react'
import { supabase } from '../supabaseClient'
import logo from '../assets/logo.png'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleSignIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setMessage('')

    if (!email) {
      setMessage('Please enter your email above first, then click Forgot password.')
      return
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://sitebatch-inspections.vercel.app/change-password',
      })
      if (error) throw error
      setMessage('Password reset email sent. Please check your inbox.')
    } catch (error) {
      setMessage(error.message || 'Error sending password reset email.')
    }
  }

  return (
    <div className="App">
      <div className="container" style={{ maxWidth: '400px', margin: '100px auto' }}>
        <div className="card">
          {/* Logo - replace logo.svg in src/assets with your own */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <img 
              src={logo} 
              alt="Sitebatch Inspections Logo" 
              style={{
                width: '180px',
                height: '120px',
                margin: '0 auto 20px',
                display: 'block'
              }}
            />
          </div>
          
          <h1 style={{ marginBottom: '10px', textAlign: 'center' }}>
            Sitebatch Inspections
          </h1>
          <h2 style={{ marginBottom: '30px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 'normal', color: '#666' }}>
            Sign In
          </h2>
          
          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: '10px' }}
            >
              {loading ? 'Loading...' : 'Sign In'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleForgotPassword}
            style={{
              marginTop: '10px',
              background: 'none',
              border: 'none',
              color: '#1976d2',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '0.9rem',
              display: 'block',
              textAlign: 'center'
            }}
          >
            Forgot password?
          </button>
          
          {message && (
            <p style={{ 
              marginTop: '15px', 
              textAlign: 'center', 
              color: '#f44336',
              padding: '10px',
              background: '#ffebee',
              borderRadius: '4px'
            }}>
              {message}
            </p>
          )}
          
          <p style={{ marginTop: '20px', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
            Need an account? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
