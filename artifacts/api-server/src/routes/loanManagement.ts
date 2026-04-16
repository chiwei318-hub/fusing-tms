import { Router } from "express";
import { pool } from "@workspace/db";

export const loanManagementRouter = Router();

// ── 統計 (先定義，避免被 /:id 攔截) ─────────────────────────────────────────

loanManagementRouter.get("/loans/stats", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [loans, payments] = await Promise.all([
      pool.query(`SELECT * FROM loan_accounts WHERE status='active'`),
      pool.query(`SELECT lp.*, la.loan_name, la.plate_no FROM loan_payments lp JOIN loan_accounts la ON la.id=lp.loan_id ORDER BY lp.due_date`),
    ]);
    const totalPrincipal = loans.rows.reduce((s: number, l: any) => s + Number(l.principal), 0);
    const totalMonthly  = loans.rows.reduce((s: number, l: any) => s + Number(l.monthly_payment), 0);
    const pendingPmts   = payments.rows.filter((p: any) => p.status === "pending");
    const paidPmts      = payments.rows.filter((p: any) => p.status === "paid");
    const overduePmts   = pendingPmts.filter((p: any) => p.due_date <= today);
    const upcomingPmts  = pendingPmts.filter((p: any) => p.due_date > today);
    const thisMonth     = new Date().toISOString().slice(0, 7);
    const thisMonthPmts = pendingPmts.filter((p: any) => p.due_date.slice(0, 7) === thisMonth);
    const totalPaid     = paidPmts.reduce((s: number, p: any) => s + Number(p.paid_amount || p.total_amt), 0);
    const totalInterest = paidPmts.reduce((s: number, p: any) => s + Number(p.interest_amt), 0);
    const remainBal     = pendingPmts.reduce((s: number, p: any) => s + Number(p.total_amt), 0);
    res.json({
      totalLoans: loans.rows.length, totalPrincipal, totalMonthly,
      remainingBalance: remainBal, totalPaid, totalInterestPaid: totalInterest,
      overdueCount: overduePmts.length, overdueAmount: overduePmts.reduce((s: number, p: any) => s + Number(p.total_amt), 0),
      thisMonthCount: thisMonthPmts.length, thisMonthAmount: thisMonthPmts.reduce((s: number, p: any) => s + Number(p.total_amt), 0),
      upcomingCount: upcomingPmts.length,
      loanList: loans.rows,
      recentPayments: payments.rows.slice(0, 60),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 貸款帳戶 CRUD ─────────────────────────────────────────────────────────────

loanManagementRouter.get("/loans", async (req, res) => {
  try {
    const { search, status } = req.query as Record<string, string>;
    let q = `SELECT la.*, v.brand, v.model FROM loan_accounts la LEFT JOIN vehicles v ON v.id=la.vehicle_id WHERE 1=1`;
    const p: any[] = [];
    if (search) { p.push(`%${search}%`); q += ` AND (la.loan_name ILIKE $${p.length} OR la.bank_name ILIKE $${p.length} OR la.plate_no ILIKE $${p.length})`; }
    if (status) { p.push(status); q += ` AND la.status=$${p.length}`; }
    q += ` ORDER BY la.start_date DESC`;
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

loanManagementRouter.get("/loans/:id", async (req, res) => {
  try {
    const loan = await pool.query(`SELECT la.*, v.brand, v.model, v.vehicle_type FROM loan_accounts la LEFT JOIN vehicles v ON v.id=la.vehicle_id WHERE la.id=$1`, [req.params.id]);
    if (!loan.rows.length) return res.status(404).json({ error: "Not found" });
    const pmts = await pool.query(`SELECT * FROM loan_payments WHERE loan_id=$1 ORDER BY period_no`, [req.params.id]);
    res.json({ ...loan.rows[0], payments: pmts.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

loanManagementRouter.post("/loans", async (req, res) => {
  try {
    const { loanName, loanType, bankName, bankBranch, accountNo, vehicleId, plateNo, principal, interestRate, startDate, endDate, totalPeriods, monthlyPayment, paymentDay, status, contactPerson, contactPhone, notes, generateSchedule } = req.body;
    if (!loanName || !startDate || !endDate) return res.status(400).json({ error: "必填欄位缺少" });
    const r = await pool.query(
      `INSERT INTO loan_accounts (loan_name,loan_type,bank_name,bank_branch,account_no,vehicle_id,plate_no,principal,interest_rate,start_date,end_date,total_periods,monthly_payment,payment_day,status,contact_person,contact_phone,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [loanName, loanType||"車輛貸款", bankName||null, bankBranch||null, accountNo||null, vehicleId||null, plateNo||null, principal||0, interestRate||0, startDate, endDate, totalPeriods||1, monthlyPayment||0, paymentDay||1, status||"active", contactPerson||null, contactPhone||null, notes||null]
    );
    const loan = r.rows[0];
    // Auto-generate amortization schedule
    if (generateSchedule && loan.total_periods > 0 && loan.monthly_payment > 0) {
      const rate = Number(loan.interest_rate) / 100 / 12;
      let balance = Number(loan.principal);
      const start = new Date(loan.start_date);
      for (let i = 1; i <= loan.total_periods; i++) {
        const interestAmt = rate > 0 ? balance * rate : 0;
        const principalAmt = Number(loan.monthly_payment) - interestAmt;
        balance = Math.max(0, balance - principalAmt);
        const dueDate = new Date(start.getFullYear(), start.getMonth() + i, Number(loan.payment_day));
        await pool.query(
          `INSERT INTO loan_payments (loan_id,period_no,due_date,principal_amt,interest_amt,total_amt,remaining_bal,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
          [loan.id, i, dueDate.toISOString().slice(0,10), principalAmt.toFixed(2), interestAmt.toFixed(2), Number(loan.monthly_payment).toFixed(2), balance.toFixed(2)]
        );
      }
    }
    res.status(201).json(loan);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

loanManagementRouter.put("/loans/:id", async (req, res) => {
  try {
    const { loanName, loanType, bankName, bankBranch, accountNo, vehicleId, plateNo, principal, interestRate, startDate, endDate, totalPeriods, monthlyPayment, paymentDay, status, contactPerson, contactPhone, notes } = req.body;
    const r = await pool.query(
      `UPDATE loan_accounts SET loan_name=$1,loan_type=$2,bank_name=$3,bank_branch=$4,account_no=$5,vehicle_id=$6,plate_no=$7,principal=$8,interest_rate=$9,start_date=$10,end_date=$11,total_periods=$12,monthly_payment=$13,payment_day=$14,status=$15,contact_person=$16,contact_phone=$17,notes=$18,updated_at=NOW() WHERE id=$19 RETURNING *`,
      [loanName, loanType||"車輛貸款", bankName||null, bankBranch||null, accountNo||null, vehicleId||null, plateNo||null, principal||0, interestRate||0, startDate, endDate, totalPeriods||1, monthlyPayment||0, paymentDay||1, status||"active", contactPerson||null, contactPhone||null, notes||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

loanManagementRouter.delete("/loans/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM loan_accounts WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 還款記錄 ──────────────────────────────────────────────────────────────────

loanManagementRouter.get("/loan-payments", async (req, res) => {
  try {
    const { loanId, status, dateFrom, dateTo } = req.query as Record<string, string>;
    let q = `SELECT lp.*, la.loan_name, la.plate_no, la.bank_name FROM loan_payments lp JOIN loan_accounts la ON la.id=lp.loan_id WHERE 1=1`;
    const p: any[] = [];
    if (loanId)   { p.push(loanId);   q += ` AND lp.loan_id=$${p.length}`; }
    if (status)   { p.push(status);   q += ` AND lp.status=$${p.length}`; }
    if (dateFrom) { p.push(dateFrom); q += ` AND lp.due_date>=$${p.length}`; }
    if (dateTo)   { p.push(dateTo);   q += ` AND lp.due_date<=$${p.length}`; }
    q += ` ORDER BY lp.due_date, lp.period_no`;
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

loanManagementRouter.post("/loan-payments", async (req, res) => {
  try {
    const { loanId, periodNo, dueDate, principalAmt, interestAmt, totalAmt, remainingBal, paidDate, paidAmount, status, receiptNo, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO loan_payments (loan_id,period_no,due_date,principal_amt,interest_amt,total_amt,remaining_bal,paid_date,paid_amount,status,receipt_no,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [loanId, periodNo||1, dueDate, principalAmt||0, interestAmt||0, totalAmt||0, remainingBal||0, paidDate||null, paidAmount||null, status||"pending", receiptNo||null, notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

loanManagementRouter.put("/loan-payments/:id", async (req, res) => {
  try {
    const { periodNo, dueDate, principalAmt, interestAmt, totalAmt, remainingBal, paidDate, paidAmount, status, receiptNo, notes } = req.body;
    const r = await pool.query(
      `UPDATE loan_payments SET period_no=$1,due_date=$2,principal_amt=$3,interest_amt=$4,total_amt=$5,remaining_bal=$6,paid_date=$7,paid_amount=$8,status=$9,receipt_no=$10,notes=$11 WHERE id=$12 RETURNING *`,
      [periodNo||1, dueDate, principalAmt||0, interestAmt||0, totalAmt||0, remainingBal||0, paidDate||null, paidAmount||null, status||"pending", receiptNo||null, notes||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

loanManagementRouter.delete("/loan-payments/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM loan_payments WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 標記已繳 ─────────────────────────────────────────────────────────────────

loanManagementRouter.post("/loan-payments/:id/mark-paid", async (req, res) => {
  try {
    const { paidDate, paidAmount, receiptNo } = req.body;
    const r = await pool.query(
      `UPDATE loan_payments SET status='paid', paid_date=$1, paid_amount=$2, receipt_no=$3 WHERE id=$4 RETURNING *`,
      [paidDate || new Date().toISOString().slice(0,10), paidAmount||null, receiptNo||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
