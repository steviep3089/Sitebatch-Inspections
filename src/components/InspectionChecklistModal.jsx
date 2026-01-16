import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function InspectionChecklistModal({ inspection, onClose, onCreated }) {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [assets, setAssets] = useState([])
  const [inspectionTypes, setInspectionTypes] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [templates, setTemplates] = useState([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([])
  const [selectAll, setSelectAll] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [usersRes, assetsRes, typesRes] = await Promise.all([
          supabase.from('user_profiles').select('id, email, role').order('email'),
          supabase
            .from('asset_items')
            .select('id, asset_id')
            .order('sort_order', { ascending: true, nullsFirst: true })
            .order('asset_id'),
          supabase.from('inspection_types').select('id, name').order('name'),
        ])

        if (usersRes.error) throw usersRes.error
        if (assetsRes.error) throw assetsRes.error
        if (typesRes.error) throw typesRes.error

        setUsers(usersRes.data || [])
        setAssets(assetsRes.data || [])
        setInspectionTypes(typesRes.data || [])

        // Default filters from the inspection
        if (inspection?.asset_id) {
          setSelectedAssetId(inspection.asset_id)
        }
        if (inspection?.inspection_type_id) {
          setSelectedTypeId(inspection.inspection_type_id)
        }
      } catch (error) {
        console.error('Error loading checklist data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [inspection])

  useEffect(() => {
    const loadTemplates = async () => {
      // Require at least one filter, but allow "All" for
      // either asset or type to broaden the results.
      if (!selectedAssetId && !selectedTypeId) {
        setTemplates([])
        setSelectedTemplateIds([])
        setSelectAll(false)
        return
      }

      let query = supabase
        .from('inspection_item_templates')
        .select('*, inspection_item_template_assets(asset_id)')
        .eq('is_active', true)

      if (selectedTypeId && selectedTypeId !== 'all') {
        query = query.eq('inspection_type_id', selectedTypeId)
      }

      query = query.order('sort_order', { ascending: true })

      const { data, error } = await query

      if (error) {
        console.error('Error loading checklist templates:', error)
        setTemplates([])
        setSelectedTemplateIds([])
        setSelectAll(false)
        return
      }

      const loaded = (data || []).map((item) => ({
        ...item,
        associatedAssetIds: (item.inspection_item_template_assets || []).map((row) => row.asset_id),
      }))

      const filtered =
        selectedAssetId && selectedAssetId !== 'all'
          ? loaded.filter(
              (item) =>
                item.associatedAssetIds.length === 0 ||
                item.associatedAssetIds.includes(selectedAssetId)
            )
          : loaded

      setTemplates(filtered)
      setSelectedTemplateIds([])
      setSelectAll(false)
    }

    loadTemplates()
  }, [selectedAssetId, selectedTypeId])

  const toggleTemplate = (id) => {
    setSelectedTemplateIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }

  const toggleSelectAll = (checked) => {
    setSelectAll(checked)
    if (checked) {
      setSelectedTemplateIds(templates.map((t) => t.id))
    } else {
      setSelectedTemplateIds([])
    }
  }

  const handleCreateChecklist = async () => {
    if (!inspection?.id) {
      alert('Inspection details are missing; cannot create checklist.')
      return
    }
    if (!inspection.asset_id || !inspection.inspection_type_id) {
      alert('This inspection is missing its asset or inspection type; cannot create a checklist.')
      return
    }
    if (!selectedUserId) {
      alert('Please select a user to assign the checklist to.')
      return
    }
    if (selectedTemplateIds.length === 0) {
      alert('Please select at least one item.')
      return
    }

    setSaving(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData?.user?.id || null
      const currentUserEmail = authData?.user?.email || null

      const { data: checklist, error: checklistError } = await supabase
        .from('inspection_checklists')
        .insert({
          inspection_id: inspection.id,
          // Always tie the checklist to the inspection's
          // asset and type; the filters above are just for
          // picking which template items to include.
          asset_id: inspection.asset_id,
          inspection_type_id: inspection.inspection_type_id,
          assigned_user_id: selectedUserId,
          status: 'sent',
          due_date: inspection.due_date || null,
          created_by: currentUserId,
        })
        .select()
        .single()

      if (checklistError) throw checklistError

      const chosenTemplates = templates.filter((t) =>
        selectedTemplateIds.includes(t.id)
      )

      if (chosenTemplates.length > 0) {
        const itemsToInsert = chosenTemplates.map((t, index) => ({
          checklist_id: checklist.id,
          template_id: t.id,
            label:
              (t.unique_id ? `${t.unique_id} – ` : '') +
                (t.description || t.name || '') ||
              t.unique_id ||
              `Item ${index + 1}`,
          sort_order: index,
          created_by: currentUserId,
        }))

        const { error: itemsError } = await supabase
          .from('inspection_checklist_items')
          .insert(itemsToInsert)

        if (itemsError) throw itemsError
      }

      // Log that a checklist was created for this inspection
      try {
        const assignedUser = users.find((u) => u.id === selectedUserId)
        const assignedEmail = assignedUser?.email || 'unknown user'

        const payload = {
          inspection_id: inspection.id,
          action: 'checklist_created',
          details: `${currentUserEmail || 'Unknown user'}: Inspection checklist created and assigned to ${assignedEmail}.`,
        }
        if (currentUserId) {
          payload.created_by = currentUserId
        }
        const { error: logError } = await supabase
          .from('inspection_logs')
          .insert(payload)
        if (logError) {
          console.error('Error logging checklist creation:', logError)
        }
      } catch (logError) {
        console.error('Error logging checklist creation:', logError)
      }

      // Fire-and-forget email notification to the assigned user.
      // Even if this fails, the checklist itself is still created.
      try {
        await supabase.functions.invoke('send-checklist-email', {
          body: { checklist_id: checklist.id },
        })
      } catch (funcCallError) {
        console.error('Error calling send-checklist-email function:', funcCallError)
        let details = funcCallError?.message || 'Unknown error'
        try {
          const resp = funcCallError?.context?.response
          if (resp) {
            const text = await resp.text()
            if (text) {
              details += ' | ' + text
            }
          }
        } catch (inner) {
          console.error('Error reading function error response:', inner)
        }
        alert('Checklist created, but email failed: ' + details)
      }

      alert('Checklist created and assigned.')
      if (onCreated) onCreated()
    } catch (error) {
      console.error('Error creating checklist:', error)
      alert('Error creating checklist: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (!inspection) return null

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
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '900px',
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          ×
        </button>

        <h2 style={{ marginBottom: '15px' }}>
          Create Inspection Checklist
        </h2>
        <p style={{ marginBottom: '15px', color: '#555' }}>
          Inspection: {inspection.inspection_types?.name || 'Unknown'} –
          {' '}Asset {inspection.asset_items?.asset_id || ''}
        </p>

        {loading ? (
          <p>Loading checklist options...</p>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '16px',
              }}
            >
              <div className="form-group" style={{ minWidth: '220px' }}>
                <label>Assign to user</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email} {user.role ? `(${user.role})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ minWidth: '220px' }}>
                <label>Asset Filter</label>
                <select
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
                <label>Inspection Type</label>
                <select
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

            <div className="card" style={{ marginTop: '10px' }}>
              <h3 style={{ marginBottom: '10px' }}>Checklist Items</h3>
              {(!selectedAssetId || !selectedTypeId) && (
                <p style={{ color: '#777' }}>
                  Select an asset and inspection type to load available items.
                </p>
              )}

              {selectedAssetId && selectedTypeId && (
                <>
                  {templates.length === 0 ? (
                    <p style={{ color: '#777' }}>
                      No templates defined yet for this combination.
                    </p>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <label
                          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <input
                            type="checkbox"
                            checked={selectAll}
                            onChange={(e) => toggleSelectAll(e.target.checked)}
                          />
                          Select all items
                        </label>
                      </div>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '0.9rem',
                        }}
                      >
                        <thead>
                          <tr style={{ borderBottom: '2px solid #ddd' }}>
                            <th style={{ padding: '6px', textAlign: 'left' }}></th>
                            <th style={{ padding: '6px', textAlign: 'left' }}>Unique ID</th>
                            <th style={{ padding: '6px', textAlign: 'left' }}>Description</th>
                            <th style={{ padding: '6px', textAlign: 'left' }}>Capacity / N/A</th>
                          </tr>
                        </thead>
                        <tbody>
                          {templates.map((item) => (
                            <tr
                              key={item.id}
                              style={{ borderBottom: '1px solid #eee' }}
                            >
                              <td style={{ padding: '6px' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedTemplateIds.includes(item.id)}
                                  onChange={() => toggleTemplate(item.id)}
                                />
                              </td>
                              <td style={{ padding: '6px' }}>{item.unique_id || ''}</td>
                              <td style={{ padding: '6px' }}>{item.description || ''}</td>
                              <td style={{ padding: '6px' }}>
                                {item.capacity_na ? 'N/A' : item.capacity || ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '16px',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateChecklist}
                disabled={saving}
              >
                {saving ? 'Creating...' : 'Create and assign checklist'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
