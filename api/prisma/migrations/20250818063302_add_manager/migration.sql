/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Activity_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Activity_orderId_idx";

-- DropIndex
DROP INDEX "public"."Order_managerId_idx";

-- DropIndex
DROP INDEX "public"."Order_status_createdAt_idx";

-- DropIndex
DROP INDEX "public"."User_email_idx";

-- DropIndex
DROP INDEX "public"."User_tgUserId_idx";

-- DropIndex
DROP INDEX "public"."WebhookOutbox_status_nextRunAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- AddForeignKey
ALTER TABLE "public"."Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
