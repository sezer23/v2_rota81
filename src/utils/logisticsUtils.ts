import { AIRPORTS, Airport } from '../data/logisticsData';

// +45 dk bavul/çıkış tampon süresi ekleyen fonksiyon
export const addMinutesToTime = (timeStr: string, minutesToAdd: number): string => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes + minutesToAdd);
  return date.toTimeString().substring(0, 5);
};

// İtinerary içindeki son bilinen şehri getiren fonksiyon
export const getLastKnownCity = (itineraryItems: any[]): string => {
  for (let i = itineraryItems.length - 1; i >= 0; i--) {
    if (itineraryItems[i].city) return itineraryItems[i].city;
  }
  return '';
};