export const APP_NAME = 'Búfalo Sucata Gestor';
export const APP_COMPANY = 'Búfalo Sucatas';
export const APP_VERSION = '0.1.28';

export const SyncStatus = {
  SYNCED: 'SYNCED',
  PENDING: 'PENDING',
  SYNCING: 'SYNCING',
  CONFLICT: 'CONFLICT',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const ContactKind = {
  CLIENT: 'CLIENT',
  SUPPLIER: 'SUPPLIER',
  BUYER_COMPANY: 'BUYER_COMPANY',
  CARRIER: 'CARRIER',
  EMPLOYEE: 'EMPLOYEE',
  PARTNER: 'PARTNER',
  OTHER: 'OTHER',
} as const;

export type ContactKind = (typeof ContactKind)[keyof typeof ContactKind];

export const MaterialUnit = {
  KG: 'KG',
  TON: 'TON',
  UNIT: 'UNIT',
  BAG: 'BAG',
  BOX: 'BOX',
  LOT: 'LOT',
  METER: 'METER',
  OTHER: 'OTHER',
} as const;

export type MaterialUnit = (typeof MaterialUnit)[keyof typeof MaterialUnit];

export const PurchaseStatus = {
  DRAFT: 'DRAFT',
  AWAITING_WEIGHING: 'AWAITING_WEIGHING',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  FINALIZED: 'FINALIZED',
  CANCELLED: 'CANCELLED',
  REVERSED: 'REVERSED',
} as const;

export type PurchaseStatus = (typeof PurchaseStatus)[keyof typeof PurchaseStatus];

export const SaleStatus = {
  QUOTE: 'QUOTE',
  ORDER: 'ORDER',
  SEPARATION: 'SEPARATION',
  AWAITING_PICKUP: 'AWAITING_PICKUP',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  FINALIZED: 'FINALIZED',
  CANCELLED: 'CANCELLED',
  REVERSED: 'REVERSED',
} as const;

export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const StockMovementType = {
  PURCHASE_IN: 'PURCHASE_IN',
  RETURN_IN: 'RETURN_IN',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  SALE_OUT: 'SALE_OUT',
  LOSS_OUT: 'LOSS_OUT',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  REVERSAL: 'REVERSAL',
  INVENTORY: 'INVENTORY',
  PROCESSING: 'PROCESSING',
} as const;

export type StockMovementType =
  (typeof StockMovementType)[keyof typeof StockMovementType];

export const FinancialStatus = {
  PENDING: 'PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  REVERSED: 'REVERSED',
} as const;

export type FinancialStatus =
  (typeof FinancialStatus)[keyof typeof FinancialStatus];

export const ConflictStrategy = {
  LAST_WRITE_WINS: 'LAST_WRITE_WINS',
  MANUAL: 'MANUAL',
  MOVEMENT_ONLY: 'MOVEMENT_ONLY',
  REQUIRES_REVERSAL: 'REQUIRES_REVERSAL',
} as const;

export type ConflictStrategy =
  (typeof ConflictStrategy)[keyof typeof ConflictStrategy];

export const ROLE_CODES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'BUYER',
  'SELLER',
  'SCALE_OPERATOR',
  'STOCKKEEPER',
  'FINANCE',
  'READONLY',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];
