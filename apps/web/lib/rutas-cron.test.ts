import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUTAS_DE_CRON, cronAutorizado, pasaComoCron } from "./rutas-cron";

describe("cronAutorizado: la clave del cron", () => {
  it("sin CRON_SECRET no pasa nadie, tampoco quien manda «Bearer undefined» o «Bearer »", () => {
    expect(cronAutorizado("Bearer undefined", undefined)).toBe(false);
    expect(cronAutorizado("Bearer ", "")).toBe(false);
    expect(cronAutorizado(null, undefined)).toBe(false);
  });
  it("con otra clave, sin «Bearer» o sin encabezado, no pasa", () => {
    expect(cronAutorizado("Bearer otra", "clave")).toBe(false);
    expect(cronAutorizado("clave", "clave")).toBe(false);
    expect(cronAutorizado(null, "clave")).toBe(false);
  });
  it("con la clave, pasa", () => {
    expect(cronAutorizado("Bearer clave", "clave")).toBe(true);
  });
});

describe("pasaComoCron: proxy.ts solo abre las rutas del cron", () => {
  it("una ruta del cron con la clave pasa", () => {
    expect(pasaComoCron("/api/club/conservacion", "Bearer clave", "clave")).toBe(true);
    expect(pasaComoCron("/api/lucode/reintentar", "Bearer clave", "clave")).toBe(true);
  });
  it("la clave no abre ninguna otra ruta, ni una que solo empiece igual", () => {
    expect(pasaComoCron("/clientas", "Bearer clave", "clave")).toBe(false);
    expect(pasaComoCron("/api/club/conservacion/otra", "Bearer clave", "clave")).toBe(false);
    expect(pasaComoCron("/api/club", "Bearer clave", "clave")).toBe(false);
  });
  it("sin la clave, ni las del cron", () => {
    expect(pasaComoCron("/api/club/conservacion", null, "clave")).toBe(false);
  });
});

describe("vercel.json y las rutas del cron dicen lo mismo", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons?: { path: string; schedule: string }[] };
  const crons = vercel.crons ?? [];

  it("todo cron de vercel.json está en RUTAS_DE_CRON (si no, proxy.ts lo frena sin sesión) y viceversa", () => {
    expect(crons.map((c) => c.path).sort()).toEqual([...RUTAS_DE_CRON].sort());
  });

  it("cada ruta del cron existe y responde GET (Vercel llama con GET)", () => {
    for (const ruta of RUTAS_DE_CRON) {
      const archivo = new URL(`../app${ruta}/route.ts`, import.meta.url);
      expect(existsSync(archivo), ruta).toBe(true);
      expect(readFileSync(archivo, "utf8"), ruta).toMatch(/export async function GET\b/);
    }
  });

  it("los crons diarios (la conservación del club y la vara de CAYLA) corren de madrugada en Lima (UTC−5)", () => {
    // Vercel evalúa el horario en UTC. Un cron nuevo que corra de día (tiendas abiertas, la foto a mitad de jornada) falla aquí.
    // Diario = un minuto y una hora fijos (el reintento de Lucode, cada 5 minutos, no es una foto y no entra).
    const diarios = crons.filter((c) => /^\d+ \d+ \* \* \*$/.test(c.schedule));
    expect(diarios.map((c) => c.path).sort()).toEqual(["/api/club/conservacion", "/api/inventario/frescura-vara-cayla"]);
    for (const c of diarios) {
      const [minuto, hora] = c.schedule.split(" ");
      expect(Number(minuto), c.path).toBeGreaterThanOrEqual(0);
      const horaLima = (Number(hora) + 24 - 5) % 24;
      expect(horaLima, c.path).toBeGreaterThanOrEqual(1);
      expect(horaLima, c.path).toBeLessThanOrEqual(5);
    }
  });
});
