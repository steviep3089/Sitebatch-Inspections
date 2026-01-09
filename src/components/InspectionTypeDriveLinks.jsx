import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function InspectionTypeDriveLinks() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    fetchTypes()
  }, [])

  const fetchTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('inspection_types')
        .select('id, name, description, google_drive_url')
        .order('name')

      if (error) throw error
      setTypes(data || [])
    } catch (error) {
      console.error('Error fetching inspection types:', error)
      alert('Error fetching inspection types: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUrlChange = (id, value) => {
    setTypes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, google_drive_url: value } : t))
    )
  }

  const handleSave = async (type) => {
    try {
      setSavingId(type.id)
      const { error } = await supabase
        .from('inspection_types')
        .update({ google_drive_url: type.google_drive_url || null })
        .eq('id', type.id)

      if (error) throw error
      // Refetch to keep in sync
      await fetchTypes()
    } catch (error) {
      console.error('Error saving Drive link:', error)
      alert('Error saving Drive link: ' + error.message)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <div>Loading inspection types...</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: '15px' }}>Inspection Type Drive Links</h2>
      <p style={{ marginBottom: '20px', color: '#555' }}>
        Configure the Google Drive folder URL for each inspection type. This is used
        throughout the portal to quickly open the correct certificate folder.
      </p>

      {types.length === 0 ? (
        <p>No inspection types found yet. Create an inspection first so its type appears here.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '10px' }}>Inspection Type</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Google Drive Folder URL</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr key={type.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px', verticalAlign: 'top' }}>{type.name}</td>
                <td style={{ padding: '10px', verticalAlign: 'top', fontSize: '0.9rem', color: '#555' }}>
                  {type.description || '—'}
                </td>
                <td style={{ padding: '10px', verticalAlign: 'top', width: '40%' }}>
                  <input
                    type="text"
                    value={type.google_drive_url || ''}
                    onChange={(e) => handleUrlChange(type.id, e.target.value)}
                    placeholder="Paste Google Drive folder link here"
                    style={{ width: '100%' }}
                  />
                </td>
                <td style={{ padding: '10px', verticalAlign: 'top' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSave(type)}
                    disabled={savingId === type.id}
                  >
                    {savingId === type.id ? 'Saving...' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
