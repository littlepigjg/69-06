import React, { useState, useEffect } from 'react'
import StatusBadge from './StatusBadge'
import { formatRelativeTime } from '../lib/utils'

export default function ImpactAnalysisPanel({
  serviceId,
  services,
  dependencies,
  onClose
}) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)

  const service = services.find(s => s.id === serviceId)

  useEffect(() => {
    if (!serviceId) return
    setLoading(true)
    fetch(`/api/topology/services/${serviceId}/impact`)
      .then(r => r.json())
      .then(data => {
        setAnalysis(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [serviceId, dependencies])

  if (!service) return null

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      height: '100%',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>依赖分析报告</h3>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 18, color: '#9ca3af', padding: 4
            }}
          >✕</button>
        )}
      </div>

      <div style={{ padding: 20, flex: 1, overflow: 'auto' }}>
        <div style={{
          background: '#f9fafb', padding: 16, borderRadius: 10, marginBottom: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <StatusBadge status={service.summary?.status} size="md" />
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{service.name}</h4>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
            {service.type.toUpperCase()} · {service.target}
            {service.type === 'tcp' && service.port ? `:${service.port}` : ''}
          </div>
          {service.summary?.lastCheck && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
              上次检测: {formatRelativeTime(service.summary.lastCheck)}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>分析中...</div>
        ) : analysis ? (
          <>
            <Section title="影响范围统计">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
                <StatCard
                  label="直接下游"
                  value={analysis.directDownstream.length}
                  color="#2563eb"
                  bg="#dbeafe"
                />
                <StatCard
                  label="直接上游"
                  value={analysis.directUpstream.length}
                  color="#7c3aed"
                  bg="#ede9fe"
                />
                <StatCard
                  label="直接影响"
                  value={analysis.directAffected.length}
                  color="#ea580c"
                  bg="#ffedd5"
                />
                <StatCard
                  label="间接影响"
                  value={analysis.indirectAffected.length}
                  color="#ca8a04"
                  bg="#fef9c3"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCard
                  label="总受影响"
                  value={analysis.allAffected.length}
                  color="#dc2626"
                  bg="#fee2e2"
                  large
                />
                <StatCard
                  label="最大传播深度"
                  value={analysis.maxImpactDepth}
                  color="#0891b2"
                  bg="#cffafe"
                  large
                />
              </div>
            </Section>

            {analysis.directUpstream.length > 0 && (
              <Section title={`直接上游依赖 (${analysis.directUpstream.length})`}>
                <ServiceList services={analysis.directUpstream} />
              </Section>
            )}

            {analysis.directDownstream.length > 0 && (
              <Section title={`直接下游依赖 (${analysis.directDownstream.length})`} tint="#fef2f2">
                <ServiceList services={analysis.directDownstream} />
              </Section>
            )}

            {analysis.allAffected.length > 0 && (
              <Section title={`故障影响传播 (${analysis.allAffected.length})`} tint="#fff7ed">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {analysis.allAffected.map(s => {
                    const lvl = analysis.affectedLevels[s.id] || 1
                    return (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8,
                        background: lvl === 1 ? '#fff7ed' : lvl === 2 ? '#fefce8' : '#f9fafb',
                        border: `1px solid ${lvl === 1 ? '#fed7aa' : lvl === 2 ? '#fde68a' : '#e5e7eb'}`
                      }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: lvl === 1 ? '#ea580c' : lvl === 2 ? '#ca8a04' : '#6b7280',
                          color: '#fff'
                        }}>L{lvl}</span>
                        <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>{s.name}</span>
                        <StatusBadge status={s.summary?.status} />
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {analysis.criticalPaths && analysis.criticalPaths.length > 0 && (
              <Section title="关键依赖路径" tint="#eff6ff">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {analysis.criticalPaths.slice(0, 5).map((path, idx) => (
                    <div key={idx} style={{
                      padding: 12, background: '#fff', borderRadius: 8,
                      border: '1px solid #dbeafe'
                    }}>
                      <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, marginBottom: 8 }}>
                        路径 #{idx + 1} ({path.length} 个节点)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        {path.map((s, i) => (
                          <React.Fragment key={s.id}>
                            <span style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 12,
                              background: i === 0 ? '#6366f1' : i === path.length - 1 ? '#10b981' : '#f3f4f6',
                              color: i === 0 || i === path.length - 1 ? '#fff' : '#374151',
                              fontWeight: 500
                            }}>{s.name}</span>
                            {i < path.length - 1 && (
                              <span style={{ color: '#9ca3af', fontSize: 14 }}>→</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            暂无分析数据
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children, tint }) {
  return (
    <div style={{
      marginBottom: 20,
      padding: tint ? 14 : 0,
      background: tint || 'transparent',
      borderRadius: tint ? 10 : 0
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700, color: '#374151',
        marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5
      }}>{title}</div>
      {children}
    </div>
  )
}

function StatCard({ label, value, color, bg, large }) {
  return (
    <div style={{
      padding: 12, background: bg, borderRadius: 8, textAlign: 'center'
    }}>
      <div style={{
        fontSize: large ? 28 : 22, fontWeight: 800, color
      }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function ServiceList({ services }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {services.map(s => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', background: '#fff',
          borderRadius: 6, border: '1px solid #e5e7eb',
          fontSize: 12
        }}>
          <StatusBadge status={s.summary?.status} />
          <span style={{ fontWeight: 500 }}>{s.name}</span>
        </div>
      ))}
    </div>
  )
}
