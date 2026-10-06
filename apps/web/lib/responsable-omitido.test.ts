import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCIONES_SIN_RESPONSABLE, ENCABEZADO_OMITIDO, encabezadosOmitidos, firmaOmitida } from "./responsable-omitido";
import { encabezadosResponsable, firmaDeEncabezados, firmar } from "./responsable-reglas";

// Las 28 acciones (de las 30 que Felipe marcó) que se soltaron del combo «Responsable» (2026-09-29). Lo que estas pruebas cuidan:
//  1. La lista de la web y la de la base (migración 20260929230000) son la misma: una clave que la web manda y la base no
//     conoce se ignora, y la acción falla con «Elige quién hace esta operación» — sin ningún aviso antes.
//  2. La firma omitida sale como UN encabezado con la clave; la firma de siempre no cambió.

const MIGRACION = readFileSync(new URL("../../../supabase/migrations/20260929230000_acciones_sin_responsable.sql", import.meta.url), "utf8");
// La descripción vigente de cada clave: la de la siembra, con los `update … set descripcion` de migraciones posteriores encima
// (20261002160000: «clienta» → «cliente», ADR-0288 act. k).
const DIR = new URL("../../../supabase/migrations/", import.meta.url);
const DESCRIPCION_VIGENTE = new Map([...MIGRACION.matchAll(/^\s+\('([a-z0-9_]+)',\s*'([^']*)'\)/gm)].map((m) => [m[1]!, m[2]!]));
for (const f of readdirSync(DIR).filter((x) => /^\d{14}_.+\.sql$/.test(x) && x > "20260929230000").sort()) {
  const sql = readFileSync(new URL(f, DIR), "utf8");
  for (const m of sql.matchAll(/update retail\.acciones_sin_responsable set descripcion = '([^']*)' where clave = '([a-z0-9_]+)'/g)) {
    DESCRIPCION_VIGENTE.set(m[2]!, m[1]!);
  }
  // Las acciones que se suman después (20261002170000: los tres de Avisos del club; 20261005100100, 20261005110000 y 20261005120000: cerrar, reabrir e identificar en la cola de arranque).
  for (const ins of sql.matchAll(/insert into retail\.acciones_sin_responsable \(clave, descripcion\) values([\s\S]*?);/g)) {
    for (const m of ins[1]!.matchAll(/\('([a-z0-9_]+)',\s*'([^']*)'\)/g)) DESCRIPCION_VIGENTE.set(m[1]!, m[2]!);
  }
  // Las que vuelven a pedir responsable (20261006180100: Editar producto, ADR-0354).
  for (const m of sql.matchAll(/^delete from retail\.acciones_sin_responsable where clave = '([a-z0-9_]+)';/gm)) DESCRIPCION_VIGENTE.delete(m[1]!);
}

describe("acciones sin responsable", () => {
  const clavesBase = [...MIGRACION.matchAll(/^\s+\('([a-z0-9_]+)',\s*'/gm)].map((m) => m[1]);

  it("la web y las migraciones tienen exactamente las mismas claves: las 28 de la siembra, las 3 de Avisos del club y las tres de la cola de arranque (cerrar, reabrir e identificar), menos Editar producto (ADR-0354) y Regularizar prenda", () => {
    expect(clavesBase).toHaveLength(28);
    expect([...DESCRIPCION_VIGENTE.keys()].sort()).toEqual(Object.keys(ACCIONES_SIN_RESPONSABLE).sort());
    expect(DESCRIPCION_VIGENTE.size).toBe(32);
    expect(DESCRIPCION_VIGENTE.has("producto_confirmar_cambios")).toBe(false);
    expect(DESCRIPCION_VIGENTE.has("regularizar_prenda")).toBe(false);
  });

  it("cada clave lleva la misma descripción en la web y en la base (la siembra, con sus cambios posteriores)", () => {
    for (const [clave, texto] of Object.entries(ACCIONES_SIN_RESPONSABLE)) {
      expect(DESCRIPCION_VIGENTE.get(clave), clave).toBe(texto);
    }
  });

  it("ninguna acción de dinero, caja ni venta está soltada", () => {
    for (const clave of Object.keys(ACCIONES_SIN_RESPONSABLE)) expect(clave).not.toMatch(/caja|venta|gasto|cierre_mes|devolucion|pago/);
  });

  it("firmar(consulta, firmaOmitida(clave)) manda solo el encabezado de la clave", () => {
    const puestos: Record<string, string> = {};
    const consulta = { setHeader(n: string, v: string) { puestos[n] = v; return this; } };
    firmar(consulta, firmaOmitida("conteo_cerrar"));
    expect(puestos).toEqual({ [ENCABEZADO_OMITIDO]: "conteo_cerrar" });
  });

  it("la firma de siempre no cambió: x-responsable y x-ubicacion, sin el encabezado omitido", () => {
    const puestos: Record<string, string> = {};
    const consulta = { setHeader(n: string, v: string) { puestos[n] = v; return this; } };
    firmar(consulta, { responsableId: "p1", ubicacionId: "u1" });
    expect(puestos).toEqual({ "x-responsable": "p1", "x-ubicacion": "u1" });
  });

  it("sin firma la consulta sale igual que antes", () => {
    const puestos: Record<string, string> = {};
    const consulta = { setHeader(n: string, v: string) { puestos[n] = v; return this; } };
    firmar(consulta, null);
    expect(puestos).toEqual({});
  });

  it("una ruta /api reenvía la clave a la base: firmaDeEncabezados la recoge y encabezadosResponsable la vuelve a poner", () => {
    const h = new Headers({ "x-responsable-omitido": "color_rechazar" });
    const firma = firmaDeEncabezados(h);
    expect(firma).toEqual({ omitida: "color_rechazar" });
    expect(encabezadosResponsable(firma!)).toEqual({ "x-responsable-omitido": "color_rechazar" });
  });

  it("una ruta /api descarta una clave que no está en la lista, o que llega junto a un responsable", () => {
    expect(firmaDeEncabezados(new Headers({ "x-responsable-omitido": "caja_cerrar" }))).toBeNull();
    expect(firmaDeEncabezados(new Headers())).toBeNull();
    expect(
      firmaDeEncabezados(new Headers({ "x-responsable": "p1", "x-ubicacion": "u1", "x-responsable-omitido": "color_rechazar" })),
    ).toEqual({ responsableId: "p1", ubicacionId: "u1", momento: null });
  });

  it("encabezadosOmitidos sirve para un fetch a una ruta /api", () => {
    expect(encabezadosOmitidos("color_rechazar")).toEqual({ "x-responsable-omitido": "color_rechazar" });
  });
});
