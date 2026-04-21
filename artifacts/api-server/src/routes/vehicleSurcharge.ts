import { Router } from "express";

export const vehicleSurchargeRouter = Router();

/**
 * 車型附加費計算引擎
 * 依車型權重、設備加成、特殊狀況計算最終報價
 */

// 車型權重定義（對應台灣常見噸位）
const VEHICLE_WEIGHTS: Record<string, { multiplier: number; label: string; ton: string }> = {
  CLASS_A: { multiplier: 1.0, label: "小型貨車",   ton: "3.5噸"  },
  CLASS_B: { multiplier: 1.6, label: "中型貨車",   ton: "8.5噸"  },
  CLASS_C: { multiplier: 2.8, label: "大型貨車",   ton: "17噸"   },
  CLASS_D: { multiplier: 4.2, label: "聯結車",     ton: "35噸"   },
};

// 設備費用定義
const ADDON_FEES: Record<string, { label: string; type: "fixed" | "multiplier"; value: number }> = {
  tailgate:    { label: "升降尾門",   type: "fixed",      value: 500  },
  refrigerated:{ label: "冷凍加成",   type: "multiplier", value: 1.5  },
  gullwing:    { label: "鷗翼車廂",   type: "fixed",      value: 300  },
  crane:       { label: "吊掛設備",   type: "fixed",      value: 800  },
  helper:      { label: "助手隨車",   type: "fixed",      value: 600  },
  night:       { label: "夜間/假日",  type: "fixed",      value: 500  },
  remote:      { label: "偏遠山區",   type: "fixed",      value: 400  },
};

export function calculateVehicleSurcharge(
  base_price: number,
  vehicle_type: string,
  addons: string[]
): {
  base_price: number;
  vehicle_type: string;
  vehicle_label: string;
  multiplier: number;
  adjusted_price: number;
  addon_breakdown: { key: string; label: string; amount: number }[];
  equipment_fee: number;
  final_price: number;
} {
  const vehicle = VEHICLE_WEIGHTS[vehicle_type] ?? VEHICLE_WEIGHTS["CLASS_A"];
  const multiplier   = vehicle.multiplier;
  let adjusted_price = base_price * multiplier;

  let equipment_fee = 0;
  const addon_breakdown: { key: string; label: string; amount: number }[] = [];

  for (const addon of addons) {
    const def = ADDON_FEES[addon];
    if (!def) continue;
    if (def.type === "multiplier") {
      const before = adjusted_price;
      adjusted_price *= def.value;
      const amount = Math.round(adjusted_price - before);
      addon_breakdown.push({ key: addon, label: def.label, amount });
    } else {
      equipment_fee += def.value;
      addon_breakdown.push({ key: addon, label: def.label, amount: def.value });
    }
  }

  const final_price = Math.round(adjusted_price + equipment_fee);

  return {
    base_price,
    vehicle_type,
    vehicle_label: `${vehicle.label}（${vehicle.ton}）`,
    multiplier,
    adjusted_price: Math.round(adjusted_price),
    addon_breakdown,
    equipment_fee,
    final_price,
  };
}

/**
 * POST /api/vehicle-surcharge/calculate
 * Body: { base_price, vehicle_type, addons }
 */
vehicleSurchargeRouter.post("/vehicle-surcharge/calculate", (req, res) => {
  try {
    const { base_price, vehicle_type, addons } = req.body as {
      base_price: number;
      vehicle_type: string;
      addons: string[];
    };

    if (!base_price || base_price <= 0)
      return res.status(400).json({ ok: false, error: "base_price 必須大於 0" });
    if (!vehicle_type || !VEHICLE_WEIGHTS[vehicle_type])
      return res.status(400).json({ ok: false, error: `無效的 vehicle_type，請使用：${Object.keys(VEHICLE_WEIGHTS).join(", ")}` });

    const result = calculateVehicleSurcharge(
      Number(base_price),
      vehicle_type,
      Array.isArray(addons) ? addons : []
    );

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/vehicle-surcharge/options
 * 回傳所有可選車型與設備選項
 */
vehicleSurchargeRouter.get("/vehicle-surcharge/options", (_req, res) => {
  res.json({
    ok: true,
    vehicle_types: Object.entries(VEHICLE_WEIGHTS).map(([key, v]) => ({
      key, label: v.label, ton: v.ton, multiplier: v.multiplier,
    })),
    addons: Object.entries(ADDON_FEES).map(([key, a]) => ({
      key, label: a.label, type: a.type, value: a.value,
    })),
  });
});
