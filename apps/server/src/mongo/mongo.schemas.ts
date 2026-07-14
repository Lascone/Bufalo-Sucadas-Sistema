import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

const syncReceiptSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    originOperationId: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    result: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { collection: 'sync_receipts', timestamps: false },
);

const syncEntitySchema = new Schema(
  {
    _id: { type: String, required: true },
    companyId: { type: String, required: true, index: true },
    branchId: { type: String },
    deviceId: { type: String },
    entityType: { type: String, required: true, index: true },
    version: { type: Number, required: true, default: 1 },
    payload: { type: Schema.Types.Mixed, required: true },
    createdByUserId: { type: String },
    deletedAt: { type: Date },
    originOperationId: { type: String },
    updatedAt: { type: Date, default: Date.now, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'sync_entities', timestamps: false },
);

syncEntitySchema.index({ companyId: 1, entityType: 1, updatedAt: 1 });

const syncQueueSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    companyId: { type: String, required: true, index: true },
    branchId: { type: String },
    deviceId: { type: String, required: true },
    originOperationId: { type: String, required: true, unique: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    action: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    version: { type: Number, required: true },
    status: { type: String, default: 'SYNCED', index: true },
    occurredAt: { type: Date, required: true },
    updatedAt: { type: Date, default: Date.now, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'sync_queue', timestamps: false },
);

const syncConflictSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    companyId: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    originOperationId: { type: String },
    localPayload: { type: Schema.Types.Mixed },
    serverPayload: { type: Schema.Types.Mixed },
    localVersion: { type: Number, required: true },
    serverVersion: { type: Number, required: true },
    localUserId: { type: String },
    serverUserId: { type: String },
    localUpdatedAt: { type: Date },
    serverUpdatedAt: { type: Date },
    status: { type: String, default: 'PENDING', index: true },
    resolution: { type: String },
    justification: { type: String },
    resolvedByUserId: { type: String },
    resolvedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'sync_conflicts', timestamps: false },
);

const syncLogSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    companyId: { type: String, index: true },
    deviceId: { type: String },
    direction: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    pushedCount: { type: Number, default: 0 },
    pulledCount: { type: Number, default: 0 },
    conflictCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    success: { type: Boolean, default: false },
    details: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'sync_logs', timestamps: false },
);

export type SyncReceiptDoc = InferSchemaType<typeof syncReceiptSchema> & { _id: string };
export type SyncEntityDoc = InferSchemaType<typeof syncEntitySchema> & { _id: string };
export type SyncQueueDoc = InferSchemaType<typeof syncQueueSchema> & { _id: string };
export type SyncConflictDoc = InferSchemaType<typeof syncConflictSchema> & { _id: string };
export type SyncLogDoc = InferSchemaType<typeof syncLogSchema> & { _id: string };

export const SyncReceiptModel =
  (models.SyncReceipt as Model<SyncReceiptDoc>) ||
  model<SyncReceiptDoc>('SyncReceipt', syncReceiptSchema);

export const SyncEntityModel =
  (models.SyncEntity as Model<SyncEntityDoc>) ||
  model<SyncEntityDoc>('SyncEntity', syncEntitySchema);

export const SyncQueueModel =
  (models.SyncQueue as Model<SyncQueueDoc>) ||
  model<SyncQueueDoc>('SyncQueue', syncQueueSchema);

export const SyncConflictModel =
  (models.SyncConflict as Model<SyncConflictDoc>) ||
  model<SyncConflictDoc>('SyncConflict', syncConflictSchema);

export const SyncLogModel =
  (models.SyncLog as Model<SyncLogDoc>) ||
  model<SyncLogDoc>('SyncLog', syncLogSchema);
