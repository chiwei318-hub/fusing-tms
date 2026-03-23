import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, driversTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";

export const biddingRouter = Router();

// GET /api/orders/bids/open - get all orders open for bidding
biddingRouter.get("/orders/bids/open", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT o.*,
           COUNT(b.id) AS bid_count,
           MIN(b.bid_price) AS lowest_bid,
           MAX(b.bid_price) AS highest_bid
    FROM orders o
    LEFT JOIN order_bids b ON b.order_id = o.id AND b.status = 'pending'
    WHERE o.bidding_open = TRUE AND o.status = 'pending'
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `);
  res.json(rows.rows);
});

// GET /api/orders/:id/bids - get bids for an order
biddingRouter.get("/orders/:id/bids", async (req, res) => {
  const orderId = Number(req.params.id);
  const bids = await db.execute(sql`
    SELECT b.*, pf.name AS fleet_name, pf.phone AS fleet_phone,
           pf.reliability_score, pf.completed_orders
    FROM order_bids b
    LEFT JOIN partner_fleets pf ON pf.id = b.fleet_id
    WHERE b.order_id = ${orderId}
    ORDER BY b.bid_price ASC, b.submitted_at ASC
  `);
  res.json(bids.rows);
});

// POST /api/orders/:id/bids - submit a bid
biddingRouter.post("/orders/:id/bids", async (req, res) => {
  const orderId = Number(req.params.id);
  const { fleetId, bidderName, bidPrice, vehicleType, estimatedArrivalMin, notes } = req.body;

  if (!bidderName || !bidPrice) {
    return res.status(400).json({ error: "缺少必要欄位：bidderName, bidPrice" });
  }

  // Check order exists and is open for bidding (use raw SQL to access bidding_open column)
  const orderRows = await db.execute(sql`SELECT id, bidding_open, status FROM orders WHERE id = ${orderId}`);
  const order = (orderRows.rows as any[])[0];
  if (!order) return res.status(404).json({ error: "訂單不存在" });
  if (!order.bidding_open) return res.status(400).json({ error: "此訂單未開放競標" });

  const bidResult = await db.execute(sql`
    INSERT INTO order_bids (order_id, fleet_id, bidder_name, bid_price, vehicle_type, estimated_arrival_min, notes)
    VALUES (${orderId}, ${fleetId ?? null}, ${bidderName}, ${Number(bidPrice)},
            ${vehicleType ?? null}, ${estimatedArrivalMin ?? null}, ${notes ?? null})
    RETURNING *
  `);

  res.status(201).json({ ok: true, bid: bidResult.rows[0] });
});

// PATCH /api/orders/bids/:bidId/accept - accept a bid
biddingRouter.patch("/orders/bids/:bidId/accept", async (req, res) => {
  const bidId = Number(req.params.bidId);

  // Get bid info
  const bidRows = await db.execute(sql`SELECT * FROM order_bids WHERE id = ${bidId}`);
  const bid = (bidRows.rows as any[])[0];
  if (!bid) return res.status(404).json({ error: "競標不存在" });

  // Accept this bid, reject others
  await db.execute(sql`UPDATE order_bids SET status = 'accepted', responded_at = NOW() WHERE id = ${bidId}`);
  await db.execute(sql`UPDATE order_bids SET status = 'rejected', responded_at = NOW() WHERE order_id = ${bid.order_id} AND id != ${bidId}`);

  // Update order - close bidding, set price, assign to fleet
  await db.execute(sql`
    UPDATE orders SET 
      bidding_open = FALSE, 
      total_fee = ${bid.bid_price},
      notes = COALESCE(notes, '') || ' [競標得標: ' || ${bid.bidder_name} || ' NT$' || ${bid.bid_price} || ']',
      updated_at = NOW()
    WHERE id = ${bid.order_id}
  `);

  // If fleet_id linked to outsourcing, create outsourced order
  if (bid.fleet_id) {
    await db.execute(sql`
      INSERT INTO outsourced_orders (order_id, fleet_id, quote_amount, status)
      VALUES (${bid.order_id}, ${bid.fleet_id}, ${bid.bid_price}, 'pending')
      ON CONFLICT DO NOTHING
    `);
  }

  res.json({ ok: true, bid });
});

// PATCH /api/orders/:id/bidding - toggle bidding open/close
biddingRouter.patch("/orders/:id/bidding", async (req, res) => {
  const orderId = Number(req.params.id);
  const { open, deadline } = req.body;

  await db.execute(sql`
    UPDATE orders SET 
      bidding_open = ${open === true},
      bid_deadline = ${deadline ? new Date(deadline) : null},
      updated_at = NOW()
    WHERE id = ${orderId}
  `);

  res.json({ ok: true });
});

// GET /api/bidding/stats - bidding statistics
biddingRouter.get("/bidding/stats", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT 
      COUNT(*) FILTER (WHERE o.bidding_open = TRUE AND o.status = 'pending') AS open_orders,
      COUNT(b.id) FILTER (WHERE b.status = 'pending') AS total_pending_bids,
      COUNT(b.id) FILTER (WHERE b.status = 'accepted') AS accepted_bids,
      ROUND(AVG(b.bid_price) FILTER (WHERE b.status = 'accepted')::numeric, 0) AS avg_accepted_price,
      COUNT(DISTINCT b.bidder_name) AS unique_bidders
    FROM orders o
    LEFT JOIN order_bids b ON b.order_id = o.id
    WHERE o.created_at >= NOW() - INTERVAL '30 days'
  `);
  res.json(rows.rows[0]);
});
