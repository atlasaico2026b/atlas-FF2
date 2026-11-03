// SPDX-License-Identifier: Apache-2.0
// Equipment icons rendered as <image> pointing to uploaded PNG files

function iconSvg(pngPath: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <image href="${pngPath}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>
  </svg>`
}

export const EQUIPMENT_SVG: Record<string, string> = {
  water_tank: iconSvg('/equipment-icons/water_tank.png'),
  pump: iconSvg('/equipment-icons/pump.png'),
  jockey_pump: iconSvg('/equipment-icons/jockey_pump.png'),
  foam_tank: iconSvg('/equipment-icons/foam_tank.png'),
  oil_tank: iconSvg('/equipment-icons/oil_tank.png'),
  contamination_tank: iconSvg('/equipment-icons/contamination_tank.png'),
  manifold: iconSvg('/equipment-icons/manifold.png'),
  turbine: iconSvg('/equipment-icons/turbine.png'),
  control_building: iconSvg('/equipment-icons/control_building.png'),
  office_building: iconSvg('/equipment-icons/office_building.png'),
  hse_building: iconSvg('/equipment-icons/hse_building.png'),
  workshop: iconSvg('/equipment-icons/workshop.png'),
  equipment_store: iconSvg('/equipment-icons/salvage_store.png'),
  warehouse: iconSvg('/equipment-icons/warehouse.png'),
  electrical_station: iconSvg('/equipment-icons/electrical_station.png'),
  telecom_station: iconSvg('/equipment-icons/telecom_station.png'),
  parking: iconSvg('/equipment-icons/parking.png'),
  monitor: iconSvg('/equipment-icons/monitor.png'),
  hydrant: iconSvg('/equipment-icons/hydrant.png'),
  valve: iconSvg('/equipment-icons/valve.png'),
  butterfly_valve: iconSvg('/equipment-icons/butterfly_valve.png'),
  auto_co2: iconSvg('/equipment-icons/auto_co2.png'),
  tank_cooling: iconSvg('/equipment-icons/tank_cooling.png'),
  tank_foaming: iconSvg('/equipment-icons/tank_foaming.png'),
  shed_cooling: iconSvg('/equipment-icons/shed_sprinkler.png'),
  shed_sprinkler: iconSvg('/equipment-icons/shed_sprinkler.png'),
  gas_station: iconSvg('/equipment-icons/gas_station.svg'),
  bundwall: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="10" y="10" width="80" height="80" rx="2" fill="none" stroke="#a16207" stroke-width="3" stroke-dasharray="8 4"/>
    <rect x="18" y="18" width="64" height="64" rx="2" fill="#fef3c7" stroke="#a16207" stroke-width="2"/>
    <text x="50" y="54" text-anchor="middle" fill="#92400e" font-size="7" font-weight="bold">BUNDWALL</text>
  </svg>`,
  underground_tank: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <line x1="5" y1="30" x2="95" y2="30" stroke="#78716c" stroke-width="1" strokeDasharray="4 3"/>
    <rect x="15" y="35" width="70" height="30" rx="5" fill="#a8a29e" stroke="#78716c" stroke-width="1.5"/>
    <rect x="15" y="35" width="70" height="15" rx="5" fill="#d6d3d1"/>
    <rect x="15" y="50" width="70" height="15" rx="5" fill="#78716c"/>
    <text x="50" y="54" text-anchor="middle" fill="#44403c" font-size="5" font-weight="bold">UNDERGROUND</text>
  </svg>`,
  road: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="15" y="2" width="70" height="96" fill="#57534e"/>
    <line x1="50" y1="5" x2="50" y2="15" stroke="white" stroke-width="4" stroke-linecap="round"/>
    <line x1="50" y1="22" x2="50" y2="32" stroke="white" stroke-width="4" stroke-linecap="round"/>
    <line x1="50" y1="39" x2="50" y2="49" stroke="white" stroke-width="4" stroke-linecap="round"/>
    <line x1="50" y1="56" x2="50" y2="66" stroke="white" stroke-width="4" stroke-linecap="round"/>
    <line x1="50" y1="73" x2="50" y2="83" stroke="white" stroke-width="4" stroke-linecap="round"/>
  </svg>`,
  sprinkler: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="2" y="35" width="96" height="8" rx="2" fill="#2563eb" stroke="#1d4ed8" stroke-width="1"/>
    <rect x="45" y="43" width="10" height="12" rx="1" fill="#64748b"/>
    <path d="M42 55 L50 72 L58 55" fill="none" stroke="#06b6d4" stroke-width="1.5"/>
    <path d="M38 55 L50 78 L62 55" fill="none" stroke="#06b6d4" stroke-width="1" opacity="0.7"/>
    <circle cx="50" cy="55" r="2" fill="#06b6d4"/>
  </svg>`,
  co2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="10" y="10" width="10" height="55" rx="3" fill="#dc2626" stroke="#991b1b" stroke-width="1"/>
    <rect x="25" y="8" width="10" height="57" rx="3" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
    <rect x="40" y="10" width="10" height="55" rx="3" fill="#dc2626" stroke="#991b1b" stroke-width="1"/>
    <rect x="55" y="8" width="10" height="57" rx="3" fill="#ef4444" stroke="#dc2626" stroke-width="1"/>
    <rect x="70" y="10" width="10" height="55" rx="3" fill="#dc2626" stroke="#991b1b" stroke-width="1"/>
    <line x1="10" y1="5" x2="95" y2="5" stroke="#475569" stroke-width="2" stroke-linecap="round"/>
    <text x="50" y="84" text-anchor="middle" fill="#475569" font-size="7" font-weight="bold">CO₂</text>
  </svg>`,
  pipe_red: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="2" y="38" width="96" height="24" rx="4" fill="#dc2626" stroke="#991b1b" stroke-width="1.5"/>
    <text x="50" y="28" text-anchor="middle" fill="#dc2626" font-size="7" font-weight="bold">FIRE WATER</text>
  </svg>`,
  pipe_green: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="2" y="38" width="96" height="24" rx="4" fill="#16a34a" stroke="#15803d" stroke-width="1.5"/>
    <text x="50" y="28" text-anchor="middle" fill="#16a34a" font-size="6" font-weight="bold">UNDERGROUND</text>
  </svg>`,
  pipe_yellow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="2" y="38" width="96" height="24" rx="4" fill="#eab308" stroke="#a16207" stroke-width="1.5"/>
    <text x="50" y="28" text-anchor="middle" fill="#a16207" font-size="7" font-weight="bold">FOAM PIPE</text>
  </svg>`,
  pipe_blue: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="2" y="38" width="96" height="24" rx="4" fill="#2563eb" stroke="#1d4ed8" stroke-width="1.5"/>
    <text x="50" y="28" text-anchor="middle" fill="#1d4ed8" font-size="6" font-weight="bold">CO₂ PIPE</text>
  </svg>`,
  pipe_gray: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="2" y="38" width="96" height="24" rx="4" fill="#6b7280" stroke="#4b5563" stroke-width="1.5"/>
    <text x="50" y="28" text-anchor="middle" fill="#4b5563" font-size="6" font-weight="bold">CO₂ PIPE</text>
  </svg>`,
}

export const ELEMENT_COLORS: Record<string, string> = {
  water_tank: '#3b82f6', pump: '#dc2626', jockey_pump: '#b91c1c',
  foam_tank: '#eab308', oil_tank: '#d97706', bundwall: '#a16207',
  manifold: '#8b5cf6', control_building: '#64748b', warehouse: '#92400e',
  parking: '#9ca3af', electrical_station: '#f97316',
  telecom_station: '#ec4899', turbine: '#7c3aed', monitor: '#dc2626',
  hydrant: '#dc2626', valve: '#dc2626', butterfly_valve: '#64748b',
  office_building: '#059669', hse_building: '#16a34a', equipment_store: '#64748b', workshop: '#059669', co2: '#dc2626',
  road: '#57534e',
  pipe_red: '#dc2626', pipe_yellow: '#eab308', pipe_green: '#16a34a',
  pipe_blue: '#2563eb', pipe_gray: '#6b7280',
  underground_tank: '#78716c', sprinkler: '#06b6d4',
  tank_cooling: '#2563eb', tank_foaming: '#d97706', shed_cooling: '#0ea5e9', auto_co2: '#dc2626',
  gas_station: '#f59e0b',
  contamination_tank: '#b45309',
}

export const ELEMENT_LABELS: Record<string, string> = {
  water_tank: 'مخزن آب آتش‌نشانی', pump: 'پمپ آب آتش‌نشانی',
  jockey_pump: 'جوکی پمپ آتش‌نشانی', foam_tank: 'مخزن فوم آتش‌نشانی',
  oil_tank: 'مخزن نفتی', bundwall: 'باندوال',
  manifold: 'منیفولد', control_building: 'ساختمان کنترل', warehouse: 'ساختمان انبار',
  parking: 'پارکینگ', gas_station: 'ایستگاه گاز', electrical_station: 'ایستگاه برق',
  telecom_station: 'ایستگاه مخابرات', turbine: 'سوله توربین', monitor: 'مانیتور آتش‌نشانی',
  hydrant: 'هایدرانت', valve: 'ولو', butterfly_valve: 'ولو پروانه‌ای',
  road: 'جاده',
  pipe_red: 'لوله آب آتش‌نشانی', pipe_yellow: 'لوله فوم',
  pipe_green: 'لوله زیرسطحی', pipe_blue: 'لوله CO₂',
  pipe_gray: 'لوله زیرسطحی',
  underground_tank: 'مخزن زیرزمینی', sprinkler: 'آبپاش',
  contamination_tank: 'مخزن زیرزمینی مواد آلوده',
  co2: 'اتوماتیک CO₂',
  office_building: 'ساختمان اداری', hse_building: 'ساختمان HSE',
  equipment_store: 'انبار تجهیزات', workshop: 'ساختمان کارگاهی',
  tank_cooling: 'کولینگ مخازن', tank_foaming: 'فومینگ مخازن',
  shed_cooling: 'کولینگ سوله‌ها', auto_co2: 'اتوماتیک CO₂',
}
