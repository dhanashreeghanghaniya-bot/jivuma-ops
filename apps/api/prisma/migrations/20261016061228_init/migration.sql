-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SALESMAN');

-- CreateEnum
CREATE TYPE "Zone" AS ENUM ('SAURASHTRA', 'KUTCH', 'NORTH_GUJARAT', 'CENTRAL_GUJARAT', 'SOUTH_GUJARAT');

-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('COVERED', 'SS_ONLY', 'LEADS_ONLY', 'UNTOUCHED');

-- CreateEnum
CREATE TYPE "TownType" AS ENUM ('CITY', 'TOWN', 'VILLAGE');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "RetailerCategory" AS ENUM ('KIRANA', 'SUPERMARKET', 'GENERAL', 'HORECA', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('SS', 'DISTRIBUTOR', 'RETAILER');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('FIELD', 'REFERRAL', 'INBOUND_CALL', 'EXPO', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'MEETING_DONE', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'VISIT', 'NOTE', 'STAGE_CHANGE');

-- CreateEnum
CREATE TYPE "OrderLevel" AS ENUM ('COMPANY_TO_SS', 'SS_TO_DISTRIBUTOR', 'DISTRIBUTOR_TO_RETAILER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('COMPANY', 'SUPER_STOCKIST', 'DISTRIBUTOR', 'RETAILER');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('HQ', 'EX_HQ', 'OUTSTATION', 'LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "WorkDayStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PingSource" AS ENUM ('START', 'END', 'TIMER', 'VISIT', 'ORDER', 'LEAD', 'EXPENSE');

-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('ORDER_TAKEN', 'NO_ORDER', 'SHOP_CLOSED', 'FOLLOW_UP', 'NEW_SHOP_ADDED');

-- CreateEnum
CREATE TYPE "VisitPhotoType" AS ENUM ('SHELF', 'SHOP_FRONT', 'DISPLAY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('TA', 'DA', 'LODGING', 'FOOD', 'PHONE', 'MISC');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('BIKE', 'CAR', 'BUS', 'TRAIN', 'AUTO');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'FINAL', 'PAID');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameGu" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "zone" "Zone" NOT NULL,
    "coverageStatus" "CoverageStatus" NOT NULL DEFAULT 'UNTOUCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Town" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "type" "TownType" NOT NULL DEFAULT 'TOWN',
    "population" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Town_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperStockist" (
    "id" TEXT NOT NULL,
    "firmName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT NOT NULL,
    "townId" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "onboardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SuperStockist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distributor" (
    "id" TEXT NOT NULL,
    "firmName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT NOT NULL,
    "townId" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "superStockistId" TEXT NOT NULL,
    "creditLimit" DECIMAL(12,2),
    "creditDays" INTEGER,
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "onboardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "townId" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "distributorId" TEXT NOT NULL,
    "category" "RetailerCategory" NOT NULL DEFAULT 'KIRANA',
    "photoUrl" TEXT,
    "addedBySalesmanId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "type" "LeadType" NOT NULL,
    "name" TEXT NOT NULL,
    "firmName" TEXT,
    "phone" TEXT NOT NULL,
    "townId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'FIELD',
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "lostReason" TEXT,
    "assignedToId" TEXT,
    "expectedInvestment" DECIMAL(12,2),
    "followUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "note" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "packSize" TEXT NOT NULL,
    "unitsPerCase" INTEGER NOT NULL,
    "mrp" DECIMAL(12,2) NOT NULL,
    "ssPrice" DECIMAL(12,2) NOT NULL,
    "distributorPrice" DECIMAL(12,2) NOT NULL,
    "retailerPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "level" "OrderLevel" NOT NULL,
    "fromPartyType" "PartyType" NOT NULL,
    "toPartyType" "PartyType" NOT NULL,
    "superStockistId" TEXT,
    "distributorId" TEXT,
    "retailerId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "takenBySalesmanId" TEXT,
    "visitId" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDelivery" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyCases" INTEGER NOT NULL DEFAULT 0,
    "qtyUnits" INTEGER NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "changedById" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSequence" (
    "month" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSequence_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALESMAN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "photoUrl" TEXT,
    "joiningDate" DATE NOT NULL,
    "hqTownId" TEXT,
    "reportingToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenHash" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesmanTerritory" (
    "id" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "districtId" TEXT,
    "townId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesmanTerritory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Beat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeatStop" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "townId" TEXT,
    "retailerId" TEXT,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeatStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDay" (
    "id" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startAt" TIMESTAMP(3),
    "startLat" DECIMAL(9,6),
    "startLng" DECIMAL(9,6),
    "startAccuracyM" INTEGER,
    "startPlaceLabel" TEXT,
    "startOdometer" INTEGER,
    "startOdometerPhotoUrl" TEXT,
    "endAt" TIMESTAMP(3),
    "endLat" DECIMAL(9,6),
    "endLng" DECIMAL(9,6),
    "endAccuracyM" INTEGER,
    "endPlaceLabel" TEXT,
    "endOdometer" INTEGER,
    "endOdometerPhotoUrl" TEXT,
    "dayType" "DayType" NOT NULL DEFAULT 'HQ',
    "beatId" TEXT,
    "totalKm" DECIMAL(10,2),
    "gpsKm" DECIMAL(10,2),
    "endedProperly" BOOLEAN NOT NULL DEFAULT false,
    "workingMinutes" INTEGER,
    "status" "WorkDayStatus" NOT NULL DEFAULT 'OPEN',
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "workDayId" TEXT,
    "salesmanId" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "accuracyM" INTEGER,
    "source" "PingSource" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "battery" INTEGER,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "workDayId" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "retailerId" TEXT,
    "distributorId" TEXT,
    "leadId" TEXT,
    "townId" TEXT NOT NULL,
    "newShopName" TEXT,
    "newShopOwner" TEXT,
    "newShopPhone" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkInLat" DECIMAL(9,6) NOT NULL,
    "checkInLng" DECIMAL(9,6) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "distanceFromShopMeters" INTEGER,
    "outcome" "VisitOutcome" NOT NULL,
    "noOrderReason" TEXT,
    "notes" TEXT,
    "clientUuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitPhoto" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "VisitPhotoType" NOT NULL DEFAULT 'SHELF',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "workDayId" TEXT,
    "date" DATE NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "travelMode" "TravelMode",
    "fromTownId" TEXT,
    "toTownId" TEXT,
    "km" DECIMAL(10,2),
    "amountClaimed" DECIMAL(12,2) NOT NULL,
    "amountApproved" DECIMAL(12,2),
    "billPhotoUrls" TEXT[],
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "adminRemark" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isAutoDrafted" BOOLEAN NOT NULL DEFAULT false,
    "clientUuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowancePolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "daHq" DECIMAL(12,2) NOT NULL,
    "daExHq" DECIMAL(12,2) NOT NULL,
    "daOutstation" DECIMAL(12,2) NOT NULL,
    "taPerKmBike" DECIMAL(12,2) NOT NULL,
    "taPerKmCar" DECIMAL(12,2) NOT NULL,
    "taPerKmAuto" DECIMAL(12,2) NOT NULL,
    "maxLodgingPerNight" DECIMAL(12,2) NOT NULL,
    "monthlyPhoneAllowance" DECIMAL(12,2) NOT NULL,
    "publicTransportNeedsBill" BOOLEAN NOT NULL DEFAULT true,
    "daRequiresVisit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "basic" DECIMAL(12,2) NOT NULL,
    "hra" DECIMAL(12,2) NOT NULL,
    "fixedAllowance" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incentive" (
    "id" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incentive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyCostReport" (
    "id" TEXT NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "workingDays" INTEGER NOT NULL DEFAULT 0,
    "leaves" INTEGER NOT NULL DEFAULT 0,
    "salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "daTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "incentives" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "orderValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "visitsCount" INTEGER NOT NULL DEFAULT 0,
    "newRetailers" INTEGER NOT NULL DEFAULT 0,
    "costToSalesRatio" DECIMAL(8,4),
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "pdfUrl" TEXT,
    "finalisedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyCostReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SuperStockistCoveredDistricts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SuperStockistCoveredDistricts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WorkDayTownsVisited" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkDayTownsVisited_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DistributorCoveredTowns" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DistributorCoveredTowns_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "District_code_key" ON "District"("code");

-- CreateIndex
CREATE INDEX "District_zone_idx" ON "District"("zone");

-- CreateIndex
CREATE INDEX "District_coverageStatus_idx" ON "District"("coverageStatus");

-- CreateIndex
CREATE INDEX "Town_districtId_idx" ON "Town"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "Town_districtId_name_key" ON "Town"("districtId", "name");

-- CreateIndex
CREATE INDEX "SuperStockist_townId_idx" ON "SuperStockist"("townId");

-- CreateIndex
CREATE INDEX "SuperStockist_status_idx" ON "SuperStockist"("status");

-- CreateIndex
CREATE INDEX "Distributor_townId_idx" ON "Distributor"("townId");

-- CreateIndex
CREATE INDEX "Distributor_superStockistId_idx" ON "Distributor"("superStockistId");

-- CreateIndex
CREATE INDEX "Distributor_status_idx" ON "Distributor"("status");

-- CreateIndex
CREATE INDEX "Retailer_townId_idx" ON "Retailer"("townId");

-- CreateIndex
CREATE INDEX "Retailer_distributorId_idx" ON "Retailer"("distributorId");

-- CreateIndex
CREATE INDEX "Retailer_isVerified_idx" ON "Retailer"("isVerified");

-- CreateIndex
CREATE INDEX "Lead_districtId_idx" ON "Lead"("districtId");

-- CreateIndex
CREATE INDEX "Lead_townId_idx" ON "Lead"("townId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Lead_followUpAt_idx" ON "Lead"("followUpAt");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_at_idx" ON "LeadActivity"("leadId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_visitId_key" ON "Order"("visitId");

-- CreateIndex
CREATE INDEX "Order_level_idx" ON "Order"("level");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

-- CreateIndex
CREATE INDEX "Order_takenBySalesmanId_idx" ON "Order"("takenBySalesmanId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderStatusLog_orderId_at_idx" ON "OrderStatusLog"("orderId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "SalesmanTerritory_salesmanId_idx" ON "SalesmanTerritory"("salesmanId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesmanTerritory_salesmanId_districtId_key" ON "SalesmanTerritory"("salesmanId", "districtId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesmanTerritory_salesmanId_townId_key" ON "SalesmanTerritory"("salesmanId", "townId");

-- CreateIndex
CREATE INDEX "Beat_salesmanId_idx" ON "Beat"("salesmanId");

-- CreateIndex
CREATE INDEX "BeatStop_beatId_idx" ON "BeatStop"("beatId");

-- CreateIndex
CREATE UNIQUE INDEX "BeatStop_beatId_sequence_key" ON "BeatStop"("beatId", "sequence");

-- CreateIndex
CREATE INDEX "WorkDay_date_idx" ON "WorkDay"("date");

-- CreateIndex
CREATE INDEX "WorkDay_status_idx" ON "WorkDay"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkDay_salesmanId_date_key" ON "WorkDay"("salesmanId", "date");

-- CreateIndex
CREATE INDEX "LocationPing_salesmanId_capturedAt_idx" ON "LocationPing"("salesmanId", "capturedAt");

-- CreateIndex
CREATE INDEX "LocationPing_workDayId_idx" ON "LocationPing"("workDayId");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_clientUuid_key" ON "Visit"("clientUuid");

-- CreateIndex
CREATE INDEX "Visit_workDayId_idx" ON "Visit"("workDayId");

-- CreateIndex
CREATE INDEX "Visit_salesmanId_checkInAt_idx" ON "Visit"("salesmanId", "checkInAt");

-- CreateIndex
CREATE INDEX "Visit_retailerId_idx" ON "Visit"("retailerId");

-- CreateIndex
CREATE INDEX "VisitPhoto_visitId_idx" ON "VisitPhoto"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_clientUuid_key" ON "ExpenseClaim"("clientUuid");

-- CreateIndex
CREATE INDEX "ExpenseClaim_salesmanId_date_idx" ON "ExpenseClaim"("salesmanId", "date");

-- CreateIndex
CREATE INDEX "ExpenseClaim_status_idx" ON "ExpenseClaim"("status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_workDayId_idx" ON "ExpenseClaim"("workDayId");

-- CreateIndex
CREATE UNIQUE INDEX "AllowancePolicy_effectiveFrom_key" ON "AllowancePolicy"("effectiveFrom");

-- CreateIndex
CREATE INDEX "SalaryStructure_salesmanId_idx" ON "SalaryStructure"("salesmanId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructure_salesmanId_effectiveFrom_key" ON "SalaryStructure"("salesmanId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Incentive_salesmanId_month_idx" ON "Incentive"("salesmanId", "month");

-- CreateIndex
CREATE INDEX "MonthlyCostReport_month_idx" ON "MonthlyCostReport"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyCostReport_salesmanId_month_key" ON "MonthlyCostReport"("salesmanId", "month");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_at_idx" ON "AuditLog"("userId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "_SuperStockistCoveredDistricts_B_index" ON "_SuperStockistCoveredDistricts"("B");

-- CreateIndex
CREATE INDEX "_WorkDayTownsVisited_B_index" ON "_WorkDayTownsVisited"("B");

-- CreateIndex
CREATE INDEX "_DistributorCoveredTowns_B_index" ON "_DistributorCoveredTowns"("B");

-- AddForeignKey
ALTER TABLE "Town" ADD CONSTRAINT "Town_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperStockist" ADD CONSTRAINT "SuperStockist_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_superStockistId_fkey" FOREIGN KEY ("superStockistId") REFERENCES "SuperStockist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retailer" ADD CONSTRAINT "Retailer_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retailer" ADD CONSTRAINT "Retailer_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retailer" ADD CONSTRAINT "Retailer_addedBySalesmanId_fkey" FOREIGN KEY ("addedBySalesmanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retailer" ADD CONSTRAINT "Retailer_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_superStockistId_fkey" FOREIGN KEY ("superStockistId") REFERENCES "SuperStockist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_takenBySalesmanId_fkey" FOREIGN KEY ("takenBySalesmanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hqTownId_fkey" FOREIGN KEY ("hqTownId") REFERENCES "Town"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_reportingToId_fkey" FOREIGN KEY ("reportingToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesmanTerritory" ADD CONSTRAINT "SalesmanTerritory_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesmanTerritory" ADD CONSTRAINT "SalesmanTerritory_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesmanTerritory" ADD CONSTRAINT "SalesmanTerritory_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beat" ADD CONSTRAINT "Beat_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatStop" ADD CONSTRAINT "BeatStop_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatStop" ADD CONSTRAINT "BeatStop_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatStop" ADD CONSTRAINT "BeatStop_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "WorkDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "WorkDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "WorkDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_fromTownId_fkey" FOREIGN KEY ("fromTownId") REFERENCES "Town"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_toTownId_fkey" FOREIGN KEY ("toTownId") REFERENCES "Town"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyCostReport" ADD CONSTRAINT "MonthlyCostReport_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyCostReport" ADD CONSTRAINT "MonthlyCostReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SuperStockistCoveredDistricts" ADD CONSTRAINT "_SuperStockistCoveredDistricts_A_fkey" FOREIGN KEY ("A") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SuperStockistCoveredDistricts" ADD CONSTRAINT "_SuperStockistCoveredDistricts_B_fkey" FOREIGN KEY ("B") REFERENCES "SuperStockist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkDayTownsVisited" ADD CONSTRAINT "_WorkDayTownsVisited_A_fkey" FOREIGN KEY ("A") REFERENCES "Town"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkDayTownsVisited" ADD CONSTRAINT "_WorkDayTownsVisited_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DistributorCoveredTowns" ADD CONSTRAINT "_DistributorCoveredTowns_A_fkey" FOREIGN KEY ("A") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DistributorCoveredTowns" ADD CONSTRAINT "_DistributorCoveredTowns_B_fkey" FOREIGN KEY ("B") REFERENCES "Town"("id") ON DELETE CASCADE ON UPDATE CASCADE;
