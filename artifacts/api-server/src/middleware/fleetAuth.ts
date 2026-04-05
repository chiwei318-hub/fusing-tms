/**
 * fleetAuth.ts
 * JWT middleware for franchise fleet owners and fleet-scoped drivers.
 *
 * Fleet owners get role='fleet_owner', franchisee_id in their JWT payload.
 * Fleet drivers get role='fleet_driver', franchisee_id + driver_id in payload.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyJwt, extractBearerToken } from "../lib/jwt";

export interface FleetPayload {
  role: "fleet_owner" | "fleet_driver";
  franchisee_id: number;
  franchisee_name?: string;
  driver_id?: number;
  driver_name?: string;
}

declare global {
  namespace Express {
    interface Request {
      fleet?: FleetPayload;
    }
  }
}

export function requireFleetOwner(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "未登入" });

  const payload = verifyJwt(token) as FleetPayload | null;
  if (!payload || payload.role !== "fleet_owner") {
    return res.status(403).json({ error: "僅限車行管理員操作" });
  }
  req.fleet = payload;
  next();
}

export function requireFleetDriver(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "未登入" });

  const payload = verifyJwt(token) as FleetPayload | null;
  if (!payload || payload.role !== "fleet_driver") {
    return res.status(403).json({ error: "僅限司機操作" });
  }
  req.fleet = payload;
  next();
}

export function requireFleetMember(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "未登入" });

  const payload = verifyJwt(token) as FleetPayload | null;
  if (!payload || !["fleet_owner", "fleet_driver"].includes(payload.role)) {
    return res.status(403).json({ error: "無效的身份" });
  }
  req.fleet = payload;
  next();
}
