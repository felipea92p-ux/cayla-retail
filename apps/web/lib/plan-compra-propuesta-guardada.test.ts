import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_PROPUESTA, esFirmaDesconocida, guardarConPropuesta, propuestaParaGuardar } from "./plan-compra-propuesta-guardada";
import { leerPropuesta, proponer, type LecturaPropuesta, type PropuestaCategoria, type TiendaPropuesta } from "./plan-compra-propuesta";
import { argsGuardar, type Borrador } from "./plan-compra-reglas";

const tienda = (id: string): TiendaPropuesta => ({ id, nombre: `Tienda ${id}`, dias90: 90, ventanas: 6, previaDisponible: false, multiplicador: null, multiplicadorHistorial: null });
const lectura = (ids: string[]): LecturaPropuesta => ({
  planId: "p",
  diasCampana: 31,
  previa: { desde: "2025-12-01", hasta: "2025-12-31" },
  recupero: { pct: null, heredado: false },
  tiendas: ids.map(tienda),
  categorias: new Map([["polos", ids.map((id) => ({ tienda: id, u90: 300, ventanas: [90, 100, 110, 95, 105, 98], previa: 0, agotada: false }))]]),
  tiendasActivas: ids.map((id) => ({ id, nombre: `Tienda ${id}` })),
  minimos: new Map(),
  historialLeido: true,
});
const propuesta = (ids: string[] = ["tru", "aqp"]): PropuestaCategoria => proponer(lectura(ids), "polos")!;

describe("propuestaParaGuardar: lo que la pantalla MOSTRÓ", () => {
  it("la base no manda propuestas (undefined): no se manda nada", () => {
    expect(propuestaParaGuardar(undefined, "2026-10-26T10:00:00.000Z")).toBeNull();
  });

  it("la categoría no vendió en 90 días (null): queda anotado que el sistema no tenía nada que proponer", () => {
    expect(propuestaParaGuardar(null, "2026-10-26T10:00:00.000Z")).toEqual({ v: 1, calculada_en: "2026-10-26T10:00:00.000Z", sin_ventas: true });
  });

  it("una propuesta lleva sus tres cifras, los días, el historial y cómo salió cada tienda", () => {
    const p = propuesta();
    const g = propuestaParaGuardar(p, "2026-10-26T10:00:00.000Z")!;
    expect([g.v, g.calculada_en, g.dias_campana, g.flojo, g.normal, g.bueno, g.historial_leido]).toEqual([1, "2026-10-26T10:00:00.000Z", 31, p.flojo, p.normal, p.bueno, true]);
    expect(g.dias_de_ventas).toBe(90);
    expect(g.tiendas?.map((t) => t.tienda)).toEqual(["Tienda tru", "Tienda aqp"]);
    expect(g.tiendas?.[0]).toEqual({ tienda: "Tienda tru", normal: p.tiendas[0].normal, flojo: p.tiendas[0].flojo, bueno: p.tiendas[0].bueno, como: p.tiendas[0].como, multiplicador: p.tiendas[0].multiplicador, previa: p.tiendas[0].previa });
  });

  it("si no se sabe cuándo se leyó, lo dice con null (no inventa una hora)", () => {
    expect(propuestaParaGuardar(propuesta(), undefined)?.calculada_en).toBeNull();
  });

  it("es JSON puro: ida y vuelta sin perder nada (lo que la base guarda es lo que se vio)", () => {
    const g = propuestaParaGuardar(propuesta(), "2026-10-26T10:00:00.000Z");
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it("con tantas tiendas que no cabe, manda las tres cifras SIN el detalle por tienda (nunca rechaza el guardado)", () => {
    const muchas = Array.from({ length: 120 }, (_, i) => `tienda-con-nombre-largo-${i}`);
    const p = propuesta(muchas);
    const g = propuestaParaGuardar(p, "2026-10-26T10:00:00.000Z")!;
    expect(JSON.stringify(g).length).toBeLessThanOrEqual(MAX_PROPUESTA);
    expect(g.tiendas).toBeUndefined();
    expect([g.flojo, g.normal, g.bueno]).toEqual([p.flojo, p.normal, p.bueno]);
  });

  it("el tope es el mismo que el de la migración: si uno cambia sin el otro, falla", () => {
    const migracion = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261026171000_plan_compra_historial_de_lineas.sql"), "utf8");
    expect(migracion).toContain(`octet_length(propuesta::text) <= ${MAX_PROPUESTA}`);
    expect(migracion).toContain(`octet_length(v_propuesta::text) > ${MAX_PROPUESTA}`);
  });
});

describe("leerPropuesta anota cuándo llegó la lectura", () => {
  it("con la hora que se le da (una pestaña vieja dice la hora vieja)", () => {
    const cruda = {
      plan_id: "p",
      dias_campana: 31,
      previa: { desde: "2025-12-01", hasta: "2025-12-31" },
      recupero_defecto: { pct: 40, heredado: true },
      tiendas: [{ id: "tru", nombre: "Tienda TRU", dias_90: 90, ventanas: 6, previa_disponible: true, multiplicador: "1.8" }],
      categorias: [{ c: "polos", u: "tru", u90: 489, ventanas: [163, 150], previa: 400, agotada: false }],
    };
    expect(leerPropuesta(cruda, new Date("2026-10-25T08:30:00.000Z"))?.leidaEn).toBe("2026-10-25T08:30:00.000Z");
  });
});

describe("argsGuardar manda la propuesta solo si la hay", () => {
  const b: Borrador = { flojo: "80", normal: "120", bueno: "180", precio: "79.90", costo: "32", recupero: "50", curva: {} };
  it("sin propuesta, la llamada es la de siempre", () => {
    expect("p_propuesta" in argsGuardar("p", "c", b, [], "")).toBe(false);
    expect("p_propuesta" in argsGuardar("p", "c", b, [], "", undefined, false, null)).toBe(false);
  });
  it("con propuesta, va como p_propuesta", () => {
    const g = propuestaParaGuardar(propuesta(), "2026-10-26T10:00:00.000Z");
    expect(argsGuardar("p", "c", b, [], "", undefined, false, g).p_propuesta).toEqual(g);
  });
});

describe("esFirmaDesconocida: la web salió antes que la migración", () => {
  it("lo reconoce por el código de PostgREST, el de Postgres o el texto", () => {
    expect(esFirmaDesconocida({ code: "PGRST202", message: "x" })).toBe(true);
    expect(esFirmaDesconocida({ code: "42883", message: "x" })).toBe(true);
    expect(esFirmaDesconocida({ message: "Could not find the function retail.guardar_plan_compra_linea(p_a, p_propuesta) in the schema cache" })).toBe(true);
  });
  it("un conflicto de versión, un permiso, una red caída o ningún error NO lo son", () => {
    expect(esFirmaDesconocida({ code: "PT409", message: "otra persona guardó" })).toBe(false);
    expect(esFirmaDesconocida({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esFirmaDesconocida({ message: "TypeError: Failed to fetch" })).toBe(false);
    expect(esFirmaDesconocida(null)).toBe(false);
  });
});

describe("guardarConPropuesta: el guardado nunca se pierde por la propuesta", () => {
  const args = { p_plan_id: "p", p_normal: 120, p_propuesta: { v: 1, calculada_en: null } };
  const bien = { data: { version: 3 }, error: null };

  it("la base la conoce: un solo llamado, con la propuesta", async () => {
    const llamar = vi.fn().mockResolvedValue(bien);
    expect(await guardarConPropuesta(llamar, args)).toBe(bien);
    expect(llamar).toHaveBeenCalledTimes(1);
    expect(llamar.mock.calls[0][0]).toBe(args);
  });

  it("la base todavía no la conoce: repite el MISMO guardado sin la propuesta, y devuelve ese resultado", async () => {
    const llamar = vi.fn().mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }).mockResolvedValueOnce(bien);
    expect(await guardarConPropuesta(llamar, args)).toBe(bien);
    expect(llamar).toHaveBeenCalledTimes(2);
    expect(llamar.mock.calls[1][0]).toEqual({ p_plan_id: "p", p_normal: 120 });
  });

  it("si el segundo también falla, devuelve ESE error (no esconde el verdadero)", async () => {
    const mal = { data: null, error: { code: "42501", message: "permission denied" } };
    const llamar = vi.fn().mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "x" } }).mockResolvedValueOnce(mal);
    expect(await guardarConPropuesta(llamar, args)).toBe(mal);
  });

  it("otro error (conflicto de versión) sale tal cual: no se reintenta", async () => {
    const conflicto = { data: null, error: { code: "PT409", message: "otra persona guardó" } };
    const llamar = vi.fn().mockResolvedValue(conflicto);
    expect(await guardarConPropuesta(llamar, args)).toBe(conflicto);
    expect(llamar).toHaveBeenCalledTimes(1);
  });

  it("sin propuesta en la llamada no hay nada que quitar: un PGRST202 sale tal cual", async () => {
    const falta = { data: null, error: { code: "PGRST202", message: "x" } };
    const llamar = vi.fn().mockResolvedValue(falta);
    expect(await guardarConPropuesta(llamar, { p_plan_id: "p" })).toBe(falta);
    expect(llamar).toHaveBeenCalledTimes(1);
  });
});
