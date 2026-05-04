import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getOrCreateRegistry } from './LauncherRegistry';
import type { LauncherTool } from './LauncherRegistry';

interface Props {
  position?: 'bottom-right' | 'bottom-left';
  theme?: 'dark' | 'light';
}

const ManagedLauncherOrb: React.FC<Props> = ({ position = 'bottom-right', theme = 'dark' }) => {
  const [tools, setTools] = useState<LauncherTool[]>(() => getOrCreateRegistry().getTools());
  const [menuOpen, setMenuOpen] = useState(false);
  const orbIdRef = useRef(`ml-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => getOrCreateRegistry().subscribe(setTools), []);

  useEffect(() => {
    if (document.getElementById('__ml-styles__')) return;
    const s = document.createElement('style');
    s.id = '__ml-styles__';
    s.textContent = `
      @keyframes ml-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes ml-core { 0%,100% { transform: scale(1); opacity: .92; } 50% { transform: scale(1.06); opacity: 1; } }
      @keyframes ml-halo { 0%,100% { opacity: .85; } 50% { opacity: 1; } }
      @keyframes ml-in { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
      .ml-btn {
        position: relative; display: inline-flex; align-items: center; justify-content: center;
        background: transparent; border: 0; padding: 0; cursor: pointer; outline: none;
      }
      .ml-btn:focus-visible { box-shadow: 0 0 0 3px #6366f18c; border-radius: 50%; }
      .ml-orb {
        position: relative; width: 100%; height: 100%; border-radius: 50%;
        filter: drop-shadow(0 0 2px #6366f18c) drop-shadow(0 0 12px #6366f18c) drop-shadow(0 0 28px #6366f18c);
        transition: filter 220ms ease-out;
      }
      .ml-btn:hover .ml-orb {
        filter: drop-shadow(0 0 3px #6366f18c) drop-shadow(0 0 18px #6366f18c) drop-shadow(0 0 36px #6366f18c);
      }
      .ml-orb svg { display: block; width: 100%; height: 100%; }
      .ml-halo { animation: ml-halo 4s ease-in-out infinite; transform-origin: 50% 50%; }
      .ml-core-anim { transform-origin: 50% 50%; animation: ml-core 4s ease-in-out infinite; }
      .ml-cw  { transform-origin: 50% 50%; animation: ml-spin 18s linear infinite; }
      .ml-ccw { transform-origin: 50% 50%; animation: ml-spin 18s linear infinite reverse; }
      .ml-btn:hover .ml-cw, .ml-btn:hover .ml-ccw { animation-duration: 9s; }
      @media (prefers-reduced-motion: reduce) {
        .ml-halo, .ml-core-anim, .ml-cw, .ml-ccw { animation: none !important; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  const posStyle: React.CSSProperties =
    position === 'bottom-left' ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 };

  const isDark = theme === 'dark';
  const bg = isDark ? '#1a1a2e' : '#ffffff';
  const fg = isDark ? '#e0e0e0' : '#333';
  const borderColor = isDark ? '#2a2a4a' : '#ddd';

  const PX = 48;
  const id = orbIdRef.current;

  const handleClick = useCallback(() => {
    if (tools.length === 0) return;
    if (tools.length === 1) {
      tools[0].open();
    } else {
      setMenuOpen(v => !v);
    }
  }, [tools]);

  if (tools.length === 0) return null;

  const menuPos: React.CSSProperties =
    position === 'bottom-left' ? { bottom: PX + 12, left: 0 } : { bottom: PX + 12, right: 0 };

  return (
    <div style={{ position: 'fixed', ...posStyle, zIndex: 999999 }}>
      {menuOpen && tools.length > 1 && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setMenuOpen(false)} />
          <div style={{
            position: 'absolute', ...menuPos,
            background: bg, border: `1px solid ${borderColor}`,
            borderRadius: 12, padding: '6px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 24px #6366f122',
            display: 'flex', flexDirection: 'column', gap: 2, minWidth: 180,
            animation: 'ml-in 0.15s ease-out',
            fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.7,
              textTransform: 'uppercase', color: isDark ? '#5a6a9a' : '#999',
              padding: '4px 10px 6px',
            }}>Managed Platform</div>
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => { setMenuOpen(false); tool.open(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: 'transparent', border: 'none', borderRadius: 8,
                  cursor: 'pointer', color: fg, fontSize: 13, fontWeight: 500,
                  textAlign: 'left', fontFamily: 'inherit', transition: 'background 100ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#ffffff12' : '#00000008')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 18, lineHeight: 1, minWidth: 22 }}>{tool.icon}</span>
                {tool.label}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        className="ml-btn"
        aria-label={tools.length === 1 ? tools[0].label : 'Open Managed Platform tools'}
        title={tools.length === 1 ? tools[0].label : 'Managed Platform'}
        onClick={handleClick}
        style={{ width: PX, height: PX }}
      >
        <span className="ml-orb">
          <svg viewBox="0 0 100 100" width={PX} height={PX} aria-hidden>
            <defs>
              <radialGradient id={`${id}-c`} cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#6366f1" stopOpacity="1" />
                <stop offset="55%"  stopColor="#6366f1" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#0f0a2e" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${id}-i`} cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#e0e7ff" stopOpacity="0.95" />
                <stop offset="40%"  stopColor="#6366f1" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx="50" cy="50" r="48" fill={`url(#${id}-c)`} className="ml-halo" />

            <g className="ml-cw">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#8b5cf6" strokeOpacity="0.55" strokeWidth="0.5" />
              {Array.from({ length: 36 }).map((_, i) => {
                const a = (i * 10 * Math.PI) / 180;
                const r2 = i % 3 === 0 ? 44 : 43;
                return (
                  <line
                    key={i}
                    x1={50 + Math.cos(a) * 41} y1={50 + Math.sin(a) * 41}
                    x2={50 + Math.cos(a) * r2} y2={50 + Math.sin(a) * r2}
                    stroke="#8b5cf6" strokeOpacity={i % 3 === 0 ? 0.8 : 0.35} strokeWidth="0.8"
                  />
                );
              })}
            </g>

            <g className="ml-ccw">
              <circle cx="50" cy="50" r="36" fill="none" stroke="#8b5cf6" strokeOpacity="0.85"
                strokeWidth="1.4" strokeDasharray="42 30 18 36 24 32" strokeLinecap="round" />
            </g>

            <circle cx="50" cy="50" r="20" fill={`url(#${id}-i)`} className="ml-core-anim" />

            {/* 3×3 dot grid — "platform" identity mark */}
            {([ [-6,-6],[0,-6],[6,-6], [-6,0],[0,0],[6,0], [-6,6],[0,6],[6,6] ] as [number,number][]).map(([dx, dy], i) => (
              <circle key={i} cx={50 + dx} cy={50 + dy} r="1.3" fill="#e0e7ff" fillOpacity="0.7" />
            ))}
          </svg>
        </span>
      </button>
    </div>
  );
};

export default ManagedLauncherOrb;
