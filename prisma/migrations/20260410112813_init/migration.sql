-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('AVAILABLE', 'SOLD', 'RESERVED');

-- CreateEnum
CREATE TYPE "DeductStrategy" AS ENUM ('NO_LOCK', 'DB_ATOMIC', 'DB_TRANSACTION', 'REDIS_ATOMIC', 'QUEUE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'FINISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT', 'QUEUED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalTickets" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "seatNo" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'AVAILABLE',
    "ownerUserId" TEXT,
    "ownerRunId" TEXT,
    "soldAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userCount" INTEGER NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "maxQty" INTEGER NOT NULL DEFAULT 2,
    "enableQueue" BOOLEAN NOT NULL DEFAULT false,
    "rateLimit" INTEGER,
    "randomDelayMs" INTEGER NOT NULL DEFAULT 0,
    "strategy" "DeductStrategy" NOT NULL DEFAULT 'DB_ATOMIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "timeoutCount" INTEGER NOT NULL DEFAULT 0,
    "oversoldCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAttempt" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "result" "AttemptResult" NOT NULL,
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL,
    "latencyMs" INTEGER NOT NULL,

    CONSTRAINT "PurchaseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_startAt_idx" ON "Event"("startAt");

-- CreateIndex
CREATE INDEX "Ticket_eventId_status_idx" ON "Ticket"("eventId", "status");

-- CreateIndex
CREATE INDEX "Ticket_ownerRunId_idx" ON "Ticket"("ownerRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_eventId_seatNo_key" ON "Ticket"("eventId", "seatNo");

-- CreateIndex
CREATE INDEX "SimulationRun_eventId_status_idx" ON "SimulationRun"("eventId", "status");

-- CreateIndex
CREATE INDEX "PurchaseAttempt_runId_result_idx" ON "PurchaseAttempt"("runId", "result");

-- CreateIndex
CREATE INDEX "PurchaseAttempt_runId_requestedAt_idx" ON "PurchaseAttempt"("runId", "requestedAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationConfig" ADD CONSTRAINT "SimulationConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SimulationConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAttempt" ADD CONSTRAINT "PurchaseAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
