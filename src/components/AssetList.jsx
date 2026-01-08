import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import AssetInspectionTimeline from './AssetInspectionTimeline'

export default function AssetList() {
  const [assetItems, setAssetItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(null) // Track which asset's event form is open
  const [expandedAsset, setExpandedAsset] = useState(null)
  const [formData, setFormData] = useState({
    asset_id: '',
    location: '',
    status: 'active',
    install_date: '',
    notes: '',
  })
  const [eventFormData, setEventFormData] = useState({
    start_date: '',
    end_date: '',
    description: '',
    end_status: 'active',
    location: '',
  })

  useEffect(() => {
    fetchAssetItems()
  }, [])

  const fetchAssetItems = async () => {
    try {
      const { data, error } = await supabase
        .from('asset_items')
        .select('*')
        .order('asset_id', { ascending: true })

      if (error) throw error
      setAssetItems(data || [])
    } catch (error) {
      console.error('Error fetching plant items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('asset_items').insert([formData])

      if (error) throw error

      setShowForm(false)
      setFormData({
        asset_id: '',
        location: '',
        status: 'active',
        install_date: '',
        notes: '',
      })
      fetchAssetItems()
    } catch (error) {
      console.error('Error adding asset:', error)
      alert('Error adding asset: ' + error.message)
    }
  }

  const toggleAssetExpand = (assetId) => {
    setExpandedAsset(expandedAsset === assetId ? null : assetId)
  }

  const handleEventSubmit = async (e, assetId) => {
    e.preventDefault()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Insert the event
      const { error: eventError } = await supabase.from('asset_events').insert([{
        asset_id: assetId,
        start_date: eventFormData.start_date,
        end_date: eventFormData.end_date,
        description: eventFormData.description,
        end_status: eventFormData.end_status,
        created_by: user?.id
      }])

      if (eventError) throw eventError

      // Update the asset location if provided
      if (eventFormData.location) {
        const { error: updateError } = await supabase
          .from('asset_items')
          .update({ location: eventFormData.location })
          .eq('id', assetId)

        if (updateError) throw updateError
      }

      setShowEventForm(null)
      setEventFormData({
        start_date: '',
        end_date: '',
        description: '',
        end_status: 'active',
        location: '',
      })
      // Trigger refresh
      fetchAssetItems()
      setExpandedAsset(null)
      setTimeout(() => setExpandedAsset(assetId), 100)
    } catch (error) {
      console.error('Error adding event:', error)
      alert('Error adding event: ' + error.message)
    }
  }

  if (loading) {
    return <div>Loading assets...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Asset Items</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Asset'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>Add New Asset</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="asset_id">Asset ID *</label>
              <input
                id="asset_id"
                type="text"
                value={formData.asset_id}
                onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="install_date">Install Date</label>
              <input
                id="install_date"
                type="date"
                value={formData.install_date}
                onChange={(e) => setFormData({ ...formData, install_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                rows="3"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Add Asset
            </button>
          </form>
        </div>
      )}

      <div>
        {assetItems.length === 0 ? (
          <p>No assets found. Add your first asset above.</p>
        ) : (
          assetItems.map((asset) => (
            <div key={asset.id} className="card">
              <div
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => toggleAssetExpand(asset.id)}
              >
                <div>
                  <h3 style={{ marginBottom: '5px' }}>
                    {asset.asset_id}
                  </h3>
                  <p style={{ color: '#666', fontSize: '0.9rem' }}>
                    {asset.location} | Installed: {asset.install_date ? new Date(asset.install_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <span className={`status-badge status-${asset.status === 'active' ? 'compliant' : 'decommissioned'}`}>
                  {asset.status.toUpperCase()}
                </span>
              </div>
              
              {expandedAsset === asset.id && (
                <div style={{ marginTop: '15px', borderTop: '1px solid #e0e0e0', paddingTop: '15px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowEventForm(showEventForm === asset.id ? null : asset.id)
                      }}
                    >
                      {showEventForm === asset.id ? 'Cancel Event' : 'Add Event'}
                    </button>
                  </div>

                  {showEventForm === asset.id && (
                    <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                      <h4 style={{ marginBottom: '10px' }}>Add Event</h4>
                      <form onSubmit={(e) => handleEventSubmit(e, asset.id)}>
                        <div className="form-group">
                          <label htmlFor={`start_date_${asset.id}`}>Start Date *</label>
                          <input
                            id={`start_date_${asset.id}`}
                            type="date"
                            value={eventFormData.start_date}
                            onChange={(e) => setEventFormData({ ...eventFormData, start_date: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`end_date_${asset.id}`}>End Date *</label>
                          <input
                            id={`end_date_${asset.id}`}
                            type="date"
                            value={eventFormData.end_date}
                            onChange={(e) => setEventFormData({ ...eventFormData, end_date: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`description_${asset.id}`}>Description of Action Taken *</label>
                          <textarea
                            id={`description_${asset.id}`}
                            rows="3"
                            value={eventFormData.description}
                            onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                            placeholder="Describe the event or action taken..."
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`end_status_${asset.id}`}>Status After Event *</label>
                          <select
                            id={`end_status_${asset.id}`}
                            value={eventFormData.end_status}
                            onChange={(e) => setEventFormData({ ...eventFormData, end_status: e.target.value })}
                          >
                            <option value="active">Active</option>
                            <option value="decommissioned">Decommissioned</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor={`location_${asset.id}`}>New Location (Optional)</label>
                          <input
                            id={`location_${asset.id}`}
                            type="text"
                            value={eventFormData.location}
                            onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                            placeholder="Enter new location if asset was relocated..."
                          />
                        </div>
                        <button type="submit" className="btn btn-primary">
                          Save Event
                        </button>
                      </form>
                    </div>
                  )}

                  <AssetInspectionTimeline plantId={asset.id} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
