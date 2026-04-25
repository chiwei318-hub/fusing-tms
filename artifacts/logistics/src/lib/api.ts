export function apiUrl(path: string): string {
  return `/api${path.startsWith("/") ? path : "/" + path}`;
}

export function getApiUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return `${cleanBase}${cleanPath}`;
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth-jwt");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}
