import type { CentralPrismaClient } from '@ferrogestor/database';
import type { SyncOperation } from '@ferrogestor/shared';

type Db = CentralPrismaClient;

function asNumber(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export async function applyEntityOp(
  db: Db,
  op: SyncOperation,
  userId: string,
): Promise<void> {
  if (op.action === 'DELETE') {
    await softDelete(db, op);
    return;
  }

  switch (op.entityType) {
    case 'Contact':
      await applyContact(db, op, userId);
      break;
    case 'Material':
      await applyMaterial(db, op, userId);
      break;
    case 'Sale':
      await applySale(db, op, userId);
      break;
    case 'SaleComment':
      await applySaleComment(db, op, userId);
      break;
    case 'ApplicationSetting':
      await applySetting(db, op, userId);
      break;
    case 'Purchase':
      await applyPurchase(db, op, userId);
      break;
    case 'CashRegister':
      await applyCashRegister(db, op, userId);
      break;
    case 'CashRegisterMovement':
      await applyCashMovement(db, op, userId);
      break;
    case 'PatioMovement':
      await applyPatioMovement(db, op, userId);
      break;
    case 'FinanceDay':
      await applyFinanceDay(db, op, userId);
      break;
  }
}

async function softDelete(db: Db, op: SyncOperation) {
  const now = new Date();
  const where = { id: op.entityId, companyId: op.companyId };
  const data = { deletedAt: now, syncStatus: 'SYNCED' as const, syncedAt: now };

  switch (op.entityType) {
    case 'Contact':
      await db.contact.updateMany({ where, data });
      break;
    case 'Material':
      await db.material.updateMany({ where, data });
      break;
    case 'Sale':
      await db.sale.updateMany({ where, data });
      break;
    case 'Purchase':
      await db.purchase.updateMany({ where, data });
      break;
    case 'CashRegister':
      await db.cashRegister.updateMany({ where, data });
      break;
    case 'CashRegisterMovement':
      await db.cashRegisterMovement.updateMany({ where, data });
      break;
    case 'PatioMovement':
      await db.stockMovement.updateMany({ where, data });
      break;
    case 'FinanceDay':
      await db.applicationSetting.updateMany({
        where: { companyId: op.companyId, key: `finance-day:${op.entityId}` },
        data,
      });
      break;
    default:
      break;
  }
}

function mapPayment(raw: unknown): 'CASH' | 'PIX' | 'OTHER' {
  const s = String(raw ?? 'DINHEIRO').toUpperCase();
  if (s === 'PIX') return 'PIX';
  if (s === 'DINHEIRO' || s === 'CASH') return 'CASH';
  return 'OTHER';
}

async function applyContact(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const types = Array.isArray(p.types) ? (p.types as string[]) : ['CLIENT'];
  const now = new Date();

  await db.contact.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      branchId: op.branchId ?? undefined,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      personType: (p.personType as 'INDIVIDUAL' | 'COMPANY') ?? 'INDIVIDUAL',
      legalName: str(p.legalName) ?? 'Sem nome',
      tradeName: str(p.tradeName),
      cpf: str(p.cpf),
      cnpj: str(p.cnpj),
      rg: str(p.rg),
      phonePrimary: str(p.phonePrimary),
      phoneSecondary: str(p.phoneSecondary),
      whatsapp: str(p.whatsapp),
      email: str(p.email),
      zipCode: str(p.zipCode),
      street: str(p.street),
      number: str(p.number),
      complement: str(p.complement),
      district: str(p.district),
      city: str(p.city),
      state: str(p.state),
      notes: str(p.notes),
      pixKey: str(p.pixKey),
      contactPersonName: str(p.contactPersonName),
      active: p.active !== false,
      createdAt: p.createdAt ? new Date(String(p.createdAt)) : now,
      updatedAt: p.updatedAt ? new Date(String(p.updatedAt)) : now,
    },
    update: {
      branchId: op.branchId ?? undefined,
      deviceId: op.deviceId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      personType: (p.personType as 'INDIVIDUAL' | 'COMPANY') ?? 'INDIVIDUAL',
      legalName: str(p.legalName) ?? 'Sem nome',
      tradeName: str(p.tradeName),
      cpf: str(p.cpf),
      cnpj: str(p.cnpj),
      rg: str(p.rg),
      phonePrimary: str(p.phonePrimary),
      phoneSecondary: str(p.phoneSecondary),
      whatsapp: str(p.whatsapp),
      email: str(p.email),
      zipCode: str(p.zipCode),
      street: str(p.street),
      number: str(p.number),
      complement: str(p.complement),
      district: str(p.district),
      city: str(p.city),
      state: str(p.state),
      notes: str(p.notes),
      pixKey: str(p.pixKey),
      contactPersonName: str(p.contactPersonName),
      active: p.active !== false,
      updatedAt: p.updatedAt ? new Date(String(p.updatedAt)) : now,
      deletedAt: null,
    },
  });

  const typeRows = await db.contactType.findMany({
    where: { code: { in: types } },
  });
  await db.contactContactType.deleteMany({ where: { contactId: op.entityId } });
  for (const t of typeRows) {
    await db.contactContactType.create({
      data: { contactId: op.entityId, typeId: t.id },
    });
  }
}

async function applyMaterial(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const now = new Date();
  const code = str(p.code) ?? `M-${op.entityId.slice(0, 8).toUpperCase()}`;

  await db.material.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      branchId: op.branchId ?? undefined,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      code,
      name: str(p.name) ?? 'Material',
      unit: (p.unit as 'KG' | 'TON' | 'UNIT') ?? 'KG',
      defaultBuyPrice: asNumber(p.buyPrice ?? p.defaultBuyPrice, 0),
      defaultSellPrice: asNumber(p.sellPrice ?? p.defaultSellPrice, 0),
      photoPath: str(p.photoPath),
      active: p.active !== false,
    },
    update: {
      deviceId: op.deviceId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      name: str(p.name) ?? 'Material',
      unit: (p.unit as 'KG' | 'TON' | 'UNIT') ?? 'KG',
      defaultBuyPrice: asNumber(p.buyPrice ?? p.defaultBuyPrice, 0),
      defaultSellPrice: asNumber(p.sellPrice ?? p.defaultSellPrice, 0),
      photoPath: str(p.photoPath),
      active: p.active !== false,
      deletedAt: null,
    },
  });
}

async function applySale(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const now = new Date();
  const branchId = op.branchId ?? p.branchId;
  if (!branchId || typeof branchId !== 'string') {
    throw new Error('Sale exige branchId');
  }

  const paymentRaw = String(p.paymentMethod ?? 'DINHEIRO').toUpperCase();
  const paymentMethod = paymentRaw === 'PIX' ? 'PIX' : 'CASH';

  await db.sale.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      branchId,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      documentNumber: str(p.documentNumber) ?? `V-${op.entityId.slice(0, 6)}`,
      soldAt: p.soldAt ? new Date(String(p.soldAt)) : now,
      status: 'FINALIZED',
      paymentMethod,
      notes: [str(p.notes), str(p.customerName), str(p.discountReason)]
        .filter(Boolean)
        .join(' · ') || null,
      grossTotal: asNumber(p.grossTotal),
      discountTotal: asNumber(p.discountAmount ?? p.discountTotal),
      netTotal: asNumber(p.netTotal),
    },
    update: {
      deviceId: op.deviceId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      documentNumber: str(p.documentNumber) ?? undefined,
      soldAt: p.soldAt ? new Date(String(p.soldAt)) : undefined,
      status: 'FINALIZED',
      paymentMethod,
      notes: [str(p.notes), str(p.customerName), str(p.discountReason)]
        .filter(Boolean)
        .join(' · ') || null,
      grossTotal: asNumber(p.grossTotal),
      discountTotal: asNumber(p.discountAmount ?? p.discountTotal),
      netTotal: asNumber(p.netTotal),
      deletedAt: null,
    },
  });

  const items = Array.isArray(p.items) ? p.items : [];
  if (items.length > 0 && op.action === 'CREATE') {
    for (const raw of items as Record<string, unknown>[]) {
      const itemId = str(raw.id) ?? `${op.entityId}-${str(raw.materialId)?.slice(0, 8)}`;
      const materialId = str(raw.materialId);
      if (!materialId) continue;
      await db.saleItem.upsert({
        where: { id: itemId },
        create: {
          id: itemId,
          companyId: op.companyId,
          branchId,
          deviceId: op.deviceId,
          saleId: op.entityId,
          materialId,
          weight: asNumber(raw.weight, 0),
          unitPrice: asNumber(raw.unitPrice),
          lineTotal: asNumber(raw.lineTotal),
          syncStatus: 'SYNCED',
          syncedAt: now,
          version: 1,
        },
        update: {
          weight: asNumber(raw.weight, 0),
          unitPrice: asNumber(raw.unitPrice),
          lineTotal: asNumber(raw.lineTotal),
          syncStatus: 'SYNCED',
          syncedAt: now,
        },
      });
    }
  }
}

async function applySaleComment(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const saleId = str(p.saleId);
  if (!saleId) return;
  const now = new Date();

  await db.saleComment.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      branchId: op.branchId ?? undefined,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      saleId,
      body: str(p.body) ?? '',
      authorName: str(p.authorName),
      createdAt: p.createdAt ? new Date(String(p.createdAt)) : now,
    },
    update: {
      body: str(p.body) ?? '',
      authorName: str(p.authorName),
      syncStatus: 'SYNCED',
      syncedAt: now,
    },
  });
}

async function applySetting(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const key = str(p.key);
  if (!key) return;
  const now = new Date();

  await db.applicationSetting.upsert({
    where: {
      companyId_key: { companyId: op.companyId, key },
    },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      key,
      value: p.value ?? p,
    },
    update: {
      value: p.value ?? p,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
    },
  });
}

async function applyPurchase(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const now = new Date();
  const branchId = op.branchId ?? p.branchId;
  if (!branchId || typeof branchId !== 'string') {
    throw new Error('Purchase exige branchId');
  }

  await db.purchase.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      branchId,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      documentNumber: str(p.documentNumber) ?? `C-${op.entityId.slice(0, 6)}`,
      purchasedAt: p.purchasedAt ? new Date(String(p.purchasedAt)) : now,
      status: 'FINALIZED',
      paymentMethod: mapPayment(p.paymentMethod),
      paymentStatus: 'PAID',
      notes: [str(p.notes), str(p.supplierName), str(p.documentId)].filter(Boolean).join(' · ') || null,
      netTotal: asNumber(p.netTotal),
      paidAmount: asNumber(p.amountPaid ?? p.netTotal),
      pendingAmount: 0,
    },
    update: {
      deviceId: op.deviceId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      netTotal: asNumber(p.netTotal),
      paidAmount: asNumber(p.amountPaid ?? p.netTotal),
      notes: [str(p.notes), str(p.supplierName), str(p.documentId)].filter(Boolean).join(' · ') || null,
      deletedAt: null,
    },
  });

  const items = Array.isArray(p.items) ? p.items : [];
  for (const raw of items as Record<string, unknown>[]) {
    const itemId = str(raw.id) ?? `${op.entityId}-${str(raw.materialId)?.slice(0, 8)}`;
    const materialId = str(raw.materialId);
    if (!materialId) continue;
    await db.purchaseItem.upsert({
      where: { id: itemId },
      create: {
        id: itemId,
        companyId: op.companyId,
        branchId,
        deviceId: op.deviceId,
        purchaseId: op.entityId,
        materialId,
        netWeight: asNumber(raw.weight, 0),
        unitPrice: asNumber(raw.unitPrice),
        lineTotal: asNumber(raw.lineTotal),
        syncStatus: 'SYNCED',
        syncedAt: now,
        version: 1,
      },
      update: {
        netWeight: asNumber(raw.weight, 0),
        unitPrice: asNumber(raw.unitPrice),
        lineTotal: asNumber(raw.lineTotal),
        syncStatus: 'SYNCED',
        syncedAt: now,
      },
    });
  }
}

async function applyCashRegister(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const now = new Date();

  await db.cashRegister.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      branchId: op.branchId ?? undefined,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      openedByUserId: userId,
      openedAt: p.openedAt ? new Date(String(p.openedAt)) : now,
      closedAt: p.closedAt ? new Date(String(p.closedAt)) : undefined,
      openingBalance: asNumber(p.openingBalance),
      expectedBalance: p.expectedBalance != null ? asNumber(p.expectedBalance) : undefined,
      informedBalance: p.informedBalance != null ? asNumber(p.informedBalance) : undefined,
      difference: p.difference != null ? asNumber(p.difference) : undefined,
      differenceReason: str(p.differenceReason),
      notes: str(p.notes),
      status: str(p.status) ?? 'OPEN',
    },
    update: {
      deviceId: op.deviceId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      closedAt: p.closedAt ? new Date(String(p.closedAt)) : undefined,
      expectedBalance: p.expectedBalance != null ? asNumber(p.expectedBalance) : undefined,
      informedBalance: p.informedBalance != null ? asNumber(p.informedBalance) : undefined,
      difference: p.difference != null ? asNumber(p.difference) : undefined,
      differenceReason: str(p.differenceReason),
      notes: str(p.notes),
      status: str(p.status) ?? undefined,
      deletedAt: null,
    },
  });
}

async function applyCashMovement(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const cashRegisterId = str(p.cashRegisterId);
  if (!cashRegisterId) return;
  const now = new Date();

  if (op.action === 'DELETE') {
    await db.cashRegisterMovement.updateMany({
      where: { id: op.entityId, companyId: op.companyId },
      data: { deletedAt: now, syncStatus: 'SYNCED', syncedAt: now },
    });
    return;
  }

  await db.cashRegisterMovement.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      cashRegisterId,
      movementType: str(p.movementType) ?? 'ENTRADA',
      amount: asNumber(p.amount),
      paymentMethod: mapPayment(p.paymentMethod),
      description: str(p.description),
      sourceDocumentType: str(p.refType),
      sourceDocumentId: str(p.refId),
      movedAt: p.movedAt ? new Date(String(p.movedAt)) : now,
    },
    update: {
      movementType: str(p.movementType) ?? undefined,
      amount: asNumber(p.amount),
      paymentMethod: mapPayment(p.paymentMethod),
      description: str(p.description),
      syncStatus: 'SYNCED',
      syncedAt: now,
      deletedAt: null,
    },
  });
}

async function applyPatioMovement(db: Db, op: SyncOperation, userId: string) {
  const p = op.payload as Record<string, unknown>;
  const now = new Date();
  const kind = str(p.kind);
  const sourceType = str(p.sourceType);
  let movementType: 'PURCHASE_IN' | 'SALE_OUT' | 'ADJUSTMENT_IN' = 'ADJUSTMENT_IN';
  if (kind === 'IN' && sourceType === 'PURCHASE') movementType = 'PURCHASE_IN';
  if (kind === 'OUT' && sourceType === 'SALE') movementType = 'SALE_OUT';

  if (op.action === 'DELETE') {
    await db.stockMovement.updateMany({
      where: { id: op.entityId, companyId: op.companyId },
      data: { deletedAt: now, syncStatus: 'SYNCED', syncedAt: now },
    });
    return;
  }

  const materialId = str(p.materialId);
  if (!materialId) return;

  await db.stockMovement.upsert({
    where: { id: op.entityId },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      branchId: op.branchId ?? undefined,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      materialId,
      movementType,
      weight: asNumber(p.weight, 0),
      sourceDocumentType: sourceType ?? undefined,
      sourceDocumentId: str(p.sourceId),
      notes: str(p.notes) ?? str(p.materialName),
      movedAt: p.at ? new Date(String(p.at)) : now,
    },
    update: {
      movementType,
      weight: asNumber(p.weight, 0),
      syncStatus: 'SYNCED',
      syncedAt: now,
      deletedAt: null,
    },
  });
}

async function applyFinanceDay(db: Db, op: SyncOperation, userId: string) {
  const key = `finance-day:${op.entityId}`;
  const now = new Date();

  if (op.action === 'DELETE') {
    await db.applicationSetting.updateMany({
      where: { companyId: op.companyId, key },
      data: { deletedAt: now, syncStatus: 'SYNCED', syncedAt: now },
    });
    return;
  }

  await db.applicationSetting.upsert({
    where: { companyId_key: { companyId: op.companyId, key } },
    create: {
      id: op.entityId,
      companyId: op.companyId,
      deviceId: op.deviceId,
      createdByUserId: userId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      originOperationId: op.originOperationId,
      key,
      value: op.payload as object,
    },
    update: {
      value: op.payload as object,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: now,
      deletedAt: null,
    },
  });
}
