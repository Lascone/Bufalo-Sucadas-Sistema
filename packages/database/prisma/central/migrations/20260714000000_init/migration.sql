-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'PENDING', 'SYNCING', 'CONFLICT', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('CLIENT', 'SUPPLIER', 'BUYER_COMPANY', 'CARRIER', 'EMPLOYEE', 'PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialUnit" AS ENUM ('KG', 'TON', 'UNIT', 'BAG', 'BOX', 'LOT', 'METER', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'AWAITING_WEIGHING', 'AWAITING_PAYMENT', 'FINALIZED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('QUOTE', 'ORDER', 'SEPARATION', 'AWAITING_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'FINALIZED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_IN', 'RETURN_IN', 'ADJUSTMENT_IN', 'SALE_OUT', 'LOSS_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'REVERSAL', 'INVENTORY', 'PROCESSING');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD', 'DEBIT_CARD', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateEnum
CREATE TYPE "ConflictResolution" AS ENUM ('KEEP_LOCAL', 'KEEP_SERVER', 'MERGE', 'PENDING');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "documentCnpj" TEXT,
    "stateRegistration" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressDistrict" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "logoPath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "friendlyName" TEXT NOT NULL,
    "deviceSecretHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "appVersion" TEXT,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "roleId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "personType" "PersonType" NOT NULL DEFAULT 'INDIVIDUAL',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "rg" TEXT,
    "stateRegistration" TEXT,
    "phonePrimary" TEXT,
    "phoneSecondary" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "creditLimit" DECIMAL(18,2),
    "preferredPayment" "PaymentMethod",
    "pixKey" TEXT,
    "bankInfo" TEXT,
    "contactPersonName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_contact_types" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,

    CONSTRAINT "contact_contact_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_categories" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT,
    "unit" "MaterialUnit" NOT NULL DEFAULT 'KG',
    "minWeight" DECIMAL(18,3),
    "defaultBuyPrice" DECIMAL(18,4),
    "defaultSellPrice" DECIMAL(18,4),
    "minStock" DECIMAL(18,3),
    "maxStock" DECIMAL(18,3),
    "warehouseLocation" TEXT,
    "photoPath" TEXT,
    "qualityVariant" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_prices" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "materialId" TEXT NOT NULL,
    "buyPrice" DECIMAL(18,4),
    "sellPrice" DECIMAL(18,4),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "material_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_price_tables" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "contactId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "negotiatedPrice" DECIMAL(18,4) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "minQuantity" DECIMAL(18,3),
    "paymentCondition" TEXT,
    "freightIncluded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "company_price_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "documentNumber" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT,
    "employeeUserId" TEXT,
    "warehouseId" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentMethod" "PaymentMethod",
    "paymentStatus" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "weighingNumber" TEXT,
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "notes" TEXT,
    "grossTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "surchargeTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pendingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "purchaseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "grossWeight" DECIMAL(18,3),
    "tareWeight" DECIMAL(18,3),
    "netWeight" DECIMAL(18,3),
    "quantity" DECIMAL(18,3),
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "surcharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weighings" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "weighingNumber" TEXT NOT NULL,
    "weighedAt" TIMESTAMP(3) NOT NULL,
    "purchaseId" TEXT,
    "grossWeight" DECIMAL(18,3) NOT NULL,
    "tareWeight" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netWeight" DECIMAL(18,3) NOT NULL,
    "operatorUserId" TEXT,
    "equipmentName" TEXT,
    "vehiclePlate" TEXT,
    "notes" TEXT,
    "finalized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "weighings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "documentNumber" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "sellerUserId" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'QUOTE',
    "paymentMethod" "PaymentMethod",
    "paymentDueDate" TIMESTAMP(3),
    "carrierId" TEXT,
    "driverName" TEXT,
    "vehiclePlate" TEXT,
    "notes" TEXT,
    "grossTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "freightTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "saleId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "weight" DECIMAL(18,3),
    "quantity" DECIMAL(18,3),
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "movementType" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,3),
    "weight" DECIMAL(18,3),
    "location" TEXT,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "notes" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_processing" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "sourceMaterialId" TEXT NOT NULL,
    "sourceWeight" DECIMAL(18,3) NOT NULL,
    "resultPayload" JSONB NOT NULL,
    "lossWeight" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "yieldPercent" DECIMAL(8,4),
    "notes" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_processing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "bankName" TEXT,
    "agency" TEXT,
    "accountNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "accountId" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "contactId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "documentRef" TEXT,
    "notes" TEXT,
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_payable" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "contactId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "documentRef" TEXT,
    "notes" TEXT,
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,

    CONSTRAINT "accounts_payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_receivable" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "contactId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "documentRef" TEXT,
    "notes" TEXT,
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,

    CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_credits" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "contactId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "remainingBalance" DECIMAL(18,2) NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL,
    "bankName" TEXT,
    "paymentMethod" "PaymentMethod",
    "receiptNumber" TEXT,
    "notes" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "company_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_credit_movements" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "creditId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "movementType" TEXT NOT NULL,
    "saleId" TEXT,
    "notes" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_credit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "expectedBalance" DECIMAL(18,2),
    "informedBalance" DECIMAL(18,2),
    "difference" DECIMAL(18,2),
    "differenceReason" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_movements" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "cashRegisterId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "description" TEXT,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "checksum" TEXT,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "deviceId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT NOT NULL,
    "originOperationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "SyncAction" NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "deviceId" TEXT,
    "direction" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "pushedCount" INTEGER NOT NULL DEFAULT 0,
    "pulledCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "originOperationId" TEXT,
    "localPayload" JSONB NOT NULL,
    "serverPayload" JSONB NOT NULL,
    "localVersion" INTEGER NOT NULL,
    "serverVersion" INTEGER NOT NULL,
    "localUserId" TEXT,
    "serverUserId" TEXT,
    "localUpdatedAt" TIMESTAMP(3),
    "serverUpdatedAt" TIMESTAMP(3),
    "status" "ConflictResolution" NOT NULL DEFAULT 'PENDING',
    "resolution" "ConflictResolution",
    "justification" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_settings" (
    "id" TEXT NOT NULL,
    "localId" INTEGER,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "originOperationId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,

    CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_operation_receipts" (
    "id" TEXT NOT NULL,
    "originOperationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,

    CONSTRAINT "sync_operation_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_originOperationId_key" ON "companies"("originOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_documentCnpj_key" ON "companies"("documentCnpj");

-- CreateIndex
CREATE INDEX "companies_syncStatus_idx" ON "companies"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "branches_originOperationId_key" ON "branches"("originOperationId");

-- CreateIndex
CREATE INDEX "branches_companyId_idx" ON "branches"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_code_key" ON "branches"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_originOperationId_key" ON "warehouses"("originOperationId");

-- CreateIndex
CREATE INDEX "warehouses_companyId_branchId_idx" ON "warehouses"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_branchId_code_key" ON "warehouses"("branchId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "devices_originOperationId_key" ON "devices"("originOperationId");

-- CreateIndex
CREATE INDEX "devices_companyId_idx" ON "devices"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_originOperationId_key" ON "users"("originOperationId");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "users_companyId_username_key" ON "users"("companyId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_types_code_key" ON "contact_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_originOperationId_key" ON "contacts"("originOperationId");

-- CreateIndex
CREATE INDEX "contacts_companyId_legalName_idx" ON "contacts"("companyId", "legalName");

-- CreateIndex
CREATE INDEX "contacts_companyId_cpf_idx" ON "contacts"("companyId", "cpf");

-- CreateIndex
CREATE INDEX "contacts_companyId_cnpj_idx" ON "contacts"("companyId", "cnpj");

-- CreateIndex
CREATE INDEX "contacts_companyId_phonePrimary_idx" ON "contacts"("companyId", "phonePrimary");

-- CreateIndex
CREATE INDEX "contacts_syncStatus_idx" ON "contacts"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "contact_contact_types_contactId_typeId_key" ON "contact_contact_types"("contactId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_originOperationId_key" ON "material_categories"("originOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_companyId_code_key" ON "material_categories"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "materials_originOperationId_key" ON "materials"("originOperationId");

-- CreateIndex
CREATE INDEX "materials_companyId_name_idx" ON "materials"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "materials_companyId_code_key" ON "materials"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "material_prices_originOperationId_key" ON "material_prices"("originOperationId");

-- CreateIndex
CREATE INDEX "material_prices_materialId_validFrom_idx" ON "material_prices"("materialId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "company_price_tables_originOperationId_key" ON "company_price_tables"("originOperationId");

-- CreateIndex
CREATE INDEX "company_price_tables_contactId_materialId_idx" ON "company_price_tables"("contactId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_originOperationId_key" ON "purchases"("originOperationId");

-- CreateIndex
CREATE INDEX "purchases_companyId_purchasedAt_idx" ON "purchases"("companyId", "purchasedAt");

-- CreateIndex
CREATE INDEX "purchases_syncStatus_idx" ON "purchases"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_companyId_branchId_documentNumber_key" ON "purchases"("companyId", "branchId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_originOperationId_key" ON "purchase_items"("originOperationId");

-- CreateIndex
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "weighings_originOperationId_key" ON "weighings"("originOperationId");

-- CreateIndex
CREATE INDEX "weighings_companyId_weighingNumber_idx" ON "weighings"("companyId", "weighingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_originOperationId_key" ON "sales"("originOperationId");

-- CreateIndex
CREATE INDEX "sales_companyId_soldAt_idx" ON "sales"("companyId", "soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_branchId_documentNumber_key" ON "sales"("companyId", "branchId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_originOperationId_key" ON "sale_items"("originOperationId");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_originOperationId_key" ON "stock_movements"("originOperationId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_materialId_movedAt_idx" ON "stock_movements"("companyId", "materialId", "movedAt");

-- CreateIndex
CREATE INDEX "stock_movements_originOperationId_idx" ON "stock_movements"("originOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_processing_originOperationId_key" ON "stock_processing"("originOperationId");

-- CreateIndex
CREATE INDEX "stock_processing_companyId_processedAt_idx" ON "stock_processing"("companyId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_originOperationId_key" ON "financial_accounts"("originOperationId");

-- CreateIndex
CREATE INDEX "financial_accounts_companyId_idx" ON "financial_accounts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_originOperationId_key" ON "financial_transactions"("originOperationId");

-- CreateIndex
CREATE INDEX "financial_transactions_companyId_status_dueAt_idx" ON "financial_transactions"("companyId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_payable_originOperationId_key" ON "accounts_payable"("originOperationId");

-- CreateIndex
CREATE INDEX "accounts_payable_companyId_status_dueAt_idx" ON "accounts_payable"("companyId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_receivable_originOperationId_key" ON "accounts_receivable"("originOperationId");

-- CreateIndex
CREATE INDEX "accounts_receivable_companyId_status_dueAt_idx" ON "accounts_receivable"("companyId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "company_credits_originOperationId_key" ON "company_credits"("originOperationId");

-- CreateIndex
CREATE INDEX "company_credits_contactId_idx" ON "company_credits"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "company_credit_movements_originOperationId_key" ON "company_credit_movements"("originOperationId");

-- CreateIndex
CREATE INDEX "company_credit_movements_creditId_idx" ON "company_credit_movements"("creditId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_originOperationId_key" ON "cash_registers"("originOperationId");

-- CreateIndex
CREATE INDEX "cash_registers_companyId_status_idx" ON "cash_registers"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_movements_originOperationId_key" ON "cash_register_movements"("originOperationId");

-- CreateIndex
CREATE INDEX "cash_register_movements_cashRegisterId_idx" ON "cash_register_movements"("cashRegisterId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_originOperationId_key" ON "attachments"("originOperationId");

-- CreateIndex
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "sync_queue_originOperationId_key" ON "sync_queue"("originOperationId");

-- CreateIndex
CREATE INDEX "sync_queue_status_createdAt_idx" ON "sync_queue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "sync_queue_deviceId_status_idx" ON "sync_queue"("deviceId", "status");

-- CreateIndex
CREATE INDEX "sync_logs_deviceId_startedAt_idx" ON "sync_logs"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "sync_conflicts_companyId_status_idx" ON "sync_conflicts"("companyId", "status");

-- CreateIndex
CREATE INDEX "sync_conflicts_entityType_entityId_idx" ON "sync_conflicts"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "application_settings_originOperationId_key" ON "application_settings"("originOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "application_settings_companyId_key_key" ON "application_settings"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "sync_operation_receipts_originOperationId_key" ON "sync_operation_receipts"("originOperationId");

-- CreateIndex
CREATE INDEX "sync_operation_receipts_companyId_processedAt_idx" ON "sync_operation_receipts"("companyId", "processedAt");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_contact_types" ADD CONSTRAINT "contact_contact_types_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_contact_types" ADD CONSTRAINT "contact_contact_types_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "contact_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_prices" ADD CONSTRAINT "material_prices_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_price_tables" ADD CONSTRAINT "company_price_tables_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_price_tables" ADD CONSTRAINT "company_price_tables_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_credits" ADD CONSTRAINT "company_credits_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_credit_movements" ADD CONSTRAINT "company_credit_movements_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "company_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

