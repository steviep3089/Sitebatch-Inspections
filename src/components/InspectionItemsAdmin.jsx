import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function InspectionItemsAdmin() {
  const [loading, setLoading] = useState(true)
  const [inspectionTypes, setInspectionTypes] = useState([])
  const [assets, setAssets] = useState([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [items, setItems] = useState([])
  const [associatedAssetIds, setAssociatedAssetIds] = useState([])
  const [uniqueId, setUniqueId] = useState('')
  const [description, setDescription] = useState('')
  const [capacity, setCapacity] = useState('')
  const [capacityNa, setCapacityNa] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryNa, setExpiryNa] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc') // asc | desc
  const [importFile, setImportFile] = useState(null)
  const [importStatus, setImportStatus] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const [importPreview, setImportPreview] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [pendingImportRows, setPendingImportRows] = useState([])
  const [pendingInsertRows, setPendingInsertRows] = useState([])
  const [overwriteSelections, setOverwriteSelections] = useState({})

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
          supabase
            .from('asset_items')
            .select('id, asset_id')
            .order('sort_order', { ascending: true, nullsFirst: true })
            .order('asset_id'),
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

  const loadItems = async () => {
    // Require at least one filter (asset or inspection type), but
    // allow "All" for either to show wider sets.
    if (!selectedTypeId && !selectedAssetId) {
      return
    }

    let query = supabase
      .from('inspection_item_templates')
      .select('*, inspection_item_template_assets(asset_id)')

    if (selectedTypeId && selectedTypeId !== 'all') {
      query = query.eq('inspection_type_id', selectedTypeId)
    }

    query = query.order('sort_order', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Error loading inspection item templates:', error)
      setItems([])
    } else {
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
      // Default sort using natural numeric order in the ID
      setItems(sortItemsByUniqueId(filtered, sortDirection))
    }
  }

  useEffect(() => {
    // Reset current items and edit state when selection changes
    setItems([])
    setEditingItemId(null)
    setUniqueId('')
    setDescription('')
    setCapacity('')
    setCapacityNa(false)
    setExpiryDate('')
    setExpiryNa(false)
    setAssociatedAssetIds([])

    loadItems()
  }, [selectedTypeId, selectedAssetId])

  // Warn if user tries to type items while Asset is set to "All".
  const allowInputForCurrentAsset = () => {
    if (!selectedTypeId || selectedTypeId === 'all') {
      alert('Please select a specific inspection type before creating a new item.')
      return false
    }
    return true
  }

  const handleAddItem = async (e) => {
    e.preventDefault()
    // You can only add/edit an item when a single
    // asset and inspection type are selected (not "All").
    if (!selectedTypeId || selectedTypeId === 'all') {
      alert('Please select a specific inspection type (not "All") before adding items.')
      return
    }

    if (associatedAssetIds.length === 0) {
      alert('Please select at least one associated asset.')
      return
    }

    // Validation: Unique Identification and Description are required,
    // and either Capacity must be filled OR N/A must be checked.
    const normalisedUniqueId = normaliseUniqueIdForSave(uniqueId)

    if (!normalisedUniqueId || !description.trim()) {
      alert('Please enter both Unique Identification and Description.')
      return
    }

    if (!capacity.trim() && !capacityNa) {
      alert('Please either enter a Capacity or tick N/A.')
      return
    }

    if (!expiryDate && !expiryNa) {
      alert('Please either select an Expiry Date or tick N/A.')
      return
    }

    const triggerItemReminder = async (templateId) => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
          console.warn('Missing Supabase env vars for item reminders.')
          return
        }

        await fetch(`${supabaseUrl}/functions/v1/send-item-reminders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ template_id: templateId }),
        })
      } catch (funcError) {
        console.error('Error invoking send-item-reminders:', funcError)
      }
    }

    // If we have an editing item, update it instead of inserting
    if (editingItemId) {
      const { data: updated, error } = await supabase
        .from('inspection_item_templates')
        .update({
          name: description.trim(),
          unique_id: normalisedUniqueId,
          description: description.trim(),
          capacity: capacityNa ? null : capacity.trim() || null,
          capacity_na: capacityNa,
          expiry_date: expiryNa ? null : expiryDate || null,
          expiry_na: expiryNa,
        })
        .eq('id', editingItemId)
        .select()
        .single()

      if (error) {
        console.error('Error updating inspection item template:', error)
        return
      }

      const { error: clearError } = await supabase
        .from('inspection_item_template_assets')
        .delete()
        .eq('template_id', editingItemId)

      if (clearError) {
        console.error('Error clearing template asset links:', clearError)
        return
      }

      const links = associatedAssetIds.map((assetId) => ({
        template_id: editingItemId,
        asset_id: assetId,
      }))

      const { error: linkError } = await supabase
        .from('inspection_item_template_assets')
        .insert(links)

      if (linkError) {
        console.error('Error updating template asset links:', linkError)
        return
      }

      await triggerItemReminder(editingItemId)

      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItemId
            ? { ...updated, associatedAssetIds: [...associatedAssetIds] }
            : item
        )
      )
      setEditingItemId(null)
    } else {
      const { data: inserted, error } = await supabase
        .from('inspection_item_templates')
        .insert({
          inspection_type_id: selectedTypeId,
          // Keep name populated for convenience, but store detailed
          // fields separately so we can use them in checklists later.
          name: description.trim(),
          unique_id: normalisedUniqueId,
          description: description.trim(),
          capacity: capacityNa ? null : capacity.trim() || null,
          capacity_na: capacityNa,
          expiry_date: expiryNa ? null : expiryDate || null,
          expiry_na: expiryNa,
        })
        .select()
        .single()

      if (error) {
        console.error('Error adding inspection item template:', error)
        return
      }

      const links = associatedAssetIds.map((assetId) => ({
        template_id: inserted.id,
        asset_id: assetId,
      }))

      const { error: linkError } = await supabase
        .from('inspection_item_template_assets')
        .insert(links)

      if (linkError) {
        console.error('Error linking template to assets:', linkError)
        return
      }

      await triggerItemReminder(inserted.id)

      setItems((prev) => [
        ...prev,
        { ...inserted, associatedAssetIds: [...associatedAssetIds] },
      ])
    }

    setUniqueId('')
    setDescription('')
    setCapacity('')
    setCapacityNa(false)
    setExpiryDate('')
    setExpiryNa(false)
    setAssociatedAssetIds([])
  }

  const parseCsv = (text) => {
    const rows = []
    let current = ''
    let row = []
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const next = text[i + 1]

      if (char === '"' && next === '"') {
        current += '"'
        i++
        continue
      }

      if (char === '"') {
        inQuotes = !inQuotes
        continue
      }

      if (char === ',' && !inQuotes) {
        row.push(current)
        current = ''
        continue
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i++
        row.push(current)
        current = ''
        if (row.length > 1 || row[0] !== '') {
          rows.push(row)
        }
        row = []
        continue
      }

      current += char
    }

    if (current.length > 0 || row.length > 0) {
      row.push(current)
      rows.push(row)
    }

    return rows
  }

  const toBool = (value) => {
    if (typeof value !== 'string') return false
    const trimmed = value.trim().toLowerCase()
    return trimmed === 'true' || trimmed === 'yes' || trimmed === 'y' || trimmed === '1'
  }

  const normaliseUniqueId = (value) => {
    if (!value || typeof value !== 'string') return ''
    return value
      .trim()
      .toLowerCase()
      .replace(/[-_]/g, '')
      .replace(/\s+/g, '')
  }

  const normaliseUniqueIdForSave = (value) => {
    if (!value || typeof value !== 'string') return ''
    return value.trim().replace(/\s+/g, ' ')
  }

  const normaliseDate = (value) => {
    if (!value || typeof value !== 'string') return ''
    const trimmed = value.trim()
    if (!trimmed) return ''

    const matchDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (matchDash) {
      const day = matchDash[1].padStart(2, '0')
      const month = matchDash[2].padStart(2, '0')
      const year = matchDash[3]
      return `${year}-${month}-${day}`
    }

    const matchSlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (matchSlash) {
      const day = matchSlash[1].padStart(2, '0')
      const month = matchSlash[2].padStart(2, '0')
      const year = matchSlash[3]
      return `${year}-${month}-${day}`
    }

    return trimmed
  }

  const handleImportCsv = async () => {
    if (!importFile) {
      setImportStatus('Please select a CSV file first.')
      return
    }

    setImportStatus('Parsing CSV...')
    setImportErrors([])
    setImportPreview([])
    setShowPreview(false)
    setPendingImportRows([])
    setPendingInsertRows([])
    setOverwriteSelections({})

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const text = reader.result || ''
        const rows = parseCsv(String(text))
        if (rows.length < 2) {
          setImportStatus('CSV must include a header row and at least one data row.')
          return
        }

        const headers = rows[0].map((h) => (h || '').trim().toLowerCase())
        const dataRows = rows.slice(1)

        const indexOf = (name) => headers.indexOf(name)

        const typeIndex = indexOf('inspection_type')
        const uniqueIndex = indexOf('unique_id')
        const descriptionIndex = indexOf('description')
        const capacityIndex = indexOf('capacity')
        const capacityNaIndex = indexOf('capacity_na')
        const expiryIndex = indexOf('expiry_date')
        const expiryNaIndex = indexOf('expiry_na')
        const assetsIndex = indexOf('assets')
        const sortIndex = indexOf('sort_order')
        const activeIndex = indexOf('is_active')

        if (typeIndex === -1 || uniqueIndex === -1 || descriptionIndex === -1) {
          setImportStatus('CSV must include inspection_type, unique_id, and description columns.')
          return
        }

        const typeMap = (inspectionTypes || []).reduce((acc, type) => {
          acc[(type.name || '').trim().toLowerCase()] = type.id
          acc[type.id] = type.id
          return acc
        }, {})

        const assetMap = (assets || []).reduce((acc, asset) => {
          acc[(asset.asset_id || '').trim().toLowerCase()] = asset.id
          acc[asset.id] = asset.id
          return acc
        }, {})

        const errors = []
        const rowsToInsert = []
        const rowsToCompare = []

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i]
          const rowNumber = i + 2
          const inspectionTypeRaw = (row[typeIndex] || '').trim()
          const inspectionTypeId = typeMap[inspectionTypeRaw.toLowerCase()] || typeMap[inspectionTypeRaw]

          const uniqueIdRaw = (row[uniqueIndex] || '').trim()
          const uniqueId = normaliseUniqueIdForSave(uniqueIdRaw)
          const matchKey = normaliseUniqueId(uniqueIdRaw)
          const description = (row[descriptionIndex] || '').trim()

          if (!inspectionTypeId || !uniqueId || !description) {
            errors.push(`Row ${rowNumber}: missing inspection_type, unique_id, or description`)
            continue
          }

          const capacity = capacityIndex !== -1 ? (row[capacityIndex] || '').trim() : ''
          const capacityNaValue = capacityNaIndex !== -1 ? toBool(row[capacityNaIndex]) : false
          const expiryDate = expiryIndex !== -1 ? normaliseDate(row[expiryIndex] || '') : ''
          const expiryNaValue = expiryNaIndex !== -1 ? toBool(row[expiryNaIndex]) : false
          const sortOrder = sortIndex !== -1 ? parseInt(row[sortIndex] || '0', 10) || 0 : 0
          const isActive = activeIndex !== -1 ? toBool(row[activeIndex]) : true

          const assetsRaw = assetsIndex !== -1 ? (row[assetsIndex] || '').trim() : ''
          const assetCodes = assetsRaw
            ? assetsRaw.split('|').map((part) => part.trim()).filter(Boolean)
            : []

          const assetIds = assetCodes
            .map((code) => assetMap[code.toLowerCase()] || assetMap[code])
            .filter(Boolean)

          if (assetCodes.length > 0 && assetIds.length === 0) {
            errors.push(`Row ${rowNumber}: assets "${assetsRaw}" not matched to asset IDs`)
            continue
          }

          rowsToCompare.push({
            rowNumber,
            inspectionTypeId,
            inspectionTypeLabel: inspectionTypeRaw,
            uniqueId,
            matchKey,
            description,
            capacity,
            capacity_na: capacityNaValue,
            expiry_date: expiryDate,
            expiry_na: expiryNaValue,
            assetIds,
            assetCodes,
            sort_order: sortOrder,
            is_active: isActive,
          })
        }

        if (errors.length > 0) {
          setImportErrors(errors)
        }

        if (rowsToCompare.length === 0) {
          setImportStatus('No valid rows found to import.')
          return
        }

        const uniqueTypeIds = Array.from(new Set(rowsToCompare.map((row) => row.inspectionTypeId)))

        const { data: existingTemplates, error: existingError } = await supabase
          .from('inspection_item_templates')
          .select(
            'id, inspection_type_id, unique_id, description, capacity, capacity_na, expiry_date, expiry_na, inspection_item_template_assets(asset_id)'
          )
          .in('inspection_type_id', uniqueTypeIds)

        if (existingError) {
          setImportStatus(`Error checking existing items: ${existingError.message}`)
          return
        }

        const existingMap = (existingTemplates || []).reduce((acc, item) => {
          const key = `${item.inspection_type_id}::${normaliseUniqueId(item.unique_id || '')}`
          acc[key] = item
          return acc
        }, {})

        const previewRows = []
        const insertRows = []

        rowsToCompare.forEach((row) => {
          const key = `${row.inspectionTypeId}::${row.matchKey}`
          const existing = existingMap[key]
          if (!existing) {
            insertRows.push(row)
            return
          }

          const existingAssets = (existing.inspection_item_template_assets || []).map((asset) => asset.asset_id)
          const existingAssetCodes = existingAssets
            .map((id) => assets.find((asset) => asset.id === id)?.asset_id || id)
            .filter(Boolean)

          previewRows.push({
            ...row,
            existing,
            existingAssetCodes,
            existingAssets,
          })
        })

        if (previewRows.length > 0) {
          setImportPreview(previewRows)
          setPendingImportRows(previewRows)
          setPendingInsertRows(insertRows)
          setOverwriteSelections(
            previewRows.reduce((acc, row) => {
              acc[row.rowNumber] = false
              return acc
            }, {})
          )
          setShowPreview(true)
          setImportStatus('Review duplicates before importing.')
          return
        }

        const insertedCount = await insertRowsFromCsv(insertRows)
        setImportStatus(`Import finished. ${insertedCount} row(s) inserted.`)
        await loadItems()
      } catch (error) {
        console.error('CSV import error:', error)
        setImportStatus('Error importing CSV file.')
      }
    }

    reader.onerror = () => {
      setImportStatus('Could not read the CSV file.')
    }

    reader.readAsText(importFile)
  }

  const insertRowsFromCsv = async (rows) => {
    let insertedCount = 0
    for (const row of rows) {
      const { data: inserted, error: insertError } = await supabase
        .from('inspection_item_templates')
        .insert({
          inspection_type_id: row.inspectionTypeId,
          name: row.description,
          unique_id: row.uniqueId,
          description: row.description,
          capacity: row.capacity_na ? null : row.capacity || null,
          capacity_na: row.capacity_na,
          expiry_date: row.expiry_na ? null : row.expiry_date || null,
          expiry_na: row.expiry_na,
          sort_order: row.sort_order || 0,
          is_active: row.is_active !== false,
        })
        .select()
        .single()

      if (insertError) {
        setImportErrors((prev) => [...prev, `Row ${row.rowNumber}: ${insertError.message}`])
        continue
      }

      if (row.assetIds.length > 0) {
        const links = row.assetIds.map((assetId) => ({
          template_id: inserted.id,
          asset_id: assetId,
        }))
        const { error: linkError } = await supabase
          .from('inspection_item_template_assets')
          .insert(links)

        if (linkError) {
          setImportErrors((prev) => [...prev, `Row ${row.rowNumber}: failed linking assets - ${linkError.message}`])
          continue
        }
      }

      insertedCount += 1
    }
    return insertedCount
  }

  const handleConfirmOverwrite = async () => {
    setImportStatus('Applying selected updates...')
    setShowPreview(false)

    const overwriteRows = pendingImportRows.filter((row) => overwriteSelections[row.rowNumber])
    const skippedRows = pendingImportRows.filter((row) => !overwriteSelections[row.rowNumber])

    if (overwriteRows.length === 0 && pendingInsertRows.length === 0) {
      setImportStatus('No rows selected for import.')
      return
    }

    let updatedCount = 0

    for (const row of overwriteRows) {
      const existing = row.existing
      const { error: updateError } = await supabase
        .from('inspection_item_templates')
        .update({
          unique_id: row.uniqueId,
          description: row.description,
          name: row.description,
          capacity: row.capacity_na ? null : row.capacity || null,
          capacity_na: row.capacity_na,
          expiry_date: row.expiry_na ? null : row.expiry_date || null,
          expiry_na: row.expiry_na,
          sort_order: row.sort_order || 0,
          is_active: row.is_active !== false,
        })
        .eq('id', existing.id)

      if (updateError) {
        setImportErrors((prev) => [...prev, `Row ${row.rowNumber}: ${updateError.message}`])
        continue
      }

      const { error: clearError } = await supabase
        .from('inspection_item_template_assets')
        .delete()
        .eq('template_id', existing.id)

      if (clearError) {
        setImportErrors((prev) => [...prev, `Row ${row.rowNumber}: failed clearing assets - ${clearError.message}`])
        continue
      }

      if (row.assetIds.length > 0) {
        const links = row.assetIds.map((assetId) => ({
          template_id: existing.id,
          asset_id: assetId,
        }))
        const { error: linkError } = await supabase
          .from('inspection_item_template_assets')
          .insert(links)

        if (linkError) {
          setImportErrors((prev) => [...prev, `Row ${row.rowNumber}: failed linking assets - ${linkError.message}`])
          continue
        }
      }

      updatedCount += 1
    }

    const insertedCount = await insertRowsFromCsv(pendingInsertRows)
    const skippedCount = skippedRows.length

    setImportStatus(
      `Import finished. ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped.`
    )
    await loadItems()
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
        Choose an asset and inspection type to filter results. Use the
        Associated Assets list when creating or editing items.
      </p>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '10px' }}>Bulk CSV Upload</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const sample = [
                'inspection_type,unique_id,description,capacity,capacity_na,expiry_date,expiry_na,assets,sort_order,is_active',
                'Annual Statutory Inspection,BX22 LB1,Anchor bolt check,25,false,31-12-2026,false,BX22|BX23,1,true',
              ].join('\n')
              const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = 'inspection-item-templates-template.csv'
              link.click()
              URL.revokeObjectURL(url)
            }}
          >
            Download CSV template
          </button>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
          <button type="button" className="btn btn-primary" onClick={handleImportCsv}>
            Import CSV
          </button>
          {importStatus && (
            <span style={{ color: '#555' }}>{importStatus}</span>
          )}
        </div>
        {importErrors.length > 0 && (
          <div style={{ marginTop: '10px', color: '#c53030' }}>
            <strong>Import issues:</strong>
            <ul>
              {importErrors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showPreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '960px',
              width: '95%',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Duplicate Items Found</h3>
            <p style={{ color: '#555' }}>
              Review the differences and choose which rows to overwrite. Unchecked rows will be skipped.
            </p>
            <div style={{ marginBottom: '10px', display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setOverwriteSelections((prev) =>
                    Object.keys(prev).reduce((acc, key) => {
                      acc[key] = true
                      return acc
                    }, {})
                  )
                }
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setOverwriteSelections((prev) =>
                    Object.keys(prev).reduce((acc, key) => {
                      acc[key] = false
                      return acc
                    }, {})
                  )
                }
              >
                Clear all
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Overwrite</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Item</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Description</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Capacity</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Expiry</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Assets</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((row) => (
                  <tr key={row.rowNumber} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="checkbox"
                        checked={overwriteSelections[row.rowNumber] || false}
                        onChange={() =>
                          setOverwriteSelections((prev) => ({
                            ...prev,
                            [row.rowNumber]: !prev[row.rowNumber],
                          }))
                        }
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontWeight: 600 }}>{row.uniqueId}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {row.inspectionTypeLabel || row.inspectionTypeId}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9aa0a6' }}>
                        Match key: {normaliseUniqueId(row.uniqueId)}
                      </div>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#777' }}>
                        Current: {row.existing.description || '-'}
                      </div>
                      <div>New: {row.description || '-'}</div>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#777' }}>
                        Current: {row.existing.capacity_na ? 'N/A' : row.existing.capacity || '-'}
                      </div>
                      <div>
                        New: {row.capacity_na ? 'N/A' : row.capacity || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#777' }}>
                        Current: {row.existing.expiry_na ? 'N/A' : row.existing.expiry_date || '-'}
                      </div>
                      <div>
                        New: {row.expiry_na ? 'N/A' : row.expiry_date || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#777' }}>
                        Current: {row.existingAssetCodes.length > 0 ? row.existingAssetCodes.join(', ') : 'None'}
                      </div>
                      <div>
                        New: {row.assetCodes.length > 0 ? row.assetCodes.join(', ') : 'None'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setShowPreview(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmOverwrite}
              >
                Apply Selected
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div className="form-group" style={{ minWidth: '220px' }}>
          <label htmlFor="asset-select">Asset Filter</label>
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
            <form onSubmit={handleAddItem} style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ margin: '0 0 6px' }}>New Inspection Item Creation</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ minWidth: '160px' }}>
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
                  <div className="form-group" style={{ flex: 1, minWidth: '200px', maxWidth: '320px' }}>
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
                  <div className="form-group" style={{ minWidth: '140px', maxWidth: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <label style={{ margin: 0 }}>Capacity</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
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
                    </div>
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
                  <div className="form-group" style={{ minWidth: '170px', maxWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <label style={{ margin: 0 }}>Expiry Date</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={expiryNa}
                          onChange={(e) => {
                            if (!allowInputForCurrentAsset()) return
                            const checked = e.target.checked
                            setExpiryNa(checked)
                            if (checked) {
                              setExpiryDate('')
                            }
                          }}
                        />
                        N/A
                      </label>
                    </div>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => {
                        if (!allowInputForCurrentAsset()) return
                        setExpiryDate(e.target.value)
                      }}
                      disabled={expiryNa}
                    />
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button type="submit" className="btn btn-primary">
                      {editingItemId ? 'Save Changes' : 'Add Item'}
                    </button>
                    {editingItemId && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                      onClick={() => {
                        setEditingItemId(null)
                        setUniqueId('')
                        setDescription('')
                        setCapacity('')
                        setCapacityNa(false)
                        setExpiryDate('')
                        setExpiryNa(false)
                      }}
                    >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-group" style={{ maxWidth: '520px', width: 'fit-content' }}>
                  <label>Associated Assets *</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setAssociatedAssetIds(assets.map((asset) => asset.id))}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setAssociatedAssetIds([])}
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      padding: '6px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                    }}
                  >
                    {assets.map((asset) => (
                      <label
                        key={asset.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 6px',
                          width: 'fit-content',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={associatedAssetIds.includes(asset.id)}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setAssociatedAssetIds((prev) => {
                              if (checked) return [...prev, asset.id]
                              return prev.filter((id) => id !== asset.id)
                            })
                          }}
                        />
                        {asset.asset_id}
                      </label>
                    ))}
                  </div>
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
                      <th style={{ textAlign: 'left', padding: '8px' }}>Expiry Date / N/A</th>
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
                        {item.expiry_na
                          ? 'N/A'
                          : item.expiry_date
                            ? new Date(item.expiry_date).toLocaleDateString('en-GB')
                            : ''}
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
                            setExpiryDate(item.expiry_date || '')
                            setExpiryNa(!!item.expiry_na)
                            setAssociatedAssetIds(item.associatedAssetIds || [])
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
