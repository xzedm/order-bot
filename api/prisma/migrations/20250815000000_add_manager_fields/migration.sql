ALTER TABLE "public"."Order" ADD COLUMN "managerId" TEXT;
ALTER TABLE "public"."Order" ADD COLUMN "managerNotes" TEXT;
ALTER TABLE "public"."Order" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "public"."Order" ADD COLUMN "rejectedAt" TIMESTAMP(3);



-- Create User table for managers (simplified)
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'manager',
    "tgUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Create Activity log table for audit trail
CREATE TABLE "public"."Activity" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL, -- 'customer', 'manager', 'system'
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL, -- 'created', 'confirmed', 'rejected', 'status_changed', etc.
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- Create webhook outbox for reliable notifications
CREATE TABLE "public"."WebhookOutbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL, -- 'manager_notification', 'customer_notification', etc.
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookOutbox_pkey" PRIMARY KEY ("id")
);

-- Add indexes for performance
CREATE INDEX "User_email_idx" ON "public"."User"("email");
CREATE INDEX "User_tgUserId_idx" ON "public"."User"("tgUserId");
CREATE INDEX "Activity_orderId_idx" ON "public"."Activity"("orderId");
CREATE INDEX "Activity_createdAt_idx" ON "public"."Activity"("createdAt");
CREATE INDEX "WebhookOutbox_status_nextRunAt_idx" ON "public"."WebhookOutbox"("status", "nextRunAt");
CREATE INDEX "Order_status_createdAt_idx" ON "public"."Order"("status", "createdAt");
CREATE INDEX "Order_managerId_idx" ON "public"."Order"("managerId");

-- Add foreign key constraints
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Activity" ADD CONSTRAINT "Activity_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert sample manager user
INSERT INTO "public"."User" ("id", "email", "name", "role", "tgUserId") VALUES 
('manager-001', 'manager@kerneugroup.com', 'System Manager', 'admin', NULL);
