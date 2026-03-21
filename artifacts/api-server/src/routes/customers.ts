import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  UpdateCustomerParams,
  DeleteCustomerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/customers", async (req, res) => {
  try {
    const customers = await db
      .select()
      .from(customersTable)
      .orderBy(customersTable.createdAt);
    res.json(customers);
  } catch (err) {
    req.log.error({ err }, "Failed to list customers");
    res.status(500).json({ error: "Failed to list customers" });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const body = CreateCustomerBody.parse(req.body);
    const [customer] = await db
      .insert(customersTable)
      .values({
        name: body.name,
        phone: body.phone,
        username: body.username ?? null,
        password: body.password ?? null,
      })
      .returning();
    res.status(201).json(customer);
  } catch (err) {
    req.log.error({ err }, "Failed to create customer");
    res.status(400).json({ error: "Failed to create customer" });
  }
});

router.patch("/customers/:id", async (req, res) => {
  try {
    const { id } = UpdateCustomerParams.parse(req.params);
    const body = UpdateCustomerBody.parse(req.body);

    const existing = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const updates: Partial<typeof customersTable.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.phone !== undefined) updates.phone = body.phone;
    if ("username" in body) updates.username = body.username ?? null;
    if ("password" in body) updates.password = body.password ?? null;

    const [customer] = await db
      .update(customersTable)
      .set(updates)
      .where(eq(customersTable.id, id))
      .returning();
    res.json(customer);
  } catch (err) {
    req.log.error({ err }, "Failed to update customer");
    res.status(500).json({ error: "Failed to update customer" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    const { id } = DeleteCustomerParams.parse(req.params);
    const existing = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Customer not found" });
    }
    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete customer");
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;
