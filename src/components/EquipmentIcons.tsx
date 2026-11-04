// SPDX-License-Identifier: Apache-2.0
// Custom equipment SVG icons for ATLAS fire safety app

export function WaterTankIcon({ color = '#3b82f6' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="10" y="5" width="20" height="28" rx="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <path d="M10 8 Q10 5 13 5 H27 Q30 5 30 8" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <rect x="14" y="12" width="12" height="3" rx="1" fill={color} opacity="0.4"/>
      <rect x="14" y="18" width="12" height="3" rx="1" fill={color} opacity="0.3"/>
      <path d="M20 28 L17 33 H23 Z" fill={color} opacity="0.5"/>
      <circle cx="20" cy="16" r="2" fill={color} opacity="0.6"/>
      <line x1="20" y1="2" x2="20" y2="5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="20" cy="2" r="1.5" fill={color}/>
    </svg>
  )
}

export function PumpIcon({ color = '#dc2626' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="22" y="12" width="14" height="10" rx="2" fill={color} opacity="0.3" stroke={color} strokeWidth="1.2"/>
      <circle cx="14" cy="17" r="7" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <circle cx="14" cy="17" r="3" fill={color} opacity="0.4"/>
      <line x1="7" y1="17" x2="3" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="24" x2="14" y2="30" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="11" y1="30" x2="17" y2="30" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="24" y="14" width="4" height="3" rx="0.5" fill={color} opacity="0.5"/>
      <rect x="30" y="14" width="4" height="3" rx="0.5" fill={color} opacity="0.3"/>
    </svg>
  )
}

export function JockeyPumpIcon({ color = '#b91c1c' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="22" y="14" width="12" height="8" rx="2" fill={color} opacity="0.3" stroke={color} strokeWidth="1.2"/>
      <circle cx="14" cy="18" r="6" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <circle cx="14" cy="18" r="2.5" fill={color} opacity="0.5"/>
      <line x1="8" y1="18" x2="4" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="14" y1="24" x2="14" y2="30" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="24" y="16" width="3" height="4" rx="0.5" fill={color} opacity="0.4"/>
      <path d="M30 14 L34 10" stroke={color} strokeWidth="1" strokeLinecap="round" strokeDasharray="1 1"/>
      <circle cx="34" cy="9" r="1" fill={color} opacity="0.5"/>
    </svg>
  )
}

export function FoamTankIcon({ color = '#eab308' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="10" y="5" width="20" height="28" rx="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <path d="M13 12 Q16 8 20 12 Q24 16 27 12" stroke={color} strokeWidth="1" fill="none" opacity="0.5"/>
      <path d="M13 17 Q16 13 20 17 Q24 21 27 17" stroke={color} strokeWidth="1" fill="none" opacity="0.4"/>
      <circle cx="16" cy="24" r="2" fill={color} opacity="0.3"/>
      <circle cx="22" cy="22" r="1.5" fill={color} opacity="0.25"/>
      <circle cx="19" cy="27" r="1" fill={color} opacity="0.2"/>
      <text x="20" y="37" textAnchor="middle" fill={color} fontSize="5" fontWeight="bold" opacity="0.6">FOAM</text>
    </svg>
  )
}

export function OilTankIcon({ color = '#f59e0b' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="10" y="5" width="20" height="28" rx="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <ellipse cx="20" cy="18" rx="6" ry="4" fill={color} opacity="0.3"/>
      <path d="M20 14 C20 14 23 16 23 18 C23 20 20 22 20 22 C20 22 17 20 17 18 C17 16 20 14 20 14Z" fill={color} opacity="0.5"/>
      <line x1="20" y1="33" x2="20" y2="37" stroke={color} strokeWidth="1.5"/>
      <line x1="16" y1="37" x2="24" y2="37" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function ManifoldIcon({ color = '#8b5cf6' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="5" y1="20" x2="35" y2="20" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="12" y1="10" x2="12" y2="30" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="20" y1="10" x2="20" y2="30" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="28" y1="10" x2="28" y2="30" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="20" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <circle cx="20" cy="20" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <circle cx="28" cy="20" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <circle cx="12" cy="10" r="1.5" fill={color} opacity="0.5"/>
      <circle cx="20" cy="10" r="1.5" fill={color} opacity="0.5"/>
      <circle cx="28" cy="10" r="1.5" fill={color} opacity="0.5"/>
    </svg>
  )
}

export function TurbineIcon({ color = '#7c3aed' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path d="M8 32 H32 V20 L20 8 L8 20 Z" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      <line x1="8" y1="32" x2="32" y2="32" stroke={color} strokeWidth="1.5"/>
      <line x1="8" y1="20" x2="20" y2="8" stroke={color} strokeWidth="1"/>
      <line x1="32" y1="20" x2="20" y2="8" stroke={color} strokeWidth="1"/>
      <rect x="16" y="12" width="8" height="12" rx="1" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <line x1="18" y1="15" x2="22" y2="15" stroke={color} strokeWidth="0.8" opacity="0.5"/>
      <line x1="18" y1="18" x2="22" y2="18" stroke={color} strokeWidth="0.8" opacity="0.5"/>
      <line x1="18" y1="21" x2="22" y2="21" stroke={color} strokeWidth="0.8" opacity="0.5"/>
    </svg>
  )
}

export function ControlBuildingIcon({ color = '#10b981' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="6" y="10" width="28" height="22" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      <rect x="10" y="14" width="6" height="4" rx="0.5" fill={color} opacity="0.3" stroke={color} strokeWidth="0.8"/>
      <rect x="18" y="14" width="6" height="4" rx="0.5" fill={color} opacity="0.3" stroke={color} strokeWidth="0.8"/>
      <rect x="26" y="14" width="4" height="4" rx="0.5" fill={color} opacity="0.2" stroke={color} strokeWidth="0.8"/>
      <rect x="10" y="21" width="6" height="4" rx="0.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.8"/>
      <rect x="18" y="21" width="6" height="4" rx="0.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.8"/>
      <text x="20" y="8" textAnchor="middle" fill={color} fontSize="5" fontWeight="bold">PLC</text>
      <line x1="12" y1="6" x2="12" y2="10" stroke={color} strokeWidth="1"/>
      <circle cx="12" cy="5" r="1" fill={color}/>
    </svg>
  )
}

export function BundwallIcon({ color = '#a16207' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="4" y="4" width="32" height="32" rx="2" fill={color} opacity="0.08" stroke={color} strokeWidth="1.5" strokeDasharray="3 1"/>
      <rect x="8" y="8" width="24" height="24" rx="2" fill={color} opacity="0.15" stroke={color} strokeWidth="2"/>
      <line x1="8" y1="12" x2="32" y2="12" stroke={color} strokeWidth="1" opacity="0.3"/>
      <line x1="8" y1="28" x2="32" y2="28" stroke={color} strokeWidth="1" opacity="0.3"/>
      <line x1="12" y1="8" x2="12" y2="32" stroke={color} strokeWidth="1" opacity="0.3"/>
      <line x1="28" y1="8" x2="28" y2="32" stroke={color} strokeWidth="1" opacity="0.3"/>
    </svg>
  )
}

export function UndergroundTankIcon({ color = '#78716c' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="2" y1="16" x2="38" y2="16" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.5"/>
      <rect x="8" y="18" width="24" height="14" rx="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <path d="M8 21 Q8 18 11 18 H29 Q32 18 32 21" fill={color} opacity="0.2" stroke={color} strokeWidth="0.8"/>
      <circle cx="20" cy="25" r="3" fill={color} opacity="0.3" stroke={color} strokeWidth="0.8"/>
      <path d="M18 25 L20 23 L22 25" stroke={color} strokeWidth="0.8" fill="none"/>
      <line x1="20" y1="16" x2="20" y2="18" stroke={color} strokeWidth="1.5"/>
      <rect x="16" y="13" width="8" height="3" rx="1" fill={color} opacity="0.3"/>
    </svg>
  )
}

export function ContaminationTankIcon({ color = '#b45309' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="2" y1="12" x2="38" y2="12" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.4"/>
      <rect x="7" y="14" width="26" height="18" rx="2" fill={color} opacity="0.12" stroke={color} strokeWidth="1.5"/>
      <rect x="11" y="17" width="18" height="12" rx="1" fill={color} opacity="0.08" stroke={color} strokeWidth="0.8" strokeDasharray="3 2"/>
      <circle cx="20" cy="23" r="4" fill="none" stroke={color} strokeWidth="1.2"/>
      <path d="M20 20 L20 23 L17 23" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round"/>
      <path d="M16 28 Q20 31 24 28" stroke={color} strokeWidth="0.8" fill="none" opacity="0.6"/>
      <line x1="20" y1="8" x2="20" y2="14" stroke={color} strokeWidth="1.5"/>
      <rect x="16" y="5" width="8" height="3" rx="1" fill={color} opacity="0.4" stroke={color} strokeWidth="0.8"/>
    </svg>
  )
}

export function ElectricalStationIcon({ color = '#f97316' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="10" y="15" width="20" height="15" rx="1" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      <line x1="20" y1="2" x2="20" y2="15" stroke={color} strokeWidth="1.5"/>
      <line x1="14" y1="5" x2="26" y2="5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="8" x2="24" y2="8" stroke={color} strokeWidth="1" strokeLinecap="round"/>
      <path d="M18 22 L20 18 L22 22 L20 20 Z" fill={color} opacity="0.7"/>
      <line x1="20" y1="30" x2="20" y2="35" stroke={color} strokeWidth="1"/>
      <line x1="16" y1="35" x2="24" y2="35" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function TelecomStationIcon({ color = '#ec4899' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="20" y1="2" x2="20" y2="35" stroke={color} strokeWidth="2"/>
      <line x1="12" y1="35" x2="20" y2="20" stroke={color} strokeWidth="1.5"/>
      <line x1="28" y1="35" x2="20" y2="20" stroke={color} strokeWidth="1.5"/>
      <circle cx="20" cy="6" r="2" fill={color} opacity="0.5"/>
      <path d="M14 10 Q20 14 26 10" stroke={color} strokeWidth="0.8" fill="none" opacity="0.4"/>
      <path d="M12 14 Q20 18 28 14" stroke={color} strokeWidth="0.8" fill="none" opacity="0.3"/>
      <path d="M10 18 Q20 22 30 18" stroke={color} strokeWidth="0.8" fill="none" opacity="0.2"/>
      <rect x="15" y="30" width="10" height="5" rx="1" fill={color} opacity="0.2" stroke={color} strokeWidth="0.8"/>
    </svg>
  )
}

export function OfficeBuildingIcon({ color = '#059669' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="8" y="6" width="24" height="28" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <rect x="11" y={9 + i * 6} width="5" height="4" rx="0.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.5"/>
          <rect x="18" y={9 + i * 6} width="5" height="4" rx="0.5" fill={color} opacity="0.2" stroke={color} strokeWidth="0.5"/>
          <rect x="25" y={9 + i * 6} width="3" height="4" rx="0.5" fill={color} opacity="0.15" stroke={color} strokeWidth="0.5"/>
        </g>
      ))}
      <rect x="17" y="30" width="6" height="4" rx="0.5" fill={color} opacity="0.3"/>
    </svg>
  )
}

export function ParkingIcon({ color = '#6b7280' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path d="M4 14 L36 14 L36 12 L4 12 Z" fill={color} opacity="0.3"/>
      <rect x="4" y="14" width="2" height="20" fill={color} opacity="0.4"/>
      <rect x="34" y="14" width="2" height="20" fill={color} opacity="0.4"/>
      <rect x="4" y="32" width="32" height="2" fill={color} opacity="0.2"/>
      <rect x="10" y="20" width="10" height="6" rx="2" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <circle cx="13" cy="28" r="1.5" fill={color} opacity="0.3"/>
      <circle cx="17" cy="28" r="1.5" fill={color} opacity="0.3"/>
      <text x="28" y="24" textAnchor="middle" fill={color} fontSize="7" fontWeight="bold" opacity="0.5">P</text>
    </svg>
  )
}

export function WorkshopIcon({ color = '#059669' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path d="M4 34 V14 L20 4 L36 14 V34 Z" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      <rect x="10" y="18" width="20" height="16" fill={color} opacity="0.05" stroke={color} strokeWidth="1"/>
      <rect x="15" y="22" width="10" height="12" rx="1" fill={color} opacity="0.2" stroke={color} strokeWidth="0.8"/>
      <line x1="20" y1="22" x2="20" y2="34" stroke={color} strokeWidth="0.5"/>
      <rect x="6" y="24" width="4" height="10" rx="0.5" fill={color} opacity="0.15" stroke={color} strokeWidth="0.5"/>
      <rect x="30" y="24" width="4" height="10" rx="0.5" fill={color} opacity="0.15" stroke={color} strokeWidth="0.5"/>
    </svg>
  )
}

export function EquipmentStoreIcon({ color = '#64748b' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path d="M4 34 V16 L20 6 L36 16 V34 Z" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      <rect x="8" y="18" width="24" height="16" fill={color} opacity="0.05"/>
      <rect x="10" y="20" width="5" height="6" fill={color} opacity="0.25" stroke={color} strokeWidth="0.5"/>
      <rect x="17" y="20" width="5" height="6" fill={color} opacity="0.2" stroke={color} strokeWidth="0.5"/>
      <rect x="24" y="20" width="5" height="6" fill={color} opacity="0.15" stroke={color} strokeWidth="0.5"/>
      <rect x="10" y="28" width="5" height="4" fill={color} opacity="0.2" stroke={color} strokeWidth="0.5"/>
      <rect x="17" y="28" width="5" height="4" fill={color} opacity="0.15" stroke={color} strokeWidth="0.5"/>
      <rect x="24" y="28" width="5" height="4" fill={color} opacity="0.1" stroke={color} strokeWidth="0.5"/>
    </svg>
  )
}

export function MonitorIcon({ color = '#dc2626' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="10" y1="35" x2="20" y2="15" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="20" cy="12" r="4" fill={color} opacity="0.3" stroke={color} strokeWidth="1.5"/>
      <line x1="24" y1="10" x2="32" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="33" cy="5" r="1.5" fill={color} opacity="0.5"/>
      <line x1="24" y1="12" x2="30" y2="10" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
      <circle cx="8" cy="36" r="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1"/>
      <line x1="5" y1="36" x2="11" y2="36" stroke={color} strokeWidth="1"/>
    </svg>
  )
}

export function HydrantIcon({ color = '#0891b2' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="15" y="14" width="10" height="16" rx="3" fill={color} opacity="0.3" stroke={color} strokeWidth="1.5"/>
      <circle cx="20" cy="10" r="4" fill={color} opacity="0.2" stroke={color} strokeWidth="1.5"/>
      <line x1="15" y1="20" x2="8" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="7" cy="17.5" r="2" fill={color} opacity="0.4"/>
      <line x1="25" y1="20" x2="32" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="33" cy="17.5" r="2" fill={color} opacity="0.4"/>
      <line x1="20" y1="30" x2="20" y2="36" stroke={color} strokeWidth="2"/>
      <line x1="15" y1="36" x2="25" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function BallValveIcon({ color = '#64748b' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="2" y1="20" x2="14" y2="20" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <line x1="26" y1="20" x2="38" y2="20" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="20" cy="20" r="6" fill={color} opacity="0.2" stroke={color} strokeWidth="1.5"/>
      <circle cx="20" cy="20" r="3" fill={color} opacity="0.4"/>
      <line x1="20" y1="14" x2="20" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="6" x2="24" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function ButterflyValveIcon({ color = '#dc2626' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="2" y1="20" x2="14" y2="20" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <line x1="26" y1="20" x2="38" y2="20" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="20" cy="20" r="6" fill={color} opacity="0.2" stroke={color} strokeWidth="1.5"/>
      <ellipse cx="20" cy="20" rx="2" ry="5" fill={color} opacity="0.4" transform="rotate(30 20 20)"/>
      <line x1="20" y1="14" x2="20" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="17" y="4" width="6" height="3" rx="1" fill={color} opacity="0.4"/>
    </svg>
  )
}

export function CO2Icon({ color = '#78716c' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="8" y="10" width="6" height="22" rx="2" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <rect x="17" y="8" width="6" height="24" rx="2" fill={color} opacity="0.25" stroke={color} strokeWidth="1"/>
      <rect x="26" y="10" width="6" height="22" rx="2" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <line x1="11" y1="10" x2="11" y2="6" stroke={color} strokeWidth="1"/>
      <line x1="20" y1="8" x2="20" y2="4" stroke={color} strokeWidth="1"/>
      <line x1="29" y1="10" x2="29" y2="6" stroke={color} strokeWidth="1"/>
      <line x1="11" y1="6" x2="29" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="20" cy="20" r="2" fill={color} opacity="0.4"/>
      <text x="20" y="37" textAnchor="middle" fill={color} fontSize="5" fontWeight="bold" opacity="0.5">CO₂</text>
    </svg>
  )
}

export function FireWaterPipeIcon({ color = '#dc2626' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="2" y1="20" x2="38" y2="20" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <line x1="2" y1="18" x2="38" y2="18" stroke="white" strokeWidth="0.5" opacity="0.3"/>
      <line x1="2" y1="22" x2="38" y2="22" stroke="white" strokeWidth="0.5" opacity="0.3"/>
      <circle cx="8" cy="20" r="2" fill="white" opacity="0.3"/>
      <circle cx="20" cy="20" r="2" fill="white" opacity="0.3"/>
      <circle cx="32" cy="20" r="2" fill="white" opacity="0.3"/>
    </svg>
  )
}

export function FoamPipeIcon({ color = '#eab308' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="2" y1="20" x2="38" y2="20" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <line x1="2" y1="18" x2="38" y2="18" stroke="white" strokeWidth="0.5" opacity="0.3"/>
      <circle cx="10" cy="20" r="1.5" fill="white" opacity="0.4"/>
      <circle cx="20" cy="20" r="1.5" fill="white" opacity="0.4"/>
      <circle cx="30" cy="20" r="1.5" fill="white" opacity="0.4"/>
    </svg>
  )
}

export function CoolingWaterfallIcon({ color = '#2563eb' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="10" y1="4" x2="10" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="20" y1="4" x2="20" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="30" y1="4" x2="30" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 10 Q10 14 16 10 Q20 8 24 10 Q30 14 36 10" stroke={color} strokeWidth="1.5" fill="none"/>
      <path d="M8 16 Q12 18 16 16 Q20 14 24 16 Q28 18 32 16" stroke={color} strokeWidth="1" fill="none" opacity="0.6"/>
      <path d="M12 22 Q16 24 20 22 Q24 20 28 22" stroke={color} strokeWidth="1" fill="none" opacity="0.4"/>
      <line x1="14" y1="28" x2="14" y2="34" stroke={color} strokeWidth="0.8" opacity="0.3"/>
      <line x1="20" y1="26" x2="20" y2="36" stroke={color} strokeWidth="0.8" opacity="0.3"/>
      <line x1="26" y1="28" x2="26" y2="34" stroke={color} strokeWidth="0.8" opacity="0.3"/>
      <rect x="6" y="34" width="28" height="3" rx="1" fill={color} opacity="0.15" stroke={color} strokeWidth="0.5"/>
    </svg>
  )
}

export function FireWaterfallIcon({ color = '#16a34a' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="12" y="2" width="16" height="8" rx="1" fill={color} opacity="0.15" stroke={color} strokeWidth="1"/>
      <path d="M6 12 Q12 16 18 12 Q20 11 22 12 Q28 16 34 12" stroke={color} strokeWidth="1.5" fill="none"/>
      <path d="M10 18 Q16 20 22 18 Q24 17 26 18 Q30 20 34 18" stroke={color} strokeWidth="1" fill="none" opacity="0.5"/>
      <line x1="14" y1="22" x2="14" y2="30" stroke={color} strokeWidth="0.8" opacity="0.3"/>
      <line x1="20" y1="20" x2="20" y2="32" stroke={color} strokeWidth="0.8" opacity="0.3"/>
      <line x1="26" y1="22" x2="26" y2="30" stroke={color} strokeWidth="0.8" opacity="0.3"/>
      <rect x="6" y="30" width="28" height="3" rx="1" fill={color} opacity="0.15" stroke={color} strokeWidth="0.5"/>
    </svg>
  )
}

export function UndergroundPipeIcon({ color = '#6b7280' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="2" y1="16" x2="38" y2="16" stroke={color} strokeWidth="1" strokeDasharray="3 2" opacity="0.4"/>
      <line x1="2" y1="24" x2="38" y2="24" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.5"/>
      <line x1="2" y1="22" x2="38" y2="22" stroke={color} strokeWidth="0.5" opacity="0.3"/>
      <line x1="2" y1="26" x2="38" y2="26" stroke={color} strokeWidth="0.5" opacity="0.3"/>
      <path d="M4 16 L4 24" stroke={color} strokeWidth="0.5" strokeDasharray="1 1" opacity="0.3"/>
      <path d="M36 16 L36 24" stroke={color} strokeWidth="0.5" strokeDasharray="1 1" opacity="0.3"/>
    </svg>
  )
}

export function RoadIcon({ color = '#78716c' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path d="M10 2 L14 38 H26 L30 2 Z" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <line x1="20" y1="4" x2="20" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <line x1="20" y1="12" x2="20" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <line x1="20" y1="20" x2="20" y2="24" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <line x1="20" y1="28" x2="20" y2="32" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </svg>
  )
}

export function HSEBuildingIcon({ color = '#16a34a' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="6" y="8" width="28" height="26" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      <rect x="10" y="12" width="20" height="10" rx="1" fill={color} opacity="0.2" stroke={color} strokeWidth="0.8"/>
      <text x="20" y="20" textAnchor="middle" fill={color} fontSize="7" fontWeight="bold">HSE</text>
      <rect x="10" y="25" width="8" height="7" rx="0.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.5"/>
      <rect x="22" y="25" width="8" height="7" rx="0.5" fill={color} opacity="0.2" stroke={color} strokeWidth="0.5"/>
      <circle cx="20" cy="5" r="3" fill={color} opacity="0.15" stroke={color} strokeWidth="0.8"/>
      <line x1="18" y1="5" x2="22" y2="5" stroke={color} strokeWidth="0.8"/>
      <line x1="20" y1="3" x2="20" y2="7" stroke={color} strokeWidth="0.8"/>
    </svg>
  )
}

export function TankCoolingIcon({ color = '#2563eb' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="2.5" opacity="0.7"/>
      <circle cx="20" cy="20" r="10" fill="none" stroke={color} strokeWidth="1" opacity="0.3" strokeDasharray="2 2"/>
      <circle cx="20" cy="20" r="5" fill={color} opacity="0.12" stroke={color} strokeWidth="0.8"/>
      <circle cx="20" cy="6" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <path d="M18 6 L16 2" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <path d="M20 6 L20 1" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
      <path d="M22 6 L24 2" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <circle cx="34" cy="20" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <path d="M34 18 L38 16" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <path d="M34 20 L39 20" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
      <path d="M34 22 L38 24" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <circle cx="20" cy="34" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <path d="M18 34 L16 38" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <path d="M20 34 L20 39" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
      <path d="M22 34 L24 38" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <circle cx="6" cy="20" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1"/>
      <path d="M6 18 L2 16" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <path d="M6 20 L1 20" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
      <path d="M6 22 L2 24" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      <circle cx="10" cy="9" r="1.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.6"/>
      <path d="M10 9 L8 6" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <path d="M10 9 L12 6" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <circle cx="30" cy="9" r="1.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.6"/>
      <path d="M30 9 L28 6" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <path d="M30 9 L32 6" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <circle cx="30" cy="31" r="1.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.6"/>
      <path d="M30 31 L28 34" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <path d="M30 31 L32 34" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <circle cx="10" cy="31" r="1.5" fill={color} opacity="0.25" stroke={color} strokeWidth="0.6"/>
      <path d="M10 31 L8 34" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <path d="M10 31 L12 34" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.3"/>
      <text x="20" y="4" textAnchor="middle" fill={color} fontSize="4" fontWeight="bold" opacity="0.6">COOLING</text>
    </svg>
  )
}

export function TankFoamingIcon({ color = '#d97706' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="2.5" opacity="0.7"/>
      <circle cx="20" cy="20" r="10" fill="none" stroke={color} strokeWidth="1" opacity="0.25" strokeDasharray="3 1.5"/>
      <circle cx="20" cy="20" r="5" fill={color} opacity="0.1" stroke={color} strokeWidth="0.8"/>
      <circle cx="14" cy="10" r="2" fill={color} opacity="0.35"/>
      <circle cx="26" cy="10" r="2" fill={color} opacity="0.35"/>
      <circle cx="12" cy="18" r="1.5" fill={color} opacity="0.25"/>
      <circle cx="28" cy="18" r="1.5" fill={color} opacity="0.25"/>
      <circle cx="12" cy="24" r="1.5" fill={color} opacity="0.2"/>
      <circle cx="28" cy="24" r="1.5" fill={color} opacity="0.2"/>
      <circle cx="14" cy="30" r="1.8" fill={color} opacity="0.3"/>
      <circle cx="26" cy="30" r="1.8" fill={color} opacity="0.3"/>
      <circle cx="20" cy="6" r="1.5" fill={color} opacity="0.2"/>
      <circle cx="20" cy="34" r="1.5" fill={color} opacity="0.2"/>
      <circle cx="6" cy="20" r="1.5" fill={color} opacity="0.2"/>
      <circle cx="34" cy="20" r="1.5" fill={color} opacity="0.2"/>
      <text x="20" y="4" textAnchor="middle" fill={color} fontSize="4" fontWeight="bold" opacity="0.6">FOAM</text>
    </svg>
  )
}

export function ShedCoolingIcon({ color = '#0ea5e9' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <line x1="3" y1="8" x2="37" y2="8" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
      <line x1="3" y1="14" x2="37" y2="14" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
      <line x1="3" y1="20" x2="37" y2="20" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.5"/>
      <line x1="3" y1="26" x2="37" y2="26" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.4"/>
      <path d="M10 8 L10 4" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M8 4 L10 2 L12 4" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M22 8 L22 4" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M20 4 L22 2 L24 4" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M34 8 L34 4" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M32 4 L34 2 L36 4" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M10 14 L10 10" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M8 10 L10 8 L12 10" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M30 14 L30 10" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M28 10 L30 8 L32 10" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M14 20 L14 16" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M12 16 L14 14 L16 16" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M28 20 L28 16" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M26 16 L28 14 L30 16" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M22 26 L22 22" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M20 22 L22 20 L24 22" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <path d="M10 26 L10 22" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M8 22 L10 20 L12 22" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.4"/>
      <rect x="2" y="32" width="36" height="4" rx="2" fill={color} opacity="0.08" stroke={color} strokeWidth="0.5"/>
      <text x="20" y="39" textAnchor="middle" fill={color} fontSize="3.5" fontWeight="bold" opacity="0.5">SHED COOLING</text>
    </svg>
  )
}

export function AutoCO2Icon({ color = '#dc2626' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="6" y="12" width="6" height="18" rx="2" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <rect x="14" y="10" width="6" height="20" rx="2" fill={color} opacity="0.25" stroke={color} strokeWidth="1"/>
      <rect x="22" y="12" width="6" height="18" rx="2" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <rect x="30" y="14" width="5" height="16" rx="2" fill={color} opacity="0.15" stroke={color} strokeWidth="0.8"/>
      <line x1="9" y1="12" x2="9" y2="8" stroke={color} strokeWidth="1"/>
      <line x1="17" y1="10" x2="17" y2="6" stroke={color} strokeWidth="1"/>
      <line x1="25" y1="12" x2="25" y2="8" stroke={color} strokeWidth="1"/>
      <line x1="32.5" y1="14" x2="32.5" y2="10" stroke={color} strokeWidth="0.8"/>
      <line x1="9" y1="8" x2="32.5" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="6" r="1.5" fill={color} opacity="0.5"/>
      <circle cx="17" cy="4" r="1.5" fill={color} opacity="0.6"/>
      <circle cx="25" cy="6" r="1.5" fill={color} opacity="0.5"/>
      <path d="M14 30 L14 34 L26 34 L26 30" stroke={color} strokeWidth="0.8" fill="none" opacity="0.3"/>
      <text x="20" y="38" textAnchor="middle" fill={color} fontSize="4" fontWeight="bold" opacity="0.5">AUTO</text>
    </svg>
  )
}

export function WarehouseIcon({ color = '#92400e' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path d="M4 32 L20 6 L36 32 Z" fill={color} opacity="0.08" stroke={color} strokeWidth="1.5"/>
      <rect x="8" y="32" width="24" height="3" rx="1" fill={color} opacity="0.2" stroke={color} strokeWidth="1"/>
      <rect x="14" y="20" width="12" height="12" rx="1" fill={color} opacity="0.15" stroke={color} strokeWidth="1"/>
      <line x1="20" y1="20" x2="20" y2="32" stroke={color} strokeWidth="0.8"/>
      <rect x="10" y="24" width="4" height="8" rx="0.5" fill={color} opacity="0.2" stroke={color} strokeWidth="0.5"/>
      <rect x="26" y="24" width="4" height="8" rx="0.5" fill={color} opacity="0.2" stroke={color} strokeWidth="0.5"/>
      <text x="20" y="17" textAnchor="middle" fill={color} fontSize="5" fontWeight="bold" opacity="0.5">WH</text>
    </svg>
  )
}

export function GasStationIcon({ color = '#f59e0b' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <rect x="8" y="10" width="14" height="22" rx="2" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <rect x="10" y="14" width="4" height="6" rx="1" fill={color} opacity="0.3" stroke={color} strokeWidth="0.8"/>
      <rect x="16" y="14" width="4" height="6" rx="1" fill={color} opacity="0.25" stroke={color} strokeWidth="0.8"/>
      <line x1="15" y1="20" x2="15" y2="24" stroke={color} strokeWidth="0.8" opacity="0.4"/>
      <rect x="26" y="14" width="8" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.2"/>
      <circle cx="30" cy="18" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="0.8"/>
      <line x1="30" y1="15.5" x2="30" y2="14" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <rect x="8" y="32" width="26" height="3" rx="1" fill={color} opacity="0.1"/>
      <text x="20" y="7" textAnchor="middle" fill={color} fontSize="4" fontWeight="bold" opacity="0.5">GAS</text>
    </svg>
  )
}

export function ControlSiloIcon({ color = '#f97316' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path d="M4 34 V16 L20 6 L36 16 V34 Z" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      <rect x="10" y="18" width="20" height="16" fill={color} opacity="0.05" stroke={color} strokeWidth="1"/>
      <rect x="14" y="22" width="12" height="8" rx="1" fill={color} opacity="0.2" stroke={color} strokeWidth="0.8"/>
      <circle cx="20" cy="26" r="2.5" fill={color} opacity="0.3"/>
      <line x1="18" y1="24" x2="22" y2="28" stroke={color} strokeWidth="0.8" opacity="0.5"/>
      <line x1="22" y1="24" x2="18" y2="28" stroke={color} strokeWidth="0.8" opacity="0.5"/>
    </svg>
  )
}
