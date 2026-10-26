import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deLaLinea, ejemploDeTipo, leerObservacion, leerObservaciones, MAX_MENSAJE_OBSERVACION, nombreDeTipo, problemaDeObservacion, TIPOS_OBSERVACION } from "./observaciones-envio-reglas";

const MIGRACION = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261024235000_observaciones_de_envio.sql"), "utf8");

describe("observaciones de un envío (ADR-0507)", () => {
  it("los tipos de la pantalla son los mismos que acepta la base (CHECK y función)", () => {
    const enLaBase = (re: RegExp) => [...(MIGRACION.match(re)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const delCheck = enLaBase(/tipo in \(([^)]*)\)\)/);
    const delasFuncion = enLaBase(/p_tipo not in \(([^)]*)\)/);
    const web = TIPOS_OBSERVACION.map((t) => t.valor).sort();
    expect(delCheck).toEqual(web);
    expect(delasFuncion).toEqual(web);
  });

  it("cada tipo tiene nombre, ayuda y ejemplo propios", () => {
    const nombres = new Set(TIPOS_OBSERVACION.map((t) => t.nombre));
    expect(nombres.size).toBe(TIPOS_OBSERVACION.length);
    for (const t of TIPOS_OBSERVACION) {
      expect(nombreDeTipo(t.valor)).toBe(t.nombre);
      expect(ejemploDeTipo(t.valor)).toBe(t.ejemplo);
      expect(t.ayuda.length).toBeGreaterThan(5);
    }
    expect(ejemploDeTipo(null)).toMatch(/Elige/);
  });

  it("dice qué falta para guardar", () => {
    expect(problemaDeObservacion(null, "algo")).toBe("Elige qué pasó.");
    expect(problemaDeObservacion("prenda_rota", "   ")).toBe("Escribe qué viste.");
    expect(problemaDeObservacion("prenda_rota", "x".repeat(MAX_MENSAJE_OBSERVACION + 1))).toMatch(/muy largo/);
    expect(problemaDeObservacion("prenda_rota", "x".repeat(MAX_MENSAJE_OBSERVACION))).toBeNull();
  });

  it("lee lo que manda la base y descarta lo que no entiende", () => {
    const fila = { id: "o1", despacho_item_id: "i1", tipo: "prenda_rota", mensaje: " 2 rotas ", creado_por: { id: "p", nombre: "Felipe Alvarez" }, creado_en: "2026-10-24T22:00:00Z" };
    expect(leerObservacion(fila)).toEqual({ id: "o1", despachoItemId: "i1", tipo: "prenda_rota", mensaje: "2 rotas", creadoPor: "Felipe Alvarez", creadoEn: "2026-10-24T22:00:00Z" });
    expect(leerObservacion({ ...fila, tipo: "inventado" })).toBeNull();
    expect(leerObservacion({ ...fila, mensaje: "" })).toBeNull();
    expect(leerObservaciones({ despacho_id: "d", observaciones: [fila, { id: "x" }] })).toHaveLength(1);
    expect(leerObservaciones(null)).toEqual([]);
  });

  it("separa las de una línea de las del envío entero", () => {
    const o = (id: string, item: string | null) => ({ id, despachoItemId: item, tipo: "otro" as const, mensaje: "m", creadoPor: null, creadoEn: null });
    const todas = [o("a", "i1"), o("b", null), o("c", "i1"), o("d", "i2")];
    expect(deLaLinea(todas, "i1").map((x) => x.id)).toEqual(["a", "c"]);
    expect(deLaLinea(todas, null).map((x) => x.id)).toEqual(["b"]);
  });
});
