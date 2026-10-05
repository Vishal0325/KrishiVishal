import { createContext, useContext, useState } from 'react';

const HubContext = createContext(null);

export const HUBS = [
  { id: 'ALL',         label: '🌐 All Hubs' },
  { id: 'HUB-SAM-001', label: 'Samastipur Central' },
  { id: 'REG-KHA-003', label: 'Khanpur'            },
  { id: 'REG-RAH-002', label: 'Rahthuli'            },
  { id: 'REG-TAJ-004', label: 'Tajpur'              },
];

export function HubProvider({ children }) {
  const [selectedHub, setSelectedHub] = useState('ALL');
  return (
    <HubContext.Provider value={{ selectedHub, setSelectedHub, HUBS }}>
      {children}
    </HubContext.Provider>
  );
}

export const useHubContext = () => useContext(HubContext);
