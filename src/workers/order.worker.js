const { Worker } = require("bullmq");
const { redisConnection } = require("@core/config/queue");
const { sendEmail } = require("@core/config/nodemailer");

/**
 * Order Worker — listens to 'order-events' queue
 * Processes ORDER_CREATED events by sending confirmation emails asynchronously.
 * BullMQ handles retries automatically based on job options (attempts + backoff).
 */

const orderWorker = new Worker(
  "order-events",
  async (job) => {
    console.log(
      `[OrderWorker] 🔄 Processing job ${job.id} — ${job.name} (attempt ${job.attemptsMade + 1})`,
    );

    if (job.name === "ORDER_CREATED") {
      const { email, orderId, total, items } = job.data;

      if (!email) {
        console.warn(
          `[OrderWorker] ⚠️ No email for order ${orderId}, skipping.`,
        );
        return;
      }

      // Build email content
      const itemsList = items
        .map((item) => `  • ${item.name} x${item.quantity} — ${Number(item.price).toLocaleString("vi-VN")}₫`)
        .join("\n");

      const subject = `[Eatsy] Xác nhận đơn hàng #${orderId.slice(-8).toUpperCase()}`;

      const content = [
        `Xin chào,`,
        ``,
        `Đơn hàng của bạn đã được xác nhận thành công!`,
        ``,
        `📦 Mã đơn hàng: #${orderId.slice(-8).toUpperCase()}`,
        `💰 Tổng thanh toán: ${Number(total).toLocaleString("vi-VN")}₫`,
        ``,
        `📋 Chi tiết đơn hàng:`,
        itemsList,
        ``,
        `Cảm ơn bạn đã tin tưởng Eatsy!`,
        `Đội ngũ Eatsy Food Delivery`,
      ].join("\n");

      await sendEmail(email, subject, content);

      console.log(
        `[OrderWorker] ✅ Confirmation email sent for order ${orderId} to ${email}`,
      );
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 jobs in parallel
  },
);

// Event listeners for monitoring
orderWorker.on("completed", (job) => {
  console.log(`[OrderWorker] ✅ Job ${job.id} completed successfully`);
});

orderWorker.on("failed", (job, err) => {
  console.error(
    `[OrderWorker] ❌ Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
  );
});

orderWorker.on("error", (err) => {
  console.error("[OrderWorker] Worker error:", err.message);
});

console.log("[OrderWorker] 🚀 Worker started, listening on queue 'order-events'");

module.exports = orderWorker;
