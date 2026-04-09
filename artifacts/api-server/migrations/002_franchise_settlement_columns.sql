-- Migration: 加盟主清算欄位
-- 在 order_settlements 加入保險費、手續費、加盟主撥款欄位
-- 以及 pricing_config 預設費率設定

-- 1. 新增欄位至 order_settlements
ALTER TABLE order_settlements
  ADD COLUMN IF NOT EXISTS insurance_rate          numeric(5,2)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_fee           numeric(12,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_fee_rate          numeric(5,2)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_handling_fee      numeric(12,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS franchisee_id           integer        REFERENCES franchisees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS franchisee_payout       numeric(12,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS franchisee_payment_status text         NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS franchisee_paid_at      timestamptz,
  ADD COLUMN IF NOT EXISTS franchisee_payment_ref  text,
  ADD COLUMN IF NOT EXISTS atoms_pushed_at         timestamptz;

-- 2. 新增費率設定到 pricing_config（若尚未存在）
INSERT INTO pricing_config (key, value, label, updated_at)
VALUES
  ('insurance_rate',   '1.0',  '每單保險費率 (%)',  NOW()),
  ('other_fee_rate',   '0.5',  '其他手續費率 (%)',  NOW()),
  ('other_fee_fixed',  '0',    '固定手續費 (NT$)',  NOW())
ON CONFLICT (key) DO NOTHING;

-- 3. 建立加盟主付款狀態索引
CREATE INDEX IF NOT EXISTS idx_order_settlements_franchisee_id
  ON order_settlements (franchisee_id);
CREATE INDEX IF NOT EXISTS idx_order_settlements_franchisee_payment_status
  ON order_settlements (franchisee_payment_status);
