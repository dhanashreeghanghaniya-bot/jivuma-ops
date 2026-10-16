import { RetailerCategory, TownType } from '@prisma/client';

export interface TownSeed {
  key: string;
  districtCode: string;
  name: string;
  lat: number;
  lng: number;
  type: TownType;
  population?: number;
}

/** Covered districts get a full town list; lead-only districts get their main town. */
export const TOWNS: TownSeed[] = [
  // Rajkot — covered
  { key: 'RJT_RAJKOT', districtCode: 'RJT', name: 'Rajkot', lat: 22.3039, lng: 70.8022, type: TownType.CITY, population: 1390933 },
  { key: 'RJT_GONDAL', districtCode: 'RJT', name: 'Gondal', lat: 21.9612, lng: 70.8027, type: TownType.TOWN, population: 112035 },
  { key: 'RJT_JETPUR', districtCode: 'RJT', name: 'Jetpur', lat: 21.7549, lng: 70.6222, type: TownType.TOWN, population: 118302 },
  { key: 'RJT_DHORAJI', districtCode: 'RJT', name: 'Dhoraji', lat: 21.7337, lng: 70.45, type: TownType.TOWN, population: 83792 },

  // Junagadh — covered
  { key: 'JNG_JUNAGADH', districtCode: 'JNG', name: 'Junagadh', lat: 21.5222, lng: 70.4579, type: TownType.CITY, population: 320250 },
  { key: 'JNG_KESHOD', districtCode: 'JNG', name: 'Keshod', lat: 21.3, lng: 70.25, type: TownType.TOWN, population: 76000 },
  { key: 'JNG_MANAVADAR', districtCode: 'JNG', name: 'Manavadar', lat: 21.5, lng: 70.1333, type: TownType.TOWN, population: 45000 },

  // Jamnagar — covered
  { key: 'JMN_JAMNAGAR', districtCode: 'JMN', name: 'Jamnagar', lat: 22.4707, lng: 70.0577, type: TownType.CITY, population: 600943 },
  { key: 'JMN_DHROL', districtCode: 'JMN', name: 'Dhrol', lat: 22.5667, lng: 70.4167, type: TownType.TOWN, population: 30000 },
  { key: 'JMN_KALAVAD', districtCode: 'JMN', name: 'Kalavad', lat: 22.2167, lng: 70.3833, type: TownType.TOWN, population: 28000 },

  // Lead-only districts
  { key: 'PRB_PORBANDAR', districtCode: 'PRB', name: 'Porbandar', lat: 21.6417, lng: 69.6293, type: TownType.CITY, population: 152760 },
  { key: 'PRB_RANAVAV', districtCode: 'PRB', name: 'Ranavav', lat: 21.6833, lng: 69.75, type: TownType.TOWN, population: 32000 },
  { key: 'AMR_AMRELI', districtCode: 'AMR', name: 'Amreli', lat: 21.6032, lng: 71.2221, type: TownType.CITY, population: 117967 },
  { key: 'AMR_SAVARKUNDLA', districtCode: 'AMR', name: 'Savarkundla', lat: 21.3333, lng: 71.3, type: TownType.TOWN, population: 78000 },
  { key: 'MRB_MORBI', districtCode: 'MRB', name: 'Morbi', lat: 22.8173, lng: 70.837, type: TownType.CITY, population: 210451 },
  { key: 'MRB_WANKANER', districtCode: 'MRB', name: 'Wankaner', lat: 22.6128, lng: 70.945, type: TownType.TOWN, population: 54000 },

  // Bhavnagar — super stockist appointed, no distributor yet
  { key: 'BVN_BHAVNAGAR', districtCode: 'BVN', name: 'Bhavnagar', lat: 21.7645, lng: 72.1519, type: TownType.CITY, population: 605882 },

  // Head office
  { key: 'AHD_AHMEDABAD', districtCode: 'AHD', name: 'Ahmedabad', lat: 23.0225, lng: 72.5714, type: TownType.CITY, population: 5570585 },
];

export interface ProductSeed {
  key: string;
  name: string;
  sku: string;
  category: string;
  packSize: string;
  unitsPerCase: number;
  mrp: number;
  ssPrice: number;
  distributorPrice: number;
  retailerPrice: number;
}

export const PRODUCTS: ProductSeed[] = [
  { key: 'NMX200', name: 'Juma Namkeen Mix', sku: 'JF-NMX-200', category: 'Namkeen', packSize: '200 g', unitsPerCase: 24, mrp: 50, ssPrice: 33.5, distributorPrice: 36, retailerPrice: 40 },
  { key: 'ABJ150', name: 'Juma Aloo Bhujia', sku: 'JF-ABJ-150', category: 'Namkeen', packSize: '150 g', unitsPerCase: 30, mrp: 40, ssPrice: 26.5, distributorPrice: 28.5, retailerPrice: 32 },
  { key: 'SPD250', name: 'Juma Soan Papdi', sku: 'JF-SPD-250', category: 'Sweets', packSize: '250 g', unitsPerCase: 20, mrp: 90, ssPrice: 61, distributorPrice: 66, retailerPrice: 73 },
  { key: 'KKM200', name: 'Juma Khakhra Methi', sku: 'JF-KKM-200', category: 'Snacks', packSize: '200 g', unitsPerCase: 24, mrp: 60, ssPrice: 40, distributorPrice: 43, retailerPrice: 48 },
  { key: 'MPN180', name: 'Juma Masala Peanuts', sku: 'JF-MPN-180', category: 'Namkeen', packSize: '180 g', unitsPerCase: 30, mrp: 45, ssPrice: 30, distributorPrice: 32.5, retailerPrice: 36 },
];

export interface SuperStockistSeed {
  key: string;
  firmName: string;
  ownerName: string;
  phone: string;
  altPhone: string;
  email: string;
  gstin: string;
  address: string;
  townKey: string;
  districtCodes: string[];
}

export const SUPER_STOCKISTS: SuperStockistSeed[] = [
  {
    key: 'SS_RJT',
    firmName: 'Shree Krishna Agency',
    ownerName: 'Mahesh Vyas',
    phone: '+919800000101',
    altPhone: '+919800000102',
    email: 'mahesh@shreekrishnaagency.example',
    gstin: '24AAACS1234A1Z5',
    address: 'Plot 14, Bhaktinagar Industrial Estate, Rajkot',
    townKey: 'RJT_RAJKOT',
    districtCodes: ['RJT'],
  },
  {
    key: 'SS_JNG',
    firmName: 'Girnar Distributors',
    ownerName: 'Bhavesh Joshi',
    phone: '+919800000201',
    altPhone: '+919800000202',
    email: 'bhavesh@girnardist.example',
    gstin: '24AAACG5678B1Z3',
    address: 'Opp. Bus Station, Moti Baug Road, Junagadh',
    townKey: 'JNG_JUNAGADH',
    districtCodes: ['JNG'],
  },
  {
    key: 'SS_JMN',
    firmName: 'Halar Sales Corporation',
    ownerName: 'Nitin Thakkar',
    phone: '+919800000301',
    altPhone: '+919800000302',
    email: 'nitin@halarsales.example',
    gstin: '24AAACH9012C1Z1',
    address: 'Shop 7, Indira Marg, Jamnagar',
    townKey: 'JMN_JAMNAGAR',
    districtCodes: ['JMN'],
  },
  // Appointed but no distributor underneath yet — this is what makes Bhavnagar
  // show as "SS only" on the coverage map.
  {
    key: 'SS_BVN',
    firmName: 'Takhteshwar Agency',
    ownerName: 'Hardik Rana',
    phone: '+919800000401',
    altPhone: '+919800000402',
    email: 'hardik@takhteshwaragency.example',
    gstin: '24AAACT3456D1Z8',
    address: 'Waghawadi Road, Bhavnagar',
    townKey: 'BVN_BHAVNAGAR',
    districtCodes: ['BVN'],
  },
];

export interface DistributorSeed {
  key: string;
  firmName: string;
  ownerName: string;
  phone: string;
  altPhone: string;
  gstin: string;
  address: string;
  townKey: string;
  superStockistKey: string;
  coveredTownKeys: string[];
  creditLimit: number;
  creditDays: number;
}

export const DISTRIBUTORS: DistributorSeed[] = [
  {
    key: 'DS_RJT',
    firmName: 'Patel Traders',
    ownerName: 'Jayesh Patel',
    phone: '+919811000101',
    altPhone: '+919811000102',
    gstin: '24AAAPP1111D1Z9',
    address: 'Gondal Road, Near Kothariya Chokdi, Rajkot',
    townKey: 'RJT_RAJKOT',
    superStockistKey: 'SS_RJT',
    coveredTownKeys: ['RJT_RAJKOT', 'RJT_GONDAL', 'RJT_JETPUR', 'RJT_DHORAJI'],
    creditLimit: 500000,
    creditDays: 21,
  },
  {
    key: 'DS_JNG',
    firmName: 'Somnath Enterprise',
    ownerName: 'Dinesh Solanki',
    phone: '+919811000201',
    altPhone: '+919811000202',
    gstin: '24AAASE2222E1Z7',
    address: 'Station Road, Junagadh',
    townKey: 'JNG_JUNAGADH',
    superStockistKey: 'SS_JNG',
    coveredTownKeys: ['JNG_JUNAGADH', 'JNG_KESHOD', 'JNG_MANAVADAR'],
    creditLimit: 350000,
    creditDays: 15,
  },
  {
    key: 'DS_JMN',
    firmName: 'Sagar Marketing',
    ownerName: 'Kalpesh Mehta',
    phone: '+919811000301',
    altPhone: '+919811000302',
    gstin: '24AAASM3333F1Z4',
    address: 'Lal Bungalow Road, Jamnagar',
    townKey: 'JMN_JAMNAGAR',
    superStockistKey: 'SS_JMN',
    coveredTownKeys: ['JMN_JAMNAGAR', 'JMN_DHROL', 'JMN_KALAVAD'],
    creditLimit: 400000,
    creditDays: 21,
  },
];

export interface RetailerSeed {
  key: string;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  townKey: string;
  distributorKey: string;
  category: RetailerCategory;
  isVerified: boolean;
}

export const RETAILERS: RetailerSeed[] = [
  // Rajkot
  { key: 'RT_RJT_1', shopName: 'Shree Kirana Store', ownerName: 'Ashok Dave', phone: '+919822000101', address: 'Yagnik Road, Rajkot', townKey: 'RJT_RAJKOT', distributorKey: 'DS_RJT', category: RetailerCategory.KIRANA, isVerified: true },
  { key: 'RT_RJT_2', shopName: 'Big Bazaar Super', ownerName: 'Pankaj Shah', phone: '+919822000102', address: 'Kalawad Road, Rajkot', townKey: 'RJT_RAJKOT', distributorKey: 'DS_RJT', category: RetailerCategory.SUPERMARKET, isVerified: true },
  { key: 'RT_RJT_3', shopName: 'Gondal Provision', ownerName: 'Hitesh Bhatt', phone: '+919822000103', address: 'Main Bazaar, Gondal', townKey: 'RJT_GONDAL', distributorKey: 'DS_RJT', category: RetailerCategory.KIRANA, isVerified: true },
  { key: 'RT_RJT_4', shopName: 'Jetpur General Stores', ownerName: 'Rajesh Kansara', phone: '+919822000104', address: 'Derdi Road, Jetpur', townKey: 'RJT_JETPUR', distributorKey: 'DS_RJT', category: RetailerCategory.GENERAL, isVerified: true },
  { key: 'RT_RJT_5', shopName: 'Hotel Rasoi', ownerName: 'Vipul Trivedi', phone: '+919822000105', address: 'Dhoraji Main Road', townKey: 'RJT_DHORAJI', distributorKey: 'DS_RJT', category: RetailerCategory.HORECA, isVerified: false },

  // Junagadh
  { key: 'RT_JNG_1', shopName: 'Girnar Kirana', ownerName: 'Sanjay Pandya', phone: '+919822000201', address: 'Talav Gate, Junagadh', townKey: 'JNG_JUNAGADH', distributorKey: 'DS_JNG', category: RetailerCategory.KIRANA, isVerified: true },
  { key: 'RT_JNG_2', shopName: 'Mahadev Super Market', ownerName: 'Paresh Kotecha', phone: '+919822000202', address: 'MG Road, Junagadh', townKey: 'JNG_JUNAGADH', distributorKey: 'DS_JNG', category: RetailerCategory.SUPERMARKET, isVerified: true },
  { key: 'RT_JNG_3', shopName: 'Keshod Provision Store', ownerName: 'Alpesh Vora', phone: '+919822000203', address: 'Bus Stand Road, Keshod', townKey: 'JNG_KESHOD', distributorKey: 'DS_JNG', category: RetailerCategory.KIRANA, isVerified: true },
  { key: 'RT_JNG_4', shopName: 'Manavadar General', ownerName: 'Chirag Nakum', phone: '+919822000204', address: 'Market Yard, Manavadar', townKey: 'JNG_MANAVADAR', distributorKey: 'DS_JNG', category: RetailerCategory.GENERAL, isVerified: false },

  // Jamnagar
  { key: 'RT_JMN_1', shopName: 'Halar Kirana Bhandar', ownerName: 'Mitesh Gandhi', phone: '+919822000301', address: 'Bedi Gate, Jamnagar', townKey: 'JMN_JAMNAGAR', distributorKey: 'DS_JMN', category: RetailerCategory.KIRANA, isVerified: true },
  { key: 'RT_JMN_2', shopName: 'City Mart', ownerName: 'Ravi Chauhan', phone: '+919822000302', address: 'Summair Club Road, Jamnagar', townKey: 'JMN_JAMNAGAR', distributorKey: 'DS_JMN', category: RetailerCategory.SUPERMARKET, isVerified: true },
  { key: 'RT_JMN_3', shopName: 'Dhrol Provision', ownerName: 'Jignesh Rathod', phone: '+919822000303', address: 'Station Road, Dhrol', townKey: 'JMN_DHROL', distributorKey: 'DS_JMN', category: RetailerCategory.KIRANA, isVerified: true },
  { key: 'RT_JMN_4', shopName: 'Kalavad Snacks Corner', ownerName: 'Bhavin Doshi', phone: '+919822000304', address: 'Chowk Bazaar, Kalavad', townKey: 'JMN_KALAVAD', distributorKey: 'DS_JMN', category: RetailerCategory.OTHER, isVerified: true },
];
