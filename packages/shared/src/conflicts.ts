import { ConflictStrategy } from './constants.js';

export const ENTITY_CONFLICT_STRATEGY: Record<string, ConflictStrategy> = {
  Contact: ConflictStrategy.LAST_WRITE_WINS,
  Material: ConflictStrategy.LAST_WRITE_WINS,
  MaterialCategory: ConflictStrategy.LAST_WRITE_WINS,
  MaterialPrice: ConflictStrategy.LAST_WRITE_WINS,
  CompanyPriceTable: ConflictStrategy.MANUAL,
  Purchase: ConflictStrategy.REQUIRES_REVERSAL,
  PurchaseItem: ConflictStrategy.REQUIRES_REVERSAL,
  Sale: ConflictStrategy.REQUIRES_REVERSAL,
  SaleItem: ConflictStrategy.REQUIRES_REVERSAL,
  StockMovement: ConflictStrategy.MOVEMENT_ONLY,
  StockProcessing: ConflictStrategy.MOVEMENT_ONLY,
  FinancialTransaction: ConflictStrategy.REQUIRES_REVERSAL,
  AccountPayable: ConflictStrategy.REQUIRES_REVERSAL,
  AccountReceivable: ConflictStrategy.REQUIRES_REVERSAL,
  CompanyCredit: ConflictStrategy.REQUIRES_REVERSAL,
  Weighing: ConflictStrategy.MANUAL,
  ApplicationSetting: ConflictStrategy.MANUAL,
};

export function getConflictStrategy(entityType: string): ConflictStrategy {
  return ENTITY_CONFLICT_STRATEGY[entityType] ?? ConflictStrategy.MANUAL;
}
