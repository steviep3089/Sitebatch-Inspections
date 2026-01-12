import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function InspectionItemsAdmin() {
  const [loading, setLoading] = useState(true)
  const [inspectionTypes, setInspectionTypes] = useState([])
  const [assets, setAssets] = useState([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [items, setItems] = useState([])
  const [uniqueId, setUniqueId] = useState('')
  const [description, setDescription] = useState('')
  const [capacity, setCapacity] = useState('')
  const [capacityNa, setCapacityNa] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc') // asc | desc

  // Helper to sort IDs like "BX22 LB3", "BX22 LB4", "BX22 LB14" numerically
  const sortItemsByUniqueId = (itemsToSort, direction = 'asc') => {
    const dir = direction === 'desc' ? 'desc' : 'asc'

    const parseUniqueId = (id) => {
      const trimmed = (id || '').trim()
      // Split into prefix and trailing number, e.g. "BX22 LB" + 14
      const match = trimmed.match(/^(.*?)(\d+)\s*$/)
      if (!match) {
        return { prefix: trimmed.toLowerCase(), num: NaN }
      }
      return {
        prefix: match[1].toLowerCase(),
        num: parseInt(match[2], 10),
      }
    }

    return itemsToSort.sort((a, b) => {
      const aInfo = parseUniqueId(a.unique_id)
      const bInfo = parseUniqueId(b.unique_id)

      if (aInfo.prefix < bInfo.prefix) return dir === 'asc' ? -1 : 1
      if (aInfo.prefix > bInfo.prefix) return dir === 'asc' ? 1 : -1

      if (!Number.isNaN(aInfo.num) && !Number.isNaN(bInfo.num)) {
        if (aInfo.num < bInfo.num) return dir === 'asc' ? -1 : 1
        if (aInfo.num > bInfo.num) return dir === 'asc' ? 1 : -1
      }

      const aId = (a.unique_id || '').toLowerCase()
      const bId = (b.unique_id || '').toLowerCase()
      if (aId < bId) return dir === 'asc' ? -1 : 1
      if (aId > bId) return dir === 'asc' ? 1 : -1
      return 0
    })
  }

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [{ data: types }, { data: assetRows }] = await Promise.all([
          supabase.from('inspection_types').select('id, name').order('name'),
          // Use the same fields as the rest of the app: asset_id is the
          // visible code (e.g. BX22) rather than asset_code.
          supabase.from('asset_items').select('id, asset_id').order('asset_id'),
        ])

        setInspectionTypes(types || [])
        setAssets(assetRows || [])
      } catch (error) {
        console.error('Error loading inspection item admin lookups:', error)
      } finally {
        setLoading(false)
      }
    }

    loadLookups()
  }, [])

  useEffect(() => {
    // Reset current items and edit state when selection changes
    setItems([])
    setEditingItemId(null)
    setUniqueId('')
    setDescription('')
    setCapacity('')
    setCapacityNa(false)

    const loadItems = async () => {
      // Require at least one filter (asset or inspection type), but
      // allow "All" for either to show wider sets.
      if (!selectedTypeId && !selectedAssetId) {
        return
      }

      let query = supabase
        .from('inspection_item_templates')
        .select('*')

      if (selectedTypeId && selectedTypeId !== 'all') {
        query = query.eq('inspection_type_id', selectedTypeId)
      }

      if (selectedAssetId && selectedAssetId !== 'all') {
        query = query.eq('asset_id', selectedAssetId)
      }

      query = query.order('sort_order', { ascending: true })

      const { data, error } = await query

      if (error) {
        console.error('Error loading inspection item templates:', error)
        setItems([])
      } else {
        const loaded = data || []
        // Default sort using natural numeric order in the ID
        setItems(sortItemsByUniqueId(loaded, sortDirection))
      }
    }

    loadItems()
  }, [selectedTypeId, selectedAssetId])

  // Warn if user tries to type items while Asset is set to "All".
  const allowInputForCurrentAsset = () => {
    if (selectedAssetId === 'all') {
      alert('An asset must be selected before creating a new item.')
      return false
    }
    return true
  }

  const handleAddItem = async (e) => {
    e.preventDefault()
    // You can only add/edit an item when a single
    // asset and inspection type are selected (not "All").
    if (!selectedTypeId || !selectedAssetId || selectedTypeId === 'all' || selectedAssetId === 'all') {
      alert('Please select a specific asset and inspection type (not "All") before adding items.')
      return
    }

    // Validation: Unique Identification and Description are required,
    // and either Capacity must be filled OR N/A must be checked.
    if (!uniqueId.trim() || !description.trim()) {
      alert('Please enter both Unique Identification and Description.')
      return
    }

    if (!capacity.trim() && !capacityNa) {
      alert('Please either enter a Capacity or tick N/A.')
      return
    }

    // If we have an editing item, update it instead of inserting
    if (editingItemId) {
      const { data: updated, error } = await supabase
        .from('inspection_item_templates')
        .update({
          name: description.trim(),
          unique_id: uniqueId.trim(),
          description: description.trim(),
          capacity: capacityNa ? null : capacity.trim() || null,
          capacity_na: capacityNa,
        })
        .eq('id', editingItemId)
        .select()
        .single()

      if (error) {
        console.error('Error updating inspection item template:', error)
        return
      }

      setItems((prev) => prev.map((item) => (item.id === editingItemId ? updated : item)))
      setEditingItemId(null)
    } else {
      const { data: inserted, error } = await supabase
        .from('inspection_item_templates')
        .insert({
          inspection_type_id: selectedTypeId,
          asset_id: selectedAssetId,
          // Keep name populated for convenience, but store detailed
          // fields separately so we can use them in checklists later.
          name: description.trim(),
          unique_id: uniqueId.trim(),
          description: description.trim(),
          capacity: capacityNa ? null : capacity.trim() || null,
          capacity_na: capacityNa,
        })
        .select()
        .single()

      if (error) {
        console.error('Error adding inspection item template:', error)
        return
      }

      setItems((prev) => [...prev, inserted])
    }

    setUniqueId('')
    setDescription('')
    setCapacity('')
    setCapacityNa(false)
  }

  const handleDeleteItem = async (id) => {
    if (!window.confirm('Delete this item from the checklist template?')) return

    const { error } = await supabase
      .from('inspection_item_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting inspection item template:', error)
      return
    }

    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return <div>Loading inspection item tools...</div>
  }

  return (
    <div>
      <h2 style={{ marginBottom: '15px' }}>Inspection Item Templates</h2>
      <p style={{ marginBottom: '20px', color: '#555' }}>
        Choose an asset and inspection type, or select "All" to view
        templates across multiple assets or types.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div className="form-group" style={{ minWidth: '220px' }}>
          <label htmlFor="asset-select">Asset</label>
          <select
            id="asset-select"
            value={selectedAssetId}
            onChange={(e) => setSelectedAssetId(e.target.value)}
          >
            <option value="">Select asset...</option>
            <option value="all">All assets</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_id}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ minWidth: '220px' }}>
          <label htmlFor="type-select">Inspection Type</label>
          <select
            id="type-select"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
          >
            <option value="">Select type...</option>
            <option value="all">All types</option>
            {inspectionTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(selectedAssetId || selectedTypeId) ? (
        <>
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '10px' }}>Items for this asset &amp; type</h3>

            <form onSubmit={handleAddItem} style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
                    <label>Unique Identification *</label>
                    <input
                      type="text"
                      value={uniqueId}
                      onChange={(e) => {
                        if (!allowInputForCurrentAsset()) return
                        setUniqueId(e.target.value)
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 2, minWidth: '220px' }}>
                    <label>Description *</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => {
                        if (!allowInputForCurrentAsset()) return
                        setDescription(e.target.value)
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ minWidth: '180px' }}>
                    <label>Capacity</label>
                    <input
                      type="text"
                      value={capacity}
                      onChange={(e) => {
                        if (!allowInputForCurrentAsset()) return
                        setCapacity(e.target.value)
                      }}
                      disabled={capacityNa}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '18px' }}>
                    <input
                      type="checkbox"
                      checked={capacityNa}
                      onChange={(e) => {
                        if (!allowInputForCurrentAsset()) return
                        const checked = e.target.checked
                        setCapacityNa(checked)
                        if (checked) {
                          setCapacity('')
                        }
                      }}
                    />
                    N/A
                  </label>
                  <button type="submit" className="btn btn-primary" style={{ marginTop: '18px' }}>
                    {editingItemId ? 'Save Changes' : 'Add Item'}
                  </button>
                  {editingItemId && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: '18px' }}
                      onClick={() => {
                        setEditingItemId(null)
                        setUniqueId('')
                        setDescription('')
                        setCapacity('')
                        setCapacityNa(false)
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </form>

            {items.length === 0 ? (
              <p style={{ color: '#777' }}>No items defined yet for this combination.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ textAlign: 'left', padding: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <span>Unique ID</span>
                          <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Sort:
                            <select
                              value={sortDirection}
                              onChange={(e) => {
                                const dir = e.target.value
                                setSortDirection(dir)
                                setItems((prev) => sortItemsByUniqueId([...prev], dir))
                              }}
                              style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                            >
                              <option value="asc">A → Z</option>
                              <option value="desc">Z → A</option>
                            </select>
                          </label>
                        </div>
                      </th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Capacity / N/A</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px' }}>{item.unique_id || ''}</td>
                      <td style={{ padding: '8px' }}>{item.description || ''}</td>
                      <td style={{ padding: '8px' }}>
                        {item.capacity_na ? 'N/A' : item.capacity || ''}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.85rem', marginRight: '6px' }}
                          onClick={() => {
                            setEditingItemId(item.id)
                            setUniqueId(item.unique_id || '')
                            setDescription(item.description || '')
                            setCapacity(item.capacity || '')
                            setCapacityNa(!!item.capacity_na)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
            )}
          </div>
        </>
      ) : (
        <p style={{ color: '#777' }}>
          Select an asset and/or inspection type (or choose "All") to
          manage item templates.
        </p>
      )}
    </div>
  )
}
