import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "furyong-dev-secret-change-in-production";
const EXPIRES = "30d";

export interface JwtPayload {
  sub: string;
  role: "customer" | "driver" | "admin";
  id: number;
  name: string;
  phone?: string;
  username?: string;
}

export function signJwt(payload: Omit<JwtPayload, "sub">): string {
  const sub = `${payload.role}:${payload.id}`;
  return jwt.sign({ ...payload, sub }, SECRET, { expiresIn: EXPIRES });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
