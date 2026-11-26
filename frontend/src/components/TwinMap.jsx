import { useState, useMemo } from 'react'
import { X, FileText, FolderOpen, BookOpen, Clock, Euro, Table2, User, HelpCircle } from 'lucide-react'

// ── Icône par type de document ────────────────────────────────────────────────
function DocIcon({ type, size = 13, color = '#64748b' }) {
  const props = { size, color }
  if (type === 'Relevé de temps')   return <Clock {...props} />
  if (type === 'Rapport technique') return <BookOpen {...props} />
  if (type === 'Fiche projet')      return <FolderOpen {...props} />
  if (type === 'Tableau financier') return <Table2 {...props} />
  if (type === 'Bulletin de paie' || type === 'Fiche personnel') return <User {...props} />
  if (type === 'Facture')           return <Euro {...props} />
  if (type === 'Contrat')           return <FileText {...props} />
  if (type === 'Type inconnu')      return <HelpCircle {...props} />
  return <FileText {...props} />
}

// ── Layout : positions des nœuds ─────────────────────────────────────────────
// Centre fixe + satellites en ellipse autour
function computeLayout(noeuds, W, H) {
  const positions = {}
  const projetNode = noeuds.find(n => n.type === 'projet')
  if (!projetNode) return positions

  const cx = W / 2
  const cy = H / 2
  positions[projetNode.id] = { x: cx, y: cy }

  const satellites = noeuds.filter(n => n.type !== 'projet')
  const count = satellites.length
  if (count === 0) return positions

  // Ellipse autour du centre
  const rx = W * 0.40
  const ry = H * 0.38
  const startAngle = -Math.PI / 2 // commencer en haut

  satellites.forEach((n, i) => {
    const angle = startAngle + (2 * Math.PI * i) / count
    positions[n.id] = {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    }
  })

  return positions
}

// ── Nœud document ────────────────────────────────────────────────────────────
const NODE_W = 165
const NODE_H = 54
const CENTER_W = 155
const CENTER_H = 58

function NodeDoc({ node, pos, isSelected, onClick }) {
  const x = pos.x - NODE_W / 2
  const y = pos.y - NODE_H / 2
  const isOk = node.statut === 'ok'

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Ombre */}
      <rect x={x + 2} y={y + 2} width={NODE_W} height={NODE_H} rx={8} fill="rgba(0,0,0,0.07)" />
      {/* Fond */}
      <rect
        x={x} y={y} width={NODE_W} height={NODE_H} rx={8}
        fill="white"
        stroke={isSelected ? '#3b82f6' : '#e2e8f0'}
        strokeWidth={isSelected ? 2 : 1}
      />
      {/* Barre de statut gauche */}
      <rect x={x} y={y + 8} width={3} height={NODE_H - 16} rx={1.5}
        fill={isOk ? '#34d399' : '#fbbf24'} />

      {/* Icône */}
      <foreignObject x={x + 10} y={y + 10} width={16} height={16}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:16, height:16 }}>
          <DocIcon type={node.sublabel} size={13} color={isSelected ? '#3b82f6' : '#64748b'} />
        </div>
      </foreignObject>

      {/* Nom fichier */}
      <text
        x={x + 32} y={y + 22}
        fontSize={10} fontWeight="600"
        fill={isSelected ? '#1d4ed8' : '#1e293b'}
        fontFamily="system-ui, sans-serif"
      >
        {node.label.length > 22 ? node.label.slice(0, 21) + '…' : node.label}
      </text>
      {/* Sous-titre type */}
      <text
        x={x + 32} y={y + 36}
        fontSize={9} fill="#94a3b8"
        fontFamily="system-ui, sans-serif"
      >
        {node.sublabel}
      </text>
    </g>
  )
}

// ── Nœud central ─────────────────────────────────────────────────────────────
function NodeCenter({ node, pos, isSelected, onClick }) {
  const x = pos.x - CENTER_W / 2
  const y = pos.y - CENTER_H / 2

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect x={x + 2} y={y + 2} width={CENTER_W} height={CENTER_H} rx={10} fill="rgba(0,0,0,0.12)" />
      <rect
        x={x} y={y} width={CENTER_W} height={CENTER_H} rx={10}
        fill="#1e3a5f"
        stroke={isSelected ? '#60a5fa' : '#1e3a5f'}
        strokeWidth={isSelected ? 2.5 : 1}
      />
      {/* Icône */}
      <foreignObject x={x + 12} y={y + 12} width={18} height={18}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:18, height:18 }}>
          <FolderOpen size={14} color="#93c5fd" />
        </div>
      </foreignObject>
      <text
        x={x + 36} y={y + 24}
        fontSize={12} fontWeight="700" fill="white"
        fontFamily="system-ui, sans-serif"
      >
        {node.label.length > 17 ? node.label.slice(0, 16) + '…' : node.label}
      </text>
      <text
        x={x + 36} y={y + 38}
        fontSize={9.5} fill="#93c5fd"
        fontFamily="system-ui, sans-serif"
      >
        {node.sublabel}
      </text>
    </g>
  )
}

// ── Lien SVG avec étiquette ───────────────────────────────────────────────────
function EdgeLine({ from, to, label, lateral, positions }) {
  const pFrom = positions[from]
  const pTo   = positions[to]
  if (!pFrom || !pTo) return null

  // Pour les liens vers le centre : placer le label à 35% du chemin depuis le doc (pas au milieu)
  // Pour les liens latéraux : placer au milieu
  const t  = lateral ? 0.5 : 0.32
  const lx = pFrom.x + (pTo.x - pFrom.x) * t
  const ly = pFrom.y + (pTo.y - pFrom.y) * t

  const color   = lateral ? '#6366f1' : '#64748b'
  const dashes  = lateral ? '5 3' : 'none'
  const width   = lateral ? 1.2 : 1.4
  const opacity = lateral ? 0.65 : 0.55

  // Couper le label en lignes (séparateur \n)
  const lines = label ? label.split('\n').filter(Boolean) : []
  const maxLen = lines.length > 0 ? Math.max(...lines.map(l => l.length)) : 0
  const boxW   = Math.min(Math.max(maxLen * 5.2 + 14, 56), 140)
  const boxH   = lines.length > 1 ? 28 : 17

  return (
    <g>
      <line
        x1={pFrom.x} y1={pFrom.y}
        x2={pTo.x}   y2={pTo.y}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashes}
        opacity={opacity}
      />
      {lines.length > 0 && (
        <g>
          <rect
            x={lx - boxW / 2} y={ly - boxH / 2}
            width={boxW} height={boxH}
            rx={4} fill="white"
            stroke={lateral ? '#c7d2fe' : '#cbd5e1'}
            strokeWidth={0.8}
            opacity={0.97}
          />
          {lines.map((line, i) => (
            <text
              key={i}
              x={lx}
              y={ly - boxH / 2 + 11 + i * 13}
              textAnchor="middle"
              fontSize={7.5}
              fill={lateral ? '#4f46e5' : '#475569'}
              fontFamily="system-ui, sans-serif"
              fontWeight={lateral ? '500' : '500'}
            >
              {line.length > 24 ? line.slice(0, 23) + '…' : line}
            </text>
          ))}
        </g>
      )}
    </g>
  )
}

// ── Panneau détail nœud sélectionné ──────────────────────────────────────────
function DetailPanel({ node, onClose }) {
  if (!node) return null

  const entries = Object.entries(node.entites || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')

  return (
    <div className="absolute top-4 right-4 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DocIcon type={node.sublabel} size={14} color="#3b82f6" />
          <span className="text-gray-800 font-semibold text-sm truncate max-w-[180px]">{node.label}</span>
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-600 shrink-0 ml-2">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Type</span>
          <span className="text-gray-700 font-medium text-right">{node.sublabel}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Rôle</span>
          <span className="text-gray-700 font-medium text-right">{node.roleLabel || '—'}</span>
        </div>
        {node.statut && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Statut</span>
            <span className={`font-medium ${node.statut === 'ok' ? 'text-green-500' : node.statut === 'central' ? 'text-blue-500' : 'text-yellow-500'}`}>
              {node.statut === 'ok' ? '✓ Validé' : node.statut === 'central' ? 'Nœud central' : '⚠ À vérifier'}
            </span>
          </div>
        )}
        {node.score > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Score</span>
            <span className="text-gray-700 font-medium">{node.score}%</span>
          </div>
        )}
        {node.fields_summary && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-gray-400 mb-1">Contenu extrait</p>
            <p className="text-gray-600 leading-relaxed">{node.fields_summary}</p>
          </div>
        )}
        {entries.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
            <p className="text-gray-400 mb-1">Entités extraites</p>
            {entries.slice(0, 8).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-400 shrink-0 w-24 truncate">{k.replace(/_/g, ' ')}</span>
                <span className="text-gray-700 truncate">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {node.sources?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-gray-400 mb-1">Fichier source</p>
            {node.sources.map(s => (
              <div key={s} className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs mt-1 truncate">{s}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function TwinMap({ jumeau, alertes = [] }) {
  const [selected, setSelected] = useState(null)

  const W = 1000, H = 560

  const positions = useMemo(() => {
    if (!jumeau?.noeuds) return {}
    return computeLayout(jumeau.noeuds, W, H)
  }, [jumeau])

  if (!jumeau || !jumeau.noeuds || jumeau.noeuds.length === 0) {
    return (
      <div className="bg-white border border-white/10 rounded-2xl px-6 py-10 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-[#00b4d8]/10 flex items-center justify-center">
          <FolderOpen size={20} className="text-[#00b4d8]" />
        </div>
        <p className="text-gray-400 text-sm">Le jumeau documentaire sera construit automatiquement après l'analyse des documents.</p>
      </div>
    )
  }

  const { noeuds, liens } = jumeau

  // Séparer liens vers centre et liens latéraux pour l'ordre de rendu
  const liensVersCenter = liens.filter(l => !l.lateral)
  const liensLateraux   = liens.filter(l => l.lateral)

  return (
    <div className="bg-[#f8fafc] border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
          </svg>
        </div>
        <div>
          <p className="text-gray-800 font-semibold text-sm">Carte des preuves reliées</p>
          <p className="text-gray-400 text-xs">Cliquez sur un nœud pour voir son rôle, son statut et ses sources</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-px bg-slate-300 inline-block" />
            Lien vers le projet
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-px border-t-2 border-dashed border-indigo-400 inline-block" />
            Lien transversal
          </span>
        </div>
      </div>

      {/* SVG */}
      <div className="relative bg-[#f8fafc]">
        <svg width="100%" viewBox={`-20 -20 ${W + 40} ${H + 40}`} className="overflow-visible">

          {/* Lignes vers le centre en premier (en dessous) */}
          {liensVersCenter.map((l, i) => (
            <EdgeLine key={`c-${i}`} from={l.from} to={l.to} label={l.label} lateral={false} positions={positions} />
          ))}

          {/* Liens latéraux */}
          {liensLateraux.map((l, i) => (
            <EdgeLine key={`l-${i}`} from={l.from} to={l.to} label={l.label} lateral={true} positions={positions} />
          ))}

          {/* Nœuds */}
          {noeuds.map(node => {
            const pos = positions[node.id]
            if (!pos) return null
            const isSelected = selected?.id === node.id

            if (node.type === 'projet') {
              return (
                <NodeCenter
                  key={node.id}
                  node={node}
                  pos={pos}
                  isSelected={isSelected}
                  onClick={() => setSelected(isSelected ? null : node)}
                />
              )
            }
            return (
              <NodeDoc
                key={node.id}
                node={node}
                pos={pos}
                isSelected={isSelected}
                onClick={() => setSelected(isSelected ? null : node)}
              />
            )
          })}
        </svg>

        {/* Panneau détail */}
        <DetailPanel node={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  )
}
