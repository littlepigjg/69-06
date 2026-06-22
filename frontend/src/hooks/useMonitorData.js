import { useEffect, useRef, useState, useCallback } from 'react'
import useWebSocket from './useWebSocket'

export default function useMonitorData({ onMessage } = {}) {
  const [services, setServices] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [dependencies, setDependencies] = useState([])
  const [topologyStats, setTopologyStats] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(true)

  const handlersRef = useRef({ onMessage })
  handlersRef.current = { onMessage }

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/services')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setServices(data)
      setLastUpdate(new Date().toISOString())
    } catch (e) {
      console.error('Fetch services error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMaintenance = useCallback(async () => {
    try {
      const res = await fetch('/api/maintenance')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMaintenance(data)
    } catch (e) {
      console.error('Fetch maintenance error:', e)
    }
  }, [])

  const fetchDependencies = useCallback(async () => {
    try {
      const res = await fetch('/api/topology/dependencies')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDependencies(data)
    } catch (e) {
      console.error('Fetch dependencies error:', e)
    }
  }, [])

  const fetchTopologyStats = useCallback(async () => {
    try {
      const res = await fetch('/api/topology/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTopologyStats(data)
    } catch (e) {
      console.error('Fetch topology stats error:', e)
    }
  }, [])

  const fetchFullTopology = useCallback(async () => {
    try {
      const res = await fetch('/api/topology/full')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setServices(data.services)
      setDependencies(data.dependencies)
      setTopologyStats(data.stats)
      setLastUpdate(new Date().toISOString())
      setLoading(false)
    } catch (e) {
      console.error('Fetch full topology error:', e)
      setLoading(false)
    }
  }, [])

  const ws = useWebSocket('/ws', {
    reconnect: true,
    minReconnectDelay: 1000,
    maxReconnectDelay: 10000
  })

  useEffect(() => {
    const unsub = ws.subscribe((event) => {
      if (event.type !== 'message') return
      const msg = event.data

      handlersRef.current.onMessage?.(msg)

      switch (msg.type) {
        case 'new_check':
        case 'status_change':
        case 'service_update':
        case 'service_deleted':
          fetchServices()
          fetchTopologyStats()
          break
        case 'maintenance_change':
          fetchServices()
          fetchMaintenance()
          break
        case 'topology_change':
          fetchDependencies()
          fetchTopologyStats()
          fetchServices()
          break
        default:
          fetchServices()
      }
    })
    return unsub
  }, [ws, fetchServices, fetchMaintenance, fetchDependencies, fetchTopologyStats])

  useEffect(() => {
    fetchFullTopology()
    fetchMaintenance()
    const timer = setInterval(() => {
      fetchServices()
      fetchMaintenance()
      fetchDependencies()
      fetchTopologyStats()
    }, 30000)
    return () => clearInterval(timer)
  }, [fetchFullTopology, fetchServices, fetchMaintenance, fetchDependencies, fetchTopologyStats])

  return {
    services,
    maintenance,
    dependencies,
    topologyStats,
    lastUpdate,
    loading,
    fetchServices,
    fetchMaintenance,
    fetchDependencies,
    fetchTopologyStats,
    fetchFullTopology,
    connectionState: ws.connectionState,
    isConnected: ws.isConnected,
    isConnecting: ws.isConnecting,
    wsReconnect: ws.reconnectNow
  }
}
