import { Zone } from '../enums';

export interface DistrictSeed {
  /** Short stable key. Also the join key against the GeoJSON feature property `code`. */
  code: string;
  name: string;
  nameGu: string;
  zone: Zone;
  lat: number;
  lng: number;
}

/** All 33 districts of Gujarat, with approximate district-centre coordinates. */
export const GUJARAT_DISTRICTS: DistrictSeed[] = [
  // Saurashtra
  { code: 'RJT', name: 'Rajkot', nameGu: 'રાજકોટ', zone: Zone.SAURASHTRA, lat: 22.3039, lng: 70.8022 },
  { code: 'JMN', name: 'Jamnagar', nameGu: 'જામનગર', zone: Zone.SAURASHTRA, lat: 22.4707, lng: 70.0577 },
  { code: 'JNG', name: 'Junagadh', nameGu: 'જૂનાગઢ', zone: Zone.SAURASHTRA, lat: 21.5222, lng: 70.4579 },
  { code: 'BVN', name: 'Bhavnagar', nameGu: 'ભાવનગર', zone: Zone.SAURASHTRA, lat: 21.7645, lng: 72.1519 },
  { code: 'AMR', name: 'Amreli', nameGu: 'અમરેલી', zone: Zone.SAURASHTRA, lat: 21.6032, lng: 71.2221 },
  { code: 'SRN', name: 'Surendranagar', nameGu: 'સુરેન્દ્રનગર', zone: Zone.SAURASHTRA, lat: 22.7271, lng: 71.6479 },
  { code: 'PRB', name: 'Porbandar', nameGu: 'પોરબંદર', zone: Zone.SAURASHTRA, lat: 21.6417, lng: 69.6293 },
  { code: 'MRB', name: 'Morbi', nameGu: 'મોરબી', zone: Zone.SAURASHTRA, lat: 22.8173, lng: 70.837 },
  { code: 'BTD', name: 'Botad', nameGu: 'બોટાદ', zone: Zone.SAURASHTRA, lat: 22.1704, lng: 71.6684 },
  { code: 'GIR', name: 'Gir Somnath', nameGu: 'ગીર સોમનાથ', zone: Zone.SAURASHTRA, lat: 20.91, lng: 70.367 },
  { code: 'DDK', name: 'Devbhoomi Dwarka', nameGu: 'દેવભૂમિ દ્વારકા', zone: Zone.SAURASHTRA, lat: 22.2394, lng: 68.9678 },

  // Kutch
  { code: 'KCH', name: 'Kachchh', nameGu: 'કચ્છ', zone: Zone.KUTCH, lat: 23.7337, lng: 69.8597 },

  // North Gujarat
  { code: 'BNK', name: 'Banaskantha', nameGu: 'બનાસકાંઠા', zone: Zone.NORTH_GUJARAT, lat: 24.1722, lng: 72.4382 },
  { code: 'PTN', name: 'Patan', nameGu: 'પાટણ', zone: Zone.NORTH_GUJARAT, lat: 23.8493, lng: 72.1266 },
  { code: 'MSN', name: 'Mehsana', nameGu: 'મહેસાણા', zone: Zone.NORTH_GUJARAT, lat: 23.588, lng: 72.3693 },
  { code: 'SBK', name: 'Sabarkantha', nameGu: 'સાબરકાંઠા', zone: Zone.NORTH_GUJARAT, lat: 23.599, lng: 72.9634 },
  { code: 'ARV', name: 'Aravalli', nameGu: 'અરવલ્લી', zone: Zone.NORTH_GUJARAT, lat: 23.25, lng: 73.0333 },
  { code: 'GNR', name: 'Gandhinagar', nameGu: 'ગાંધીનગર', zone: Zone.NORTH_GUJARAT, lat: 23.2156, lng: 72.6369 },

  // Central Gujarat
  { code: 'AHD', name: 'Ahmedabad', nameGu: 'અમદાવાદ', zone: Zone.CENTRAL_GUJARAT, lat: 23.0225, lng: 72.5714 },
  { code: 'KHD', name: 'Kheda', nameGu: 'ખેડા', zone: Zone.CENTRAL_GUJARAT, lat: 22.7507, lng: 72.6847 },
  { code: 'AND', name: 'Anand', nameGu: 'આણંદ', zone: Zone.CENTRAL_GUJARAT, lat: 22.5645, lng: 72.9289 },
  { code: 'VAD', name: 'Vadodara', nameGu: 'વડોદરા', zone: Zone.CENTRAL_GUJARAT, lat: 22.3072, lng: 73.1812 },
  { code: 'PNM', name: 'Panchmahal', nameGu: 'પંચમહાલ', zone: Zone.CENTRAL_GUJARAT, lat: 22.7739, lng: 73.6143 },
  { code: 'DHD', name: 'Dahod', nameGu: 'દાહોદ', zone: Zone.CENTRAL_GUJARAT, lat: 22.8341, lng: 74.2591 },
  { code: 'MHS', name: 'Mahisagar', nameGu: 'મહીસાગર', zone: Zone.CENTRAL_GUJARAT, lat: 23.05, lng: 73.6 },
  { code: 'CHU', name: 'Chhota Udaipur', nameGu: 'છોટાઉદેપુર', zone: Zone.CENTRAL_GUJARAT, lat: 22.305, lng: 74.012 },

  // South Gujarat
  { code: 'SRT', name: 'Surat', nameGu: 'સુરત', zone: Zone.SOUTH_GUJARAT, lat: 21.1702, lng: 72.8311 },
  { code: 'BRC', name: 'Bharuch', nameGu: 'ભરૂચ', zone: Zone.SOUTH_GUJARAT, lat: 21.7051, lng: 72.9959 },
  { code: 'NRM', name: 'Narmada', nameGu: 'નર્મદા', zone: Zone.SOUTH_GUJARAT, lat: 21.87, lng: 73.5 },
  { code: 'TPI', name: 'Tapi', nameGu: 'તાપી', zone: Zone.SOUTH_GUJARAT, lat: 21.12, lng: 73.4 },
  { code: 'NVS', name: 'Navsari', nameGu: 'નવસારી', zone: Zone.SOUTH_GUJARAT, lat: 20.9467, lng: 72.952 },
  { code: 'VLS', name: 'Valsad', nameGu: 'વલસાડ', zone: Zone.SOUTH_GUJARAT, lat: 20.5992, lng: 72.9342 },
  { code: 'DNG', name: 'Dang', nameGu: 'ડાંગ', zone: Zone.SOUTH_GUJARAT, lat: 20.75, lng: 73.69 },
];

/** Viewport restriction for every map in the app. */
export const GUJARAT_BOUNDS = {
  south: 20.0,
  west: 68.0,
  north: 24.8,
  east: 74.6,
} as const;

export const GUJARAT_CENTER = { lat: 22.5, lng: 71.5 } as const;
export const GUJARAT_DEFAULT_ZOOM = 7;
