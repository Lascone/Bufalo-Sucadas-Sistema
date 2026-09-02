-- CreateTable
CREATE TABLE IF NOT EXISTS "wipe_archives" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "archivedDeviceId" TEXT NOT NULL,
    "archivedName" TEXT NOT NULL,
    "fromAt" TIMESTAMP(3) NOT NULL,
    "toAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wipe_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "wipe_archives_companyId_toAt_idx" ON "wipe_archives"("companyId", "toAt");
