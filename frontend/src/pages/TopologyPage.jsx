import React, { useState } from 'react'
import { useApp } from '../App.jsx'
import TopologyGraph from '../components/TopologyGraph.jsx'
import ImpactAnalysisPanel from '../components/ImpactAnalysisPanel.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

export default function TopologyPage() {
  const { services, dependencies, topologyStats, isConnected, connectionState } = useApp()
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [showPanel, setShowPanel] = useState(true)

  const connBadge = {
    idle: { bg: '#f3f4f6', text: '#6b7280', label: '未连接' },
    connecting: { bg: '#dbeafe', text: '#2563eb', label: '连接中...' },
    reconnecting: { bg: '#fef3c7', text: '#92400e', label: '重连中...' },
    open: { bg: '#d1fae5', text: '#065f46', label: '实时已连接' },
    closed: { bg: '#fee2e2', text: '#991b1b', label: '连接已断开' }
  }[connectionState] || { bg: '#f3f4f6', text: '#6b7280', label: '未知' }

  const selectedService = selectedNodeId ? services.find(s => s.id === selectedNodeId) : null

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12
      }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>服务依赖拓扑</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            可视化展示服务依赖关系 · 故障自动传播标记
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
            background: connBadge.bg, color: connBadge.text,
            borderRadius: 999, fontSize: 13, fontWeight: 500
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isConnected ? '#10b981' : '#9ca3af',
              animation: !isConnected ? 'pulse 2s infinite' : 'none'
            }} />
            {connBadge.label}
          </div>

          {topologyStats && (
            <>
              <StatBadge label="服务节点" value={topologyStats.totalServices} color="#6366f1" />
              <StatBadge label="依赖边" value={topologyStats.totalDependencies} color="#0ea5e9" />
              {topologyStats.failedServices?.length > 0 && (
                <StatBadge label="故障服务" value={topologyStats.failedServices.length} color="#ef4444" />
              )}
              {topologyStats.affectedServices?.length > 0 && (
                <StatBadge label="受影响" value={topologyStats.affectedServices.length} color="#f97316" />
              )}
              {topologyStats.cycles > 0 && (
                <StatBadge label="循环依赖" value={topologyStats.cycles} color="#f59e0b" warn />
              )}
            </>
          )}
        </div>
      </div>

      {topologyStats?.cycles > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#92400e' }}>
              检测到 {topologyStats.cycles} 个循环依赖
            </div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
              循环依赖可能导致故障传播分析异常，请检查配置
            </div>
          </div>
          {topologyStats.cyclePaths?.slice(0, 3).map((cycle, i) => (
            <div key={i} style={{
              fontSize: 11, color: '#92400e',
              background: '#fef3c7', padding: '4px 8px', borderRadius: 4,
              fontFamily: 'monospace'
            }}>
              {cycle.map(id => {
                const s = services.find(svc => svc.id === id)
                return s?.name || id
              }).join(' → ')}
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: showPanel ? '1fr 380px' : '1fr',
        gap: 16,
        height: 'calc(100vh - 220px)',
        minHeight: 500
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {selectedService && (
            <div style={{
              position: 'absolute', top: 16, left: 16, zIndex: 10,
              background: 'rgba(255,255,255,0.95)', padding: '10px 14px',
              borderRadius: 10, border: '1px solid #e5e7eb',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <StatusBadge status={selectedService.summary?.status} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedService.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  点击其他节点切换 · 拖拽调整位置
                </div>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: '#9ca3af', fontSize: 16, padding: 4
                }}
              >✕</button>
            </div>
          )}

          <button
            onClick={() => setShowPanel(!showPanel)}
            style={{
              position: 'absolute', top: 16, left: selectedService ? 320 : 16,
              zIndex: 10, padding: '8px 12px',
              background: '#6366f1', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              display: selectedService ? 'none' : 'block'
            }}
          >
            {showPanel ? '隐藏' : '显示'}分析面板
          </button>

          <TopologyGraph
            services={services}
            dependencies={dependencies}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        {showPanel && (
          selectedNodeId ? (
            <ImpactAnalysisPanel
              serviceId={selectedNodeId}
              services={services}
              dependencies={dependencies}
              onClose={() => setShowPanel(false)}
            />
          ) : (
            <div style={{
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 20
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>依赖分析报告</h3>
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                  选择一个节点
                </div>
                <div style={{ fontSize: 12, maxWidth: 240 }}>
                  点击拓扑图中的任意服务节点，查看详细的依赖分析报告、影响范围和关键路径
                </div>
              </div>

              {topologyStats && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 10 }}>
                    拓扑概览
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <MiniStat label="根节点" value={topologyStats.rootNodes?.length || 0} />
                    <MiniStat label="叶子节点" value={topologyStats.leafNodes?.length || 0} />
                    <MiniStat label="故障服务" value={topologyStats.failedServices?.length || 0} color="#ef4444" />
                    <MiniStat label="受影响" value={topologyStats.affectedServices?.length || 0} color="#f97316" />
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function StatBadge({ label, value, color, warn }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', background: warn ? '#fef3c7' : '#fff',
      borderRadius: 10, border: warn ? '1px solid #fcd34d' : '1px solid #e5e7eb'
    }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <div>
        <div style={{ fontSize: 10, color: '#6b7280' }}>{label}</div>
        <div style={{ fontWeight: 700, color: warn ? '#92400e' : '#1f2937' }}>{value}</div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{
      padding: 10, background: '#f9fafb', borderRadius: 8, textAlign: 'center'
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || '#4f46e5' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>{label}</div>
    </div>
  )
}
