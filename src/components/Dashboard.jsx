import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalAssets: 0,
    activeAssets: 0,
    overdueInspections: 0,
    dueSoonInspections: 0,
    expiredItems: 0,
    dueSoonItems: 0,
  })
  const [upcomingInspections, setUpcomingInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [selectedView, setSelectedView] = useState(null) // 'assets', 'active', 'overdue', 'dueSoon', 'expiredItems', 'dueSoonItems'
  const [filteredData, setFilteredData] = useState([])

  useEffect(() => {
    fetchDashboardData()
    fetchUserEmail()
  }, [])

  const fetchUserEmail = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserEmail(user.email)
    }
  }

  const fetchDashboardData = async () => {
    try {
      // Fetch asset stats
      const { data: assetData } = await supabase
        .from('asset_items')
        .select('id, status')

      const totalAssets = assetData?.length || 0
      const activeAssets = assetData?.filter(p => p.status === 'active').length || 0

      // Fetch inspection stats
      const today = new Date().toISOString().split('T')[0]
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const { data: overdueData } = await supabase
        .from('inspections')
        .select('id')
        .eq('status', 'pending')
        .lt('due_date', today)

      const { data: dueSoonData } = await supabase
        .from('inspections')
        .select('id')
        .eq('status', 'pending')
        .gte('due_date', today)
        .lte('due_date', thirtyDaysFromNow)

      const { data: expiredItemsData } = await supabase
        .from('inspection_item_templates')
        .select('id')
        .eq('expiry_na', false)
        .not('expiry_date', 'is', null)
        .lt('expiry_date', today)

      const { data: dueSoonItemsData } = await supabase
        .from('inspection_item_templates')
        .select('id')
        .eq('expiry_na', false)
        .not('expiry_date', 'is', null)
        .gte('expiry_date', today)
        .lte('expiry_date', thirtyDaysFromNow)

      // Fetch upcoming inspections with plant details
      const { data: upcomingData } = await supabase
        .from('inspections')
        .select(`
          id,
          due_date,
          status,
          asset_items (name, asset_id),
          inspection_types (name)
        `)
        .eq('status', 'pending')
        .gte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(10)

      setStats({
        totalAssets,
        activeAssets,
        overdueInspections: overdueData?.length || 0,
        dueSoonInspections: dueSoonData?.length || 0,
        expiredItems: expiredItemsData?.length || 0,
        dueSoonItems: dueSoonItemsData?.length || 0,
      })
      setUpcomingInspections(upcomingData || [])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCardClick = async (view) => {
    setSelectedView(view)
    
    try {
      switch(view) {
        case 'assets':
          const { data: allAssets } = await supabase
            .from('asset_items')
            .select('id, asset_id, name, status')
            .order('asset_id')
          setFilteredData(allAssets || [])
          break
          
        case 'active':
          const { data: activeAssets } = await supabase
            .from('asset_items')
            .select('id, asset_id, name, status')
            .eq('status', 'active')
            .order('asset_id')
          setFilteredData(activeAssets || [])
          break
          
        case 'overdue':
          const today = new Date().toISOString().split('T')[0]
          const { data: overdueInsp } = await supabase
            .from('inspections')
            .select(`
              id,
              due_date,
              status,
              asset_items (asset_id, name),
              inspection_types (name)
            `)
            .eq('status', 'pending')
            .lt('due_date', today)
            .order('due_date', { ascending: true })
          setFilteredData(overdueInsp || [])
          break
          
        case 'dueSoon':
          const todayDue = new Date().toISOString().split('T')[0]
          const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
          const { data: dueSoonInsp } = await supabase
            .from('inspections')
            .select(`
              id,
              due_date,
              status,
              asset_items (asset_id, name),
              inspection_types (name)
            `)
            .eq('status', 'pending')
            .gte('due_date', todayDue)
            .lte('due_date', thirtyDays)
            .order('due_date', { ascending: true })
          setFilteredData(dueSoonInsp || [])
          break
        case 'expiredItems':
          const todayItems = new Date().toISOString().split('T')[0]
          const { data: expiredItems } = await supabase
            .from('inspection_item_templates')
            .select('id, unique_id, description, expiry_date, expiry_na')
            .eq('expiry_na', false)
            .not('expiry_date', 'is', null)
            .lt('expiry_date', todayItems)
            .order('expiry_date', { ascending: true })
          setFilteredData(expiredItems || [])
          break
        case 'dueSoonItems':
          const todaySoonItems = new Date().toISOString().split('T')[0]
          const thirtyDaysItems = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
          const { data: dueSoonItems } = await supabase
            .from('inspection_item_templates')
            .select('id, unique_id, description, expiry_date, expiry_na')
            .eq('expiry_na', false)
            .not('expiry_date', 'is', null)
            .gte('expiry_date', todaySoonItems)
            .lte('expiry_date', thirtyDaysItems)
            .order('expiry_date', { ascending: true })
          setFilteredData(dueSoonItems || [])
          break
      }
    } catch (error) {
      console.error('Error fetching filtered data:', error)
    }
  }

  if (loading) {
    return <div>Loading dashboard...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <div style={{ fontSize: '0.9rem', color: '#666' }}>
          Logged in as: <strong>{userEmail}</strong>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '30px' }}>
        <div className="card" style={{ cursor: 'pointer', padding: '14px 16px' }} onClick={() => handleCardClick('assets')}>
          <h3 style={{ marginBottom: '8px', fontSize: '0.95rem' }}>Total Assets</h3>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{stats.totalAssets}</p>
        </div>
        <div className="card" style={{ cursor: 'pointer', padding: '14px 16px' }} onClick={() => handleCardClick('active')}>
          <h3 style={{ marginBottom: '8px', fontSize: '0.95rem' }}>Active Assets</h3>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{stats.activeAssets}</p>
        </div>
        <div className="card" style={{ cursor: 'pointer', padding: '14px 16px' }} onClick={() => handleCardClick('overdue')}>
          <h3 style={{ marginBottom: '8px', fontSize: '0.95rem' }}>Overdue Inspections</h3>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#f44336' }}>
            {stats.overdueInspections}
          </p>
        </div>
        <div className="card" style={{ cursor: 'pointer', padding: '14px 16px' }} onClick={() => handleCardClick('dueSoon')}>
          <h3 style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
            Inspection Due Soon<br />(30 Days)
          </h3>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#ff9800' }}>
            {stats.dueSoonInspections}
          </p>
        </div>
        <div className="card" style={{ cursor: 'pointer', padding: '14px 16px' }} onClick={() => handleCardClick('expiredItems')}>
          <h3 style={{ marginBottom: '8px', fontSize: '0.95rem' }}>Expired Items</h3>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#f44336' }}>
            {stats.expiredItems}
          </p>
        </div>
        <div className="card" style={{ cursor: 'pointer', padding: '14px 16px' }} onClick={() => handleCardClick('dueSoonItems')}>
          <h3 style={{ marginBottom: '8px', fontSize: '0.95rem' }}>
            Items Due Soon<br />(30 Days)
          </h3>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#ff9800' }}>
            {stats.dueSoonItems}
          </p>
        </div>
      </div>

      {selectedView && (
        <div className="card" style={{ marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>
              {selectedView === 'assets' && 'All Assets'}
              {selectedView === 'active' && 'Active Assets'}
              {selectedView === 'overdue' && 'Overdue Inspections'}
              {selectedView === 'dueSoon' && 'Inspections Due Soon'}
              {selectedView === 'expiredItems' && 'Expired Items'}
              {selectedView === 'dueSoonItems' && 'Items Due Soon'}
            </h3>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '5px 15px', fontSize: '0.85rem' }}
              onClick={() => setSelectedView(null)}
            >
              Close
            </button>
          </div>
          
          {filteredData.length === 0 ? (
            <p>No data found.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  {(selectedView === 'assets' || selectedView === 'active') ? (
                    <>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Asset ID</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Asset Name</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
                    </>
                  ) : (selectedView === 'expiredItems' || selectedView === 'dueSoonItems') ? (
                    <>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Unique ID</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Expiry Date</th>
                    </>
                  ) : (
                    <>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Asset ID</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Asset Name</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Inspection Type</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Due Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                    {(selectedView === 'assets' || selectedView === 'active') ? (
                      <>
                        <td style={{ padding: '10px' }}>{item.asset_id}</td>
                        <td style={{ padding: '10px' }}>{item.name}</td>
                        <td style={{ padding: '10px' }}>
                          <span className={`status-badge ${item.status === 'active' ? 'status-compliant' : 'status-overdue'}`}>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                      </>
                    ) : (selectedView === 'expiredItems' || selectedView === 'dueSoonItems') ? (
                      <>
                        <td style={{ padding: '10px' }}>{item.unique_id || ''}</td>
                        <td style={{ padding: '10px' }}>{item.description || ''}</td>
                        <td style={{ padding: '10px' }}>
                          {item.expiry_date
                            ? new Date(item.expiry_date).toLocaleDateString('en-GB')
                            : ''}
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '10px' }}>{item.asset_items?.asset_id}</td>
                        <td style={{ padding: '10px' }}>{item.asset_items?.name}</td>
                        <td style={{ padding: '10px' }}>{item.inspection_types?.name}</td>
                        <td style={{ padding: '10px' }}>
                          {new Date(item.due_date).toLocaleDateString()}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '15px' }}>Upcoming Inspections</h3>
        {upcomingInspections.length === 0 ? (
          <p>No upcoming inspections found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>Asset ID</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Asset Name</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Inspection Type</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {upcomingInspections.map((inspection) => (
                <tr key={inspection.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{inspection.asset_items?.asset_id}</td>
                  <td style={{ padding: '10px' }}>{inspection.asset_items?.name}</td>
                  <td style={{ padding: '10px' }}>{inspection.inspection_types?.name}</td>
                  <td style={{ padding: '10px' }}>
                    {new Date(inspection.due_date).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '40px', padding: '20px', color: '#999', fontSize: '0.85rem', borderTop: '1px solid #eee' }}>
        Version 2.0
      </div>
    </div>
  )
}
