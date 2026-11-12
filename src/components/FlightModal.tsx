import React, { useState } from 'react';
import { AIRLINES, AIRPORTS } from '../data/logisticsData';
import { addMinutesToTime } from '../utils/logisticsUtils';

interface FlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFlight: (flightItem: any) => void;
}

export const FlightModal: React.FC<FlightModalProps> = ({ isOpen, onClose, onAddFlight }) => {
  const [flightType, setFlightType] = useState<'departure' | 'arrival' | 'transit'>('arrival');
  const [airline, setAirline] = useState(AIRLINES[0].code);
  const [flightNo, setFlightNo] = useState('');
  const [airportCode, setAirportCode] = useState(AIRPORTS[0].code);
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [hasBuffer, setHasBuffer] = useState(true);

  if (!isOpen) return null;

  const handleSave = () => {
    const airportObj = AIRPORTS.find(a => a.code === airportCode);
    let bufferEndTime = '';

    if ((flightType === 'arrival' || flightType === 'transit') && hasBuffer && arrivalTime) {
      bufferEndTime = addMinutesToTime(arrivalTime, 45); // +45 dk bavul kuralı
    }

    const flightItem = {
      category: 'LOGISTICS_FLIGHT',
      title: `Uçuş: ${airline} ${flightNo}`,
      flightType,
      airport: airportObj,
      departureTime,
      arrivalTime,
      bufferEndTime,
      city: airportObj ? airportObj.city : ''
    };

    onAddFlight(flightItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 border border-slate-100">
        <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>✈️</span> Uçuş Lojistiği Ekle
        </h3>
        
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Uçuş Tipi:</label>
          <select 
            value={flightType} 
            onChange={(e) => setFlightType(e.target.value as any)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
          >
            <option value="departure">Kalkış (Gidiş)</option>
            <option value="arrival">Varış (Karşılama)</option>
            <option value="transit">Aktarma</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Havayolu & Uçuş No:</label>
          <div className="flex gap-2">
            <select 
              value={airline} 
              onChange={(e) => setAirline(e.target.value)}
              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
            >
              {AIRLINES.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
            </select>
            <input 
              type="text" 
              placeholder="Örn: 2142" 
              value={flightNo} 
              onChange={(e) => setFlightNo(e.target.value)}
              className="w-28 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Havalimanı:</label>
          <select 
            value={airportCode} 
            onChange={(e) => setAirportCode(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
          >
            {AIRPORTS.map(ap => (
              <option key={ap.code} value={ap.code}>
                {ap.city} - {ap.name} ({ap.code})
              </option>
            ))}
          </select>
        </div>

        {flightType !== 'arrival' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Kalkış Saati:</label>
            <input 
              type="time" 
              value={departureTime} 
              onChange={(e) => setDepartureTime(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 font-mono"
            />
          </div>
        )}

        {flightType !== 'departure' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Varış Saati:</label>
            <input 
              type="time" 
              value={arrivalTime} 
              onChange={(e) => setArrivalTime(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 font-mono"
            />
            
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none pt-1">
              <input 
                type="checkbox" 
                checked={hasBuffer} 
                onChange={(e) => setHasBuffer(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-600"
              />
              Havalimanı sonrası program devam ediyor (+45 dk bagaj & çıkış süresi ekle)
            </label>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
          >
            İptal
          </button>
          <button 
            type="button" 
            onClick={handleSave} 
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm"
          >
            Rotalara Ekle
          </button>
        </div>
      </div>
    </div>
  );
};