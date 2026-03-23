export function apiUrl(path: string): string {
  return `/api${path.startsWith("/") ? path : "/" + path}`;
}
