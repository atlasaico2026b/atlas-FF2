export interface Standard {
  id: string
  name: string
  fullName: string
  category: string
  content: string
}

export const STANDARDS: Standard[] = [
  {
    id: 'nfpa-13',
    name: 'NFPA 13',
    fullName: 'Standard for the Installation of Sprinkler Systems',
    category: 'NFPA',
    content: `NFPA 13 - Standard for the Installation of Sprinkler Systems

This standard provides requirements for the design and installation of automatic fire sprinkler systems and other fixed fire suppression systems.

Key Requirements:
- System design shall be based on hazard classification
- Water supply must meet minimum pressure and flow requirements
- Sprinkler heads must be selected based on hazard and occupancy
- Pipe sizing must account for friction loss and elevation changes

Application in Industrial Facilities:
- Storage facilities require ESFR or in-rack sprinklers
- High-piled storage needs special design considerations
- Flammable liquid storage requires specific sprinkler density`
  },
  {
    id: 'nfpa-14',
    name: 'NFPA 14',
    fullName: 'Standard for the Installation of Standpipe and Hose Systems',
    category: 'NFPA',
    content: `NFPA 14 - Standard for the Installation of Standpipe and Hose Systems

This standard covers the design, installation, and maintenance of standpipe and hose systems.

Key Requirements:
- Class I systems for fire department use
- Class II systems for occupant use
- Class III systems for both fire department and occupant use
- Minimum pressure at most remote hose outlet

Application in Industrial Facilities:
- Outdoor standpipes for tank farms
- Wet standpipe systems for enclosed structures
- Dry standpipe systems where freezing is possible`
  },
  {
    id: 'nfpa-15',
    name: 'NFPA 15',
    fullName: 'Standard for the Application of Fixed Water Spray Systems',
    category: 'NFPA',
    content: `NFPA 15 - Standard for the Application of Fixed Water Spray Systems

This standard covers water spray systems for fire protection of industrial facilities.

Key Requirements:
- System design must consider exposure protection
- Water supply requirements for spray systems
- Nozzle selection based on hazard type
- Pipe sizing for spray system hydraulics

Application in Industrial Facilities:
- Tank cooling systems (fixed and floating roof)
- Transformer protection
- Conveyor belt protection
- Loading rack protection`
  },
  {
    id: 'nfpa-16',
    name: 'NFPA 16',
    fullName: 'Standard for the Installation of Foam-Water Sprinkler Systems',
    category: 'NFPA',
    content: `NFPA 16 - Standard for the Installation of Foam-Water Sprinkler and Foam-Water Spray Systems

This standard covers foam-water systems for Class A and Class B fire protection.

Key Requirements:
- Foam concentrate selection based on hazard
- System proportioning requirements
- Foam solution discharge time
- Water supply and foam supply requirements

Application in Industrial Facilities:
- Flammable liquid storage tanks
- Loading/unloading areas
- Aircraft hangars
- Aircraft crash rescue facilities`
  },
  {
    id: 'nfpa-25',
    name: 'NFPA 25',
    fullName: 'Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems',
    category: 'NFPA',
    content: `NFPA 25 - Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems

This standard provides requirements for inspection, testing, and maintenance of water-based fire protection systems.

Key Requirements:
- Weekly, monthly, quarterly, and annual inspections
- System tests including pump tests and valve tests
- Documentation of all inspections and tests
- Corrective actions for deficiencies

Application in Industrial Facilities:
- Fire pump testing protocols
- Sprinkler system inspections
- Standpipe system maintenance
- Foam system testing`
  },
  {
    id: 'nfpa-30',
    name: 'NFPA 30',
    fullName: 'Flammable and Combustible Liquids Code',
    category: 'NFPA',
    content: `NFPA 30 - Flammable and Combustible Liquids Code

This code covers the storage, handling, and use of flammable and combustible liquids.

Key Requirements:
- Classification of liquids by flash point
- Storage tank design requirements
- Bundwall/dike requirements
- Separation distances between tanks
- Fire protection for tank farms

Application in Industrial Facilities:
- Tank farm layout and spacing
- Bundwall sizing calculations
- Fire extinguishing system requirements
- Emergency access and egress`
  },
  {
    id: 'nfpa-33',
    name: 'NFPA 33',
    fullName: 'Standard for Spray Application Using Flammable or Combustible Materials',
    category: 'NFPA',
    content: `NFPA 33 - Standard for Spray Application Using Flammable or Combustible Materials

This standard covers spray finishing operations using flammable or combustible materials.

Key Requirements:
- Spray booth design requirements
- Ventilation requirements
- Electrical classification
- Fire protection systems

Application in Industrial Facilities:
- Paint spray facilities
- Coating operations
- Finishing processes`
  },
  {
    id: 'nfpa-37',
    name: 'NFPA 37',
    fullName: 'Standard for the Installation and Use of Stationary Combustion Engines and Gas Turbines',
    category: 'NFPA',
    content: `NFPA 37 - Standard for the Installation and Use of Stationary Combustion Engines and Gas Turbines

This standard covers installation of stationary engines and turbines.

Key Requirements:
- Room ventilation requirements
- Fuel supply system requirements
- Exhaust system requirements
- Fire protection for engine rooms

Application in Industrial Facilities:
- Gas turbine protection
- Generator rooms
- Emergency power systems`
  },
  {
    id: 'nfpa-495',
    name: 'NFPA 495',
    fullName: 'Explosive Materials Code',
    category: 'NFPA',
    content: `NFPA 495 - Explosive Materials Code

This code covers the manufacture, storage, handling, and use of explosive materials.

Key Requirements:
- Quantity-distance requirements
- Storage magazine requirements
- Transportation requirements
- Fire protection requirements

Application in Industrial Facilities:
- Blasting agent storage
- Detonator storage
- Processing facilities`
  },
  {
    id: 'nfpa-1142',
    name: 'NFPA 1142',
    fullName: 'Standard on Water Supplies for Suburban and Rural Fire Fighting',
    category: 'NFPA',
    content: `NFPA 1142 - Standard on Water Supplies for Suburban and Rural Fire Fighting

This standard provides minimum requirements for water supplies in suburban and rural areas.

Key Requirements:
- Water supply calculations
- Alternative water sources
- Tank and reservoir requirements
- Hydrant system requirements

Application in Industrial Facilities:
- Rural industrial facilities
- Remote tank farms
- Alternative water supply provisions`
  },
  {
    id: 'ips-n-1-1',
    name: 'IPS N-1-1',
    fullName: 'Iranian Petroleum Standard - Fire Protection System Design',
    category: 'IPS',
    content: `IPS N-1-1 - Fire Protection System Design for Petroleum Industry

This standard covers fire protection requirements for oil and gas facilities.

Key Requirements:
- Risk assessment methodology
- Fire water system design
- Fixed fire suppression systems
- Portable fire extinguisher requirements

Application in Oil & Gas:
- Refinery fire protection
- Terminal fire protection
- Pipeline facility protection`
  },
  {
    id: 'ips-n-1-3',
    name: 'IPS N-1-3',
    fullName: 'Iranian Petroleum Standard - Fire Water System Design',
    category: 'IPS',
    content: `IPS N-1-3 - Fire Water System Design

This standard covers fire water system requirements for petroleum facilities.

Key Requirements:
- Fire water demand calculations
- Fire pump selection
- Fire water ring main design
- Hydrant and monitor spacing
- Foam system requirements

Application in Oil & Gas:
- Fire water ring main sizing
- Pump selection and sizing
- Water storage requirements
- Distribution system design`
  },
  {
    id: 'ips-n-1-4',
    name: 'IPS N-1-4',
    fullName: 'Iranian Petroleum Standard - Fixed Fire Extinguishing Systems',
    category: 'IPS',
    content: `IPS N-1-4 - Fixed Fire Extinguishing Systems

This standard covers fixed fire suppression systems for petroleum facilities.

Key Requirements:
- CO2 system design
- Foam system design
- Water mist system design
- System selection criteria

Application in Oil & Gas:
- Turbine hall protection
- Electrical room protection
- Control room protection
- Pump room protection`
  },
  {
    id: 'ips-n-1-5',
    name: 'IPS N-1-5',
    fullName: 'Iranian Petroleum Standard - Portable Fire Extinguishers',
    category: 'IPS',
    content: `IPS N-1-5 - Portable Fire Extinguishers

This standard covers portable fire extinguisher requirements.

Key Requirements:
- Extinguisher selection by hazard type
- Placement and spacing requirements
- Inspection and maintenance
- Training requirements

Application in Oil & Gas:
- Process areas
- Administrative buildings
- Storage facilities`
  },
  {
    id: 'ips-n-1-6',
    name: 'IPS N-1-6',
    fullName: 'Iranian Petroleum Standard - Foam System Design',
    category: 'IPS',
    content: `IPS N-1-6 - Foam System Design for Petroleum Industry

This standard covers foam system design requirements.

Key Requirements:
- Foam concentrate selection
- Application rates and durations
- Foam system proportioning
- Foam chamber and pourer requirements

Application in Oil & Gas:
- Tank fire protection
- Bund fire protection
- Loading/unloading protection`
  },
  {
    id: 'ips-n-1-7',
    name: 'IPS N-1-7',
    fullName: 'Iranian Petroleum Standard - Fire Detection and Alarm Systems',
    category: 'IPS',
    content: `IPS N-1-7 - Fire Detection and Alarm Systems

This standard covers fire detection and alarm system requirements.

Key Requirements:
- System design criteria
- Detector selection and placement
- Alarm system requirements
- Integration with other systems

Application in Oil & Gas:
- Process area detection
- Building detection
- Control system integration`
  }
]
