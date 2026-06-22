import React from 'react'

const DEFAULT_ITEMS = [
  { color: '#ef4444', label: '故障节点' },
  { color: '#f97316', label: '直接影响' },
  { color: '#fbbf24', label: '间接影响' },
  { color: '#10b981', label: '正常运行' },
  { color: '#f59e0b', label: '维护中' }
]

export default function TopologyLegend({ items = DEFAULT_ITEMS, position = 'bottom-left' }) {
  const positionStyles = {
    'top-right': { top: 16, right: 16 },
    'top-left': { top: 16, left: 16 },
    'bottom-right': { bottom: 16, right: 16 },
    'bottom-left': { bottom: 16, left: 16 }
  }

  return (
    <div style={{
      position: 'absolute',
      display: 'flex',
      gap: 16,
      background: 'rgba(255,255,255,0.9)',
      padding: '10px 14px',
      borderRadius: 10,
      fontSize: 12,
      border: '1px solid #e5e7eb',
      zIndex: 10,
      flexWrap: 'wrap',
      ...positionStyles[position]
    }}>
      {items.map((item, i) => (
        <LegendItem key={i} color={item.color} label={item.label} />
      ))}
    </div>
  )
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        flexShrink: 0
      }} />
      <span style={{ color: '#4b5563', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}
