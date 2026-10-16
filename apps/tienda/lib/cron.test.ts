import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pasaComoCron, RUTAS_DE_CRON } from "./cron";

// La ruta programada de la tienda (borrar los usuarios de las cuentas cerradas) solo la abre la clave del cron de Vercel.

describe("el cron de la tienda", () => {
  const RUTA = "/api/cuentas-cerradas";

  it("pasa solo con «Bearer <CRON_SECRET>»; sin la variable, nadie", () => {
    expect(pasaComoCron(RUTA, "Bearer s3creto-largo", "s3creto-largo")).toBe(true);
    expect(pasaComoCron(RUTA, "Bearer otro", "s3creto-largo")).toBe(false);
    expect(pasaComoCron(RUTA, "s3creto-largo", "s3creto-largo")).toBe(false);
    expect(pasaComoCron(RUTA, null, "s3creto-largo")).toBe(false);
    expect(pasaComoCron(RUTA, "Bearer undefined", undefined)).toBe(false);
    expect(pasaComoCron(RUTA, "Bearer ", "")).toBe(false);
    expect(pasaComoCron(RUTA, "Bearer  ", " ")).toBe(false);
  });

  it("la clave abre solo las rutas del cron", () => {
    expect(pasaComoCron("/api/otra", "Bearer s3creto-largo", "s3creto-largo")).toBe(false);
    expect(pasaComoCron("/cuenta", "Bearer s3creto-largo", "s3creto-largo")).toBe(false);
    expect(pasaComoCron(`${RUTA}/`, "Bearer s3creto-largo", "s3creto-largo")).toBe(false);
  });

  it("las rutas del cron son las de vercel.json, y cada una existe", () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, "..", "vercel.json"), "utf8")) as { crons: { path: string }[] };
    expect(vercel.crons.map((c) => c.path).sort()).toEqual([...RUTAS_DE_CRON].sort());
    for (const ruta of RUTAS_DE_CRON) {
      expect(() => readFileSync(resolve(__dirname, "..", "app", `${ruta.slice(1)}/route.ts`), "utf8")).not.toThrow();
    }
  });
});
