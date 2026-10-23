export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

function fmt(fields?: Record<string, unknown>): string {
  if (!fields) return "";
  return (
    " " +
    Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === "bigint" ? v.toString() : typeof v === "object" ? JSON.stringify(v, big) : v}`)
      .join(" ")
  );
}

function big(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

export const consoleLogger: Logger = {
  info: (m, f) => console.log(`${new Date().toISOString()} info  ${m}${fmt(f)}`),
  warn: (m, f) => console.warn(`${new Date().toISOString()} warn  ${m}${fmt(f)}`),
  error: (m, f) => console.error(`${new Date().toISOString()} error ${m}${fmt(f)}`),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
