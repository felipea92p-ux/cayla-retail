import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cronAutorizado, RUTAS_DE_CRON } from "./cron";

// La ruta programada de la tienda (borrar los usuarios de las cuentas cerradas) solo la abre la clave del cron de Vercel.

describe("el cron de la tienda", () => {
  it("pasa solo con «Bearer <CRON_SECRET>»; sin la variable, nadie", () => {
    expect(cronAutorizado("Bearer s3creto-largo", "s3creto-largo")).toBe(true);
    expect(cronAutorizado("Bearer otro", "s3creto-largo")).toBe(false);
    expect(cronAutorizado("s3creto-largo", "s3creto-largo")).toBe(false);
    expect(cronAutorizado(null, "s3creto-largo")).toBe(false);
    expect(cronAutorizado("Bearer undefined", undefined)).toBe(false);
    expect(cronAutorizado("Bearer ", "")).toBe(false);
    expect(cronAutorizado("Bearer  ", " ")).toBe(false);
  });

  it("las rutas del cron son las de vercel.json, y cada una existe", () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, "..", "vercel.json"), "utf8")) as { crons: { path: string }[] };
    expect(vercel.crons.map((c) => c.path).sort()).toEqual([...RUTAS_DE_CRON].sort());
    for (const ruta of RUTAS_DE_CRON) {
      expect(() => readFileSync(resolve(__dirname, "..", "app", `${ruta.slice(1)}/route.ts`), "utf8")).not.toThrow();
    }
  });
});
