import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalAssets: 0,
    activeAssets: 0,
    overdueInspections: 0,
    dueSoonInspections: 0,
  })
  const [upcomingInspections, setUpcomingInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [selectedView, setSelectedView] = useState(null) // 'assets', 'active', 'overdue', 'dueSoon'
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick('assets')}>
          <h3 style={{ marginBottom: '10px' }}>Total Assets</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.totalAssets}</p>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick('active')}>
          <h3 style={{ marginBottom: '10px' }}>Active Assets</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.activeAssets}</p>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick('overdue')}>
          <h3 style={{ marginBottom: '10px' }}>Overdue Inspections</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f44336' }}>
            {stats.overdueInspections}
          </p>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick('dueSoon')}>
          <h3 style={{ marginBottom: '10px' }}>Due Soon (30 days)</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ff9800' }}>
            {stats.dueSoonInspections}
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
