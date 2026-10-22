-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "clientUuid" TEXT;

-- AlterTable
ALTER TABLE "LocationPing" ADD COLUMN     "clientUuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_clientUuid_key" ON "Lead"("clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPing_clientUuid_key" ON "LocationPing"("clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "VisitPhoto_visitId_url_key" ON "VisitPhoto"("visitId", "url");

