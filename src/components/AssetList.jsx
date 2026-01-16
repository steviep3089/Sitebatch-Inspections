import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import AssetInspectionTimeline from './AssetInspectionTimeline'

export default function AssetList() {
  const assetTypeOptions = [
    { value: 'main_plant', label: 'Main Plants' },
    { value: 'water_tank', label: 'Water Tanks' },
    { value: 'aggregate_bin', label: 'Aggregate Bins' },
    { value: 'generator', label: 'Generators' },
    { value: 'trailer', label: 'Trailers' },
  ]

  const [assetItems, setAssetItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleLoading, setRoleLoading] = useState(true)
  const [userRole, setUserRole] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(null) // Track which asset's event form is open
  const [expandedAsset, setExpandedAsset] = useState(null)
  const [editingAssetId, setEditingAssetId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editFormData, setEditFormData] = useState({
    asset_id: '',
    name: '',
    location: '',
    status: 'active',
    asset_type: '',
    install_date: '',
    notes: '',
  })
  const [formData, setFormData] = useState({
    asset_id: '',
    name: '',
    location: '',
    status: 'active',
    asset_type: '',
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

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single()

          setUserRole(data?.role || null)
        }
      } catch (error) {
        console.error('Error fetching user role in AssetList:', error)
      } finally {
        setRoleLoading(false)
      }
    }

    fetchRole()
  }, [])

  const fetchAssetItems = async () => {
    try {
      const { data, error } = await supabase
        .from('asset_items')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: true })
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
      const maxOrder = assetItems.reduce((max, item) => Math.max(max, item.sort_order || 0), 0)
      const { error } = await supabase.from('asset_items').insert([
        {
          asset_id: formData.asset_id,
          name: formData.name || formData.asset_id,
          location: formData.location,
          status: formData.status,
          asset_type: formData.asset_type || null,
          install_date: formData.install_date,
          notes: formData.notes,
          sort_order: maxOrder + 1,
        },
      ])

      if (error) throw error

      setShowForm(false)
      setFormData({
        asset_id: '',
        name: '',
        location: '',
        status: 'active',
        asset_type: '',
        install_date: '',
        notes: '',
      })
      fetchAssetItems()
    } catch (error) {
      console.error('Error adding asset:', error)
      alert('Error adding asset: ' + (error.message || error.details || 'Unknown error'))
    }
  }

  const startEditAsset = (asset) => {
    setEditingAssetId(asset.id)
    setEditFormData({
      asset_id: asset.asset_id || '',
      name: asset.name || '',
      location: asset.location || '',
      status: asset.status || 'active',
      asset_type: asset.asset_type || '',
      install_date: asset.install_date || '',
      notes: asset.notes || '',
    })
  }

  const handleEditSubmit = async (e, assetId) => {
    e.preventDefault()
    try {
      const { error } = await supabase
        .from('asset_items')
        .update({
          asset_id: editFormData.asset_id,
          name: editFormData.name || editFormData.asset_id,
          location: editFormData.location,
          status: editFormData.status,
          asset_type: editFormData.asset_type || null,
          install_date: editFormData.install_date,
          notes: editFormData.notes,
        })
        .eq('id', assetId)

      if (error) throw error

      setEditingAssetId(null)
      await fetchAssetItems()
    } catch (error) {
      console.error('Error updating asset:', error)
      alert('Error updating asset: ' + error.message)
    }
  }

  const handleDeleteAsset = async (assetId) => {
    if (!window.confirm('Are you sure you want to delete this asset?')) return

    try {
      const { error } = await supabase
        .from('asset_items')
        .delete()
        .eq('id', assetId)

      if (error) throw error

      if (expandedAsset === assetId) {
        setExpandedAsset(null)
      }
      if (editingAssetId === assetId) {
        setEditingAssetId(null)
      }

      await fetchAssetItems()
    } catch (error) {
      console.error('Error deleting asset:', error)
      alert('Error deleting asset: ' + error.message)
    }
  }

  const toggleAssetExpand = (assetId) => {
    setExpandedAsset(expandedAsset === assetId ? null : assetId)
  }

  const canReorder = userRole === 'admin' && statusFilter === 'all' && typeFilter === 'all'

  const persistSortOrder = async (updatedAssets) => {
    const updates = updatedAssets.map((item, index) => ({
      id: item.id,
      sort_order: index + 1,
    }))
    const results = await Promise.all(
      updates.map((update) =>
        supabase.from('asset_items').update({ sort_order: update.sort_order }).eq('id', update.id)
      )
    )
    const error = results.find((res) => res.error)?.error
    if (error) {
      console.error('Error updating asset order:', error)
      alert('Error updating asset order: ' + error.message)
      return false
    }
    return true
  }

  const handleDrop = async (targetId) => {
    if (!canReorder || !draggingId || draggingId === targetId) return
    const currentIndex = assetItems.findIndex((item) => item.id === draggingId)
    const targetIndex = assetItems.findIndex((item) => item.id === targetId)
    if (currentIndex === -1 || targetIndex === -1) return

    const updated = [...assetItems]
    const [moved] = updated.splice(currentIndex, 1)
    updated.splice(targetIndex, 0, moved)
    setAssetItems(updated)
    setDraggingId(null)
    setDragOverId(null)
    await persistSortOrder(updated)
  }

  const filteredAssets = assetItems.filter((asset) => {
    const statusMatch = statusFilter === 'all' || asset.status === statusFilter
    const typeMatch =
      typeFilter === 'all' ||
      (typeFilter === 'unassigned' && !asset.asset_type) ||
      asset.asset_type === typeFilter
    return statusMatch && typeMatch
  })

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
        {userRole === 'admin' && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add Asset'}
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div className="form-group" style={{ minWidth: '200px' }}>
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="decommissioned">Decommissioned</option>
          </select>
        </div>
        <div className="form-group" style={{ minWidth: '220px' }}>
          <label>Asset Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            {assetTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {userRole === 'admin' && (
          <div style={{ fontSize: '0.85rem', color: '#666', alignSelf: 'flex-end' }}>
            {canReorder
              ? 'Drag assets to reorder.'
              : 'Clear filters to reorder assets.'}
          </div>
        )}
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
              <label htmlFor="name">Asset Description *</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
              <label htmlFor="asset_type">Asset Type</label>
              <select
                id="asset_type"
                value={formData.asset_type}
                onChange={(e) => setFormData({ ...formData, asset_type: e.target.value })}
              >
                <option value="">Unassigned</option>
                {assetTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
        {filteredAssets.length === 0 ? (
          <p>No assets match the current filters.</p>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="card"
              style={{
                border: dragOverId === asset.id ? '2px dashed #3b82f6' : undefined,
              }}
              onDragOver={(e) => {
                if (!canReorder) return
                e.preventDefault()
                setDragOverId(asset.id)
              }}
              onDragLeave={() => {
                if (!canReorder) return
                setDragOverId(null)
              }}
              onDrop={(e) => {
                if (!canReorder) return
                e.preventDefault()
                handleDrop(asset.id)
              }}
            >
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {canReorder && (
                    <span
                      draggable
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.stopPropagation()
                        setDraggingId(asset.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setDragOverId(null)
                      }}
                      style={{
                        cursor: 'grab',
                        fontSize: '1.1rem',
                        padding: '2px 6px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        background: '#f8f9fa',
                      }}
                      title="Drag to reorder"
                    >
                      ≡
                    </span>
                  )}
                  <span className={`status-badge status-${asset.status === 'active' ? 'compliant' : 'decommissioned'}`}>
                    {asset.status.toUpperCase()}
                  </span>
                  {userRole === 'admin' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditAsset(asset)
                          setExpandedAsset(asset.id)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteAsset(asset.id)
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {expandedAsset === asset.id && (
                <div style={{ marginTop: '15px', borderTop: '1px solid #e0e0e0', paddingTop: '15px' }}>
                  {editingAssetId === asset.id && (
                    <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                      <h4 style={{ marginBottom: '10px' }}>Edit Asset</h4>
                      <form onSubmit={(e) => handleEditSubmit(e, asset.id)}>
                        <div className="form-group">
                          <label htmlFor={`edit_asset_id_${asset.id}`}>Asset ID *</label>
                          <input
                            id={`edit_asset_id_${asset.id}`}
                            type="text"
                            value={editFormData.asset_id}
                            onChange={(e) => setEditFormData({ ...editFormData, asset_id: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit_name_${asset.id}`}>Asset Description *</label>
                          <input
                            id={`edit_name_${asset.id}`}
                            type="text"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit_location_${asset.id}`}>Location</label>
                          <input
                            id={`edit_location_${asset.id}`}
                            type="text"
                            value={editFormData.location}
                            onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit_status_${asset.id}`}>Status</label>
                          <select
                            id={`edit_status_${asset.id}`}
                            value={editFormData.status}
                            onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                          >
                            <option value="active">Active</option>
                            <option value="decommissioned">Decommissioned</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit_asset_type_${asset.id}`}>Asset Type</label>
                          <select
                            id={`edit_asset_type_${asset.id}`}
                            value={editFormData.asset_type}
                            onChange={(e) => setEditFormData({ ...editFormData, asset_type: e.target.value })}
                          >
                            <option value="">Unassigned</option>
                            {assetTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit_install_date_${asset.id}`}>Install Date</label>
                          <input
                            id={`edit_install_date_${asset.id}`}
                            type="date"
                            value={editFormData.install_date || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, install_date: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit_notes_${asset.id}`}>Notes</label>
                          <textarea
                            id={`edit_notes_${asset.id}`}
                            rows="3"
                            value={editFormData.notes || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ marginRight: '8px' }}>
                          Save Changes
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setEditingAssetId(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    </div>
                  )}

                  {userRole === 'admin' && (
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
                  )}

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

                  <AssetInspectionTimeline assetId={asset.id} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
