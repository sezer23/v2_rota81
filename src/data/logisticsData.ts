// Havayolu Arayüzü
export interface Airline {
  code: string;
  name: string;
}

// Havalimanı Arayüzü
export interface Airport {
  code: string;
  city: string;
  name: string;
  lat: number;
  lng: number;
}

// Türkiye Havayolları Verisi
export const AIRLINES: Airline[] = [
  { code: 'TK', name: 'Türk Hava Yolları' },
  { code: 'PC', name: 'Pegasus Havayolları' },
  { code: 'XQ', name: 'SunExpress' },
  { code: 'VF', name: 'AJet' }
];

// Türkiye Havalimanları Verisi (İhtiyaca göre çoğaltabilirsin)
export const AIRPORTS: Airport[] = [
  { code: 'MQM', city: 'Mardin', name: 'Mardin Prof. Dr. Aziz Sancar Havalimanı', lat: 37.2289, lng: 40.6325 },
  { code: 'IST', city: 'İstanbul', name: 'İstanbul Havalimanı', lat: 41.2753, lng: 28.7519 },
  { code: 'SAW', city: 'İstanbul', name: 'İstanbul Sabiha Gökçen Havalimanı', lat: 40.8986, lng: 29.3092 },
  { code: 'ESB', city: 'Ankara', name: 'Ankara Esenboğa Havalimanı', lat: 40.1281, lng: 32.9950 },
  { code: 'ADB', city: 'İzmir', name: 'İzmir Adnan Menderes Havalimanı', lat: 38.2924, lng: 27.1570 },
  { code: 'AYT', city: 'Antalya', name: 'Antalya Havalimanı', lat: 36.8987, lng: 30.8005 }
];