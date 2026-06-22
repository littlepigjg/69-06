import React from 'react'

export default function TopologyControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  onRelayout,
  onReset,
  onFreeze,
  onUnfreeze,
  isFrozen = false,
  position = 'top-right'
}) {
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
      flexDirection: 'column',
      gap: 6,
      zIndex: 10,
      ...positionStyles[position]
    }}>
      <ControlButton onClick={onZoomIn} title="放大">＋</ControlButton>
      <ControlButton onClick={onZoomOut} title="缩小">－</ControlButton>
      <ControlButton onClick={onResetView} title="重置视图">⌂</ControlButton>
      <ControlButton onClick={onRelayout} title="重新布局">↻</ControlButton>
      {onReset && <ControlButton onClick={onReset} title="重置所有位置">⟲</ControlButton>}
      {onFreeze && onUnfreeze && (
        <ControlButton
          onClick={isFrozen ? onUnfreeze : onFreeze}
          title={isFrozen ? '解锁布局' : '锁定布局'}
        >
          {isFrozen ? '🔓' : '🔒'}
        </ControlButton>
      )}
    </div>
  )
}

function ControlButton({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: '#fff',
        border: '1px solid #e5e7eb',
        cursor: 'pointer',
        fontSize: 16,
        fontWeight: 600,
        color: '#4b5563',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s'
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
    >
      {children}
    </button>
  )
}
