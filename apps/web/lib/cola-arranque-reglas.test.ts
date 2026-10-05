import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTIVOS_CIERRE, MOTIVOS_REAPERTURA, armarSugerencias, avisoAlReabrir, avisosDePlazo, diasDePlazo, errorDeSugerencias, paresParaConfirmar, textoCierreHecho, motivoLegible, plazoVigente, sedesParaCerrar, type FilaDeCola, type PrendaDelCatalogo, type VentaPendiente } from "./cola-arranque-reglas";

// 2026-10-04 12:00 en Lima = 17:00 UTC.
const AHORA = new Date("2026-10-04T17:00:00Z");
const TRU = "tru";
const AQP = "aqp";

const fila = (p: Partial<FilaDeCola> = {}): FilaDeCola => ({
  estado: "pendiente",
  ubicacionId: TRU,
  sede: "Tienda TRU",
  precioCobrado: 50,
  vendidoEn: "2026-10-03T15:00:00.123456+00:00",
  ...p,
});

describe("plazoVigente / diasDePlazo", () => {
  it("el último día del plazo todavía vale (inclusivo, igual que la base)", () => {
    expect(plazoVigente("2026-10-15", "2026-10-15")).toBe(true);
    expect(plazoVigente("2026-10-15", "2026-10-16")).toBe(false);
    expect(plazoVigente("2026-10-15", "2026-10-04")).toBe(true);
  });
  it("sin plazo no se puede (la salida de emergencia nace cerrada)", () => {
    expect(plazoVigente(null, "2026-10-04")).toBe(false);
    expect(diasDePlazo(null, "2026-10-04")).toBeNull();
  });
  it("cuenta los días que quedan: 0 el último día, null cuando ya venció", () => {
    expect(diasDePlazo("2026-10-15", "2026-10-04")).toBe(11);
    expect(diasDePlazo("2026-10-15", "2026-10-15")).toBe(0);
    expect(diasDePlazo("2026-10-15", "2026-10-16")).toBeNull();
    // Cruza fin de mes sin errores de calendario.
    expect(diasDePlazo("2026-11-02", "2026-10-30")).toBe(3);
  });
});

describe("sedesParaCerrar", () => {
  it("junta por tienda lo pendiente: cuántas, cuántos soles, y solo lo pendiente", () => {
    const filas = [
      fila({ precioCobrado: 50 }),
      fila({ precioCobrado: 69.9 }),
      fila({ estado: "regularizada", precioCobrado: 1000 }),
      fila({ estado: "cerrada_sin_prenda", precioCobrado: 1000 }),
      fila({ estado: "anulada", precioCobrado: 1000 }),
    ];
    const [tru] = sedesParaCerrar(filas, { [TRU]: "2026-10-15" }, AHORA);
    expect(tru.pendientes).toBe(2);
    expect(tru.soles).toBe(119.9);
  });

  it("el corte es la venta pendiente MÁS NUEVA, con el texto de la base intacto (microsegundos incluidos)", () => {
    const filas = [
      fila({ vendidoEn: "2026-10-03T15:00:00.123456+00:00" }),
      fila({ vendidoEn: "2026-10-04T09:30:11.987654+00:00" }),
      fila({ vendidoEn: "2026-10-02T10:00:00.5+00:00" }),
    ];
    const [s] = sedesParaCerrar(filas, { [TRU]: "2026-10-15" }, AHORA);
    expect(s.corte).toBe("2026-10-04T09:30:11.987654+00:00");
    expect(s.desde).toBe("2026-10-02T10:00:00.5+00:00");
  });

  it("no suma los soles con error de coma flotante", () => {
    const filas = [0.1, 0.2, 0.3].map((p) => fila({ precioCobrado: p + 49.9 }));
    const [s] = sedesParaCerrar(filas, { [TRU]: "2026-10-15" }, AHORA);
    expect(s.soles).toBe(150.3);
  });

  it("una tienda sin plazo o con el plazo vencido aparece, pero no se puede cerrar", () => {
    const filas = [fila(), fila({ ubicacionId: AQP, sede: "Tienda AQP" })];
    const r = sedesParaCerrar(filas, { [TRU]: "2026-10-03" }, AHORA);
    expect(r.map((s) => [s.sede, s.puedeCerrar, s.diasDePlazo])).toEqual([
      ["Tienda AQP", false, null],
      ["Tienda TRU", false, null],
    ]);
  });

  it("con plazo vigente se puede cerrar y dice cuántos días quedan", () => {
    const [s] = sedesParaCerrar([fila()], { [TRU]: "2026-10-15" }, AHORA);
    expect(s.puedeCerrar).toBe(true);
    expect(s.diasDePlazo).toBe(11);
  });

  it("sin pendientes no hay nada que cerrar: la tienda no aparece", () => {
    expect(sedesParaCerrar([fila({ estado: "regularizada" })], { [TRU]: "2026-10-15" }, AHORA)).toEqual([]);
    expect(sedesParaCerrar([], {}, AHORA)).toEqual([]);
  });

  it("ordena las tiendas por nombre, como las ve quien las lee", () => {
    const filas = [fila({ ubicacionId: TRU, sede: "Tienda TRU" }), fila({ ubicacionId: AQP, sede: "Tienda AQP" })];
    expect(sedesParaCerrar(filas, {}, AHORA).map((s) => s.sede)).toEqual(["Tienda AQP", "Tienda TRU"]);
  });
});

describe("motivos", () => {
  it("son las tres razones de la base, en el orden en que se ofrecen", () => {
    expect(MOTIVOS_CIERRE.map((m) => m.clave)).toEqual(["no_se_sabe", "aun_no_cargada", "ultima_unidad"]);
  });
  it("cada clave se lee en palabras del negocio y una desconocida no rompe la pantalla", () => {
    expect(motivoLegible("aun_no_cargada")).toBe("La prenda aún no está cargada");
    expect(motivoLegible("otra")).toBe("Sin motivo");
    expect(motivoLegible(null)).toBe("Sin motivo");
  });
});

// Las listas cerradas viven DOS veces —en la base (el CHECK y el `in (…)` de la función) y aquí—: si se desalinean, un motivo que la
// pantalla ofrece lo rechaza la base («reabrir_motivo_invalido») o uno de la base nunca se puede elegir. Esta prueba las compara.
const MIGRACIONES = new URL("../../../supabase/migrations/", import.meta.url);
const leer = (archivo: string) => readFileSync(new URL(archivo, MIGRACIONES), "utf8");
const lista = (sql: string, ancla: RegExp) => [...(sql.match(ancla)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);

describe("las listas de motivos de la web son las de la base", () => {
  it("cierre: el CHECK de la tabla y la función aceptan exactamente los de MOTIVOS_CIERRE", () => {
    const claves = MOTIVOS_CIERRE.map((m) => m.clave).sort();
    const tabla = lista(leer("20261005100000_cola_arranque_parte1_tablas.sql"), /motivo text not null check \(motivo in \(([^)]*)\)/);
    const funcion = lista(leer("20261005100100_cola_arranque_parte2_funciones.sql"), /p_motivo not in \(([^)]*)\)/);
    expect(tabla.sort()).toEqual(claves);
    expect(funcion.sort()).toEqual(claves);
  });
  it("reapertura: la función acepta exactamente los de MOTIVOS_REAPERTURA", () => {
    const funcion = lista(leer("20261005110000_cola_arranque_reabrir.sql"), /p_motivo not in \(([^)]*)\)/);
    expect(funcion.sort()).toEqual(MOTIVOS_REAPERTURA.map((m) => m.clave).sort());
  });
});

describe("armarSugerencias / paresParaConfirmar", () => {
  const venta = (id: string, p: Partial<VentaPendiente> = {}): VentaPendiente => ({
    id, descripcion: "Blusa negra M", categoria: "Blusas", talla: "M", color: "Negro", precioCobrado: 50, vendidoEn: "2026-10-03T15:00:00.1+00:00", vendidoPor: "Dayana", ...p,
  });
  const prenda = (id: string, p: Partial<PrendaDelCatalogo> = {}): PrendaDelCatalogo => ({ id, nombre: "Blusa Emma", codigo: "BLU-1", categoria: "Blusas", talla: "M", color: "Negro", precio: 79.9, ...p });

  it("une cada pareja con lo que anotó caja y con la prenda sugerida, y calcula la diferencia a céntimos", () => {
    const [s] = armarSugerencias([{ prenda_id: "v1", variante_id: "p1", en_stock: 3 }], [venta("v1", { precioCobrado: 69.9 })], [prenda("p1")]);
    expect(s.prenda.nombre).toBe("Blusa Emma");
    expect(s.enStock).toBe(3);
    expect(s.diferencia).toBe(-10);
  });

  it("ordena de la venta más antigua a la más nueva", () => {
    const r = armarSugerencias(
      [{ prenda_id: "v2", variante_id: "p1", en_stock: 2 }, { prenda_id: "v1", variante_id: "p1", en_stock: 2 }],
      [venta("v1", { vendidoEn: "2026-10-01T10:00:00+00:00" }), venta("v2", { vendidoEn: "2026-10-02T10:00:00+00:00" })],
      [prenda("p1")],
    );
    expect(r.map((s) => s.prendaId)).toEqual(["v1", "v2"]);
  });

  it("no muestra una pareja cuya venta ya no está pendiente o cuya prenda la pantalla no conoce", () => {
    const parejas = [{ prenda_id: "v1", variante_id: "p1", en_stock: 1 }, { prenda_id: "v2", variante_id: "p9", en_stock: 1 }, { prenda_id: "v3", variante_id: "p1", en_stock: 1 }];
    const r = armarSugerencias(parejas, [venta("v1"), venta("v2")], [prenda("p1")]);
    expect(r.map((s) => s.prendaId)).toEqual(["v1"]);
  });

  it("manda solo las marcadas, en el orden en que se ven", () => {
    const s = armarSugerencias(
      [{ prenda_id: "v1", variante_id: "p1", en_stock: 5 }, { prenda_id: "v2", variante_id: "p1", en_stock: 5 }, { prenda_id: "v3", variante_id: "p1", en_stock: 5 }],
      [venta("v1", { vendidoEn: "2026-10-01T10:00:00+00:00" }), venta("v2", { vendidoEn: "2026-10-02T10:00:00+00:00" }), venta("v3", { vendidoEn: "2026-10-03T10:00:00+00:00" })],
      [prenda("p1")],
    );
    expect(paresParaConfirmar(s, new Set(["v3", "v1"]))).toEqual([{ prenda_id: "v1", variante_id: "p1" }, { prenda_id: "v3", variante_id: "p1" }]);
    expect(paresParaConfirmar(s, new Set())).toEqual([]);
  });
});

describe("avisosDePlazo", () => {
  const sede = (p: Partial<import("./cola-arranque-reglas").SedeParaCerrar>) => ({
    ubicacionId: "x", sede: "Tienda AQP", pendientes: 3, soles: 10, desde: "2026-10-01T00:00:00+00:00", corte: "2026-10-02T00:00:00+00:00",
    plazoHasta: "2026-10-15", diasDePlazo: 11, puedeCerrar: true, ...p,
  });
  it("con plazo vigente dice hasta cuándo y cuántos días quedan", () => {
    expect(avisosDePlazo([sede({})])).toEqual(["Tienda AQP: puedes cerrar su cola de arranque hasta el 15/10 (11 días más)."]);
    expect(avisosDePlazo([sede({ diasDePlazo: 1 })])[0]).toContain("(1 día más)");
    expect(avisosDePlazo([sede({ diasDePlazo: 0 })])).toEqual(["Tienda AQP: hoy es el último día para cerrar su cola de arranque."]);
  });
  it("vencido o sin plazo lo dice, en vez de dejar un botón que desaparece sin explicación", () => {
    expect(avisosDePlazo([sede({ puedeCerrar: false, diasDePlazo: null })])[0]).toContain("venció el 15/10");
    expect(avisosDePlazo([sede({ plazoHasta: null, puedeCerrar: false, diasDePlazo: null })])).toEqual(["Tienda AQP: no tiene plazo abierto para cerrar su cola de arranque."]);
  });
  it("una línea por tienda, en el orden recibido", () => {
    expect(avisosDePlazo([sede({ sede: "Tienda AQP" }), sede({ sede: "Tienda TRU" })])).toHaveLength(2);
  });
});

describe("textoCierreHecho", () => {
  it("dice la cifra que cerró la base, no la que vio el líder", () => {
    expect(textoCierreHecho("Tienda TRU", 92)).toBe("92 prendas de Tienda TRU quedaron cerradas sin prenda.");
    expect(textoCierreHecho("Tienda TRU", 1)).toBe("1 prenda de Tienda TRU quedó cerrada sin prenda.");
  });
  it("si no se pudo leer la cifra, no inventa una", () => {
    expect(textoCierreHecho("Tienda TRU", null)).toBe("Las ventas sin registrar de Tienda TRU quedaron cerradas sin prenda.");
  });
});

describe("errorDeSugerencias", () => {
  it("un cambio de stock o una venta ya regularizada se explica en esta hoja y pide volver a buscar (no manda a «Llegó nueva»)", () => {
    for (const message of ["prenda_sin_stock_para_descontar", "prenda_ya_regularizada", "cola_pares_invalidos"]) {
      const r = errorDeSugerencias({ message, hint: null });
      expect(r?.recargar).toBe(true);
      expect(r?.texto).toContain("No se aplicó ninguna");
      expect(r?.texto).not.toContain("Llegó nueva");
    }
  });
  it("nombra la venta que falló cuando la base la trae", () => {
    const r = errorDeSugerencias({ message: "prenda_sin_stock_para_descontar", hint: "Venta «Blusa negra M»: no se aplicó ninguna de las que marcaste. Esa prenda no tiene stock" });
    expect(r?.texto).toContain("«Blusa negra M»");
  });
  it("otro error no se toca: lo traduce traducirError", () => {
    expect(errorDeSugerencias({ message: "cola_solo_lider" })).toBeNull();
    expect(errorDeSugerencias(null)).toBeNull();
  });
});

describe("avisoAlReabrir", () => {
  it("solo avisa cuando la venta se cerró por «aún no cargada»", () => {
    expect(avisoAlReabrir("aun_no_cargada")).toContain("carga inicial");
    expect(avisoAlReabrir("no_se_sabe")).toBeNull();
    expect(avisoAlReabrir("ultima_unidad")).toBeNull();
    expect(avisoAlReabrir(null)).toBeNull();
  });
});
