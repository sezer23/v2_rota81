import React, { useState, useEffect } from 'react';
import { getLastKnownCity } from '../utils/logisticsUtils';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransfer: (transferItem: any) => void;
  currentItinerary: any[];
}

export const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose, onAddTransfer, currentItinerary }) => {
  const [vehicle, setVehicle] = useState('Otobüs');
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');

  // Modal açıldığında son bilinen şehri otomatik "Nereden" alanına doldur
  useEffect(() => {
    if (isOpen) {
      const lastCity = getLastKnownCity(currentItinerary);
      setFromCity(lastCity || '');
      setToCity('');
      setDepartureTime('');
      setArrivalTime('');
      setDistance('');
      setDuration('');
    }
  }, [isOpen, currentItinerary]);

  if (!isOpen) return null;

  const handleSave = () => {
    const transferItem = {
      category: 'LOGISTICS_TRANSFER',
      vehicle,
      fromCity,
      toCity,
      departureTime,
      arrivalTime,
      distance: Number(distance) || 0,
      duration,
      city: toCity // Sonraki adımlar için rota şehir bağlamını güncellemek üzere
    };

    onAddTransfer(transferItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 border border-slate-100">
        <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>🚐</span> Şehirlerarası Transfer Ekle
        </h3>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Ulaşım Aracı:</label>
          <select 
            value={vehicle} 
            onChange={(e) => setVehicle(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-600"
          >
            <option value="Otobüs">🚌 Otobüs</option>
            <option value="Midibüs">🚐 Midibüs</option>
            <option value="Minibüs">🚐 Minibüs</option>
            <option value="Tren">🚆 Tren</option>
            <option value="Özel VIP Araç">🚘 VIP Transfer</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Nereden (Kalkış):</label>
            <input 
              type="text" 
              value={fromCity} 
              onChange={(e) => setFromCity(e.target.value)} 
              placeholder="Kalkış şehri" 
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Nereye (Varış):</label>
            <input 
              type="text" 
              value={toCity} 
              onChange={(e) => setToCity(e.target.value)} 
              placeholder="Örn: Mardin" 
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Kalkış Saati:</label>
            <input 
              type="time" 
              value={departureTime} 
              onChange={(e) => setDepartureTime(e.target.value)} 
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Varış Saati:</label>
            <input 
              type="time" 
              value={arrivalTime} 
              onChange={(e) => setArrivalTime(e.target.value)} 
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600 font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Mesafe (km):</label>
            <input 
              type="number" 
              value={distance} 
              onChange={(e) => setDistance(e.target.value)} 
              placeholder="Örn: 350" 
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Tahmini Süre:</label>
            <input 
              type="text" 
              value={duration} 
              onChange={(e) => setDuration(e.target.value)} 
              placeholder="Örn: 4 Saat 15 Dk" 
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>
        </div>

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
            Transferi Ekle
          </button>
        </div>
      </div>
    </div>
  );
};