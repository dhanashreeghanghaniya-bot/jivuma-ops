import type { PartnerStatus, RetailerCategory, TownType } from '../enums';

interface TownRef {
  id: string;
  name: string;
  type?: TownType;
  district: { id: string; name: string; code: string };
}

export interface SuperStockistListItem {
  id: string;
  firmName: string;
  ownerName: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  gstin: string | null;
  address: string;
  status: PartnerStatus;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  onboardedAt: string;
  town: TownRef;
  coveredDistricts: { id: string; name: string; code: string }[];
  counts: { distributors: number; orders: number };
  lastOrderAt: string | null;
}

export interface DistributorListItem {
  id: string;
  firmName: string;
  ownerName: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  gstin: string | null;
  address: string;
  status: PartnerStatus;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  onboardedAt: string;
  creditLimit: string | null;
  creditDays: number | null;
  town: TownRef;
  superStockist: { id: string; firmName: string; phone: string };
  coveredTowns: { id: string; name: string }[];
  counts: { retailers: number; orders: number };
  lastOrderAt: string | null;
}

export interface RetailerListItem {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  category: RetailerCategory;
  lat: number;
  lng: number;
  photoUrl: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  town: TownRef;
  distributor: { id: string; firmName: string; phone: string };
  addedBySalesman: { id: string; name: string } | null;
  counts: { visits: number; orders: number };
  lastOrderAt: string | null;
}
