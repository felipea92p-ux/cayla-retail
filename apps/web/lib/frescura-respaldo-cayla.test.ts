import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EventoPiso } from "./inventario-exposicion";
import {
  VENTAS_PARA_JUZGAR_SOLA,
  analizarSede,
  armarFrescuraSede,
  kaplanMeier,
  leerFrescuraSede,
  type FrescuraSede,
  type LecturaFrescuraConPiso,
  type LlamarRpcFrescura,
  type Observacion,
  type PuntoApartado,
  type RespaldoCayla,
  type TallaFrescuraCruda,
  type VaraRespaldo,
} from "./frescura-reglas";
import { filasDeVaraCayla, leerRespaldoCayla, respaldoDe, type FilaVaraCayla } from "./frescura-vara-cayla";
import { APROXIMADO, CONTRA_CAYLA, estadoVista, textoRespaldo, varaTablero } from "./frescura-pantalla";

// La vara de CAYLA como RESPALDO (ADR-0208, actualización 2026-10-07, decisión 2 de Felipe): con menos de 10 ventas en la
// tienda y 10 o más en CAYLA, el tramo y la rapidez se miden contra la curva de las tres tiendas y la fila lo dice. De punta
// a punta: las reglas (`analizarSede`), la pantalla (`estadoVista`) y el contrato con la salida real de la base.

const D = 86_400;
const BASE = Date.parse("2026-06-10T12:00:00.000Z");
const ts = (dia: number) => new Date(BASE + dia * D * 1000).toISOString();
const ev = (dia: number, delta: number, o: Partial<EventoPiso> = {}): EventoPiso => ({ ts: ts(dia), delta, esVenta: false, esMovimientoInterno: false, ...o });
const bajada = (dia: number, n: number) => ev(dia, n, { esMovimientoInterno: true });
const venta = (dia: number, n: number) => ev(dia, -n, { esVenta: true });
const u = (dias: number, vendida: boolean, peso = 1): Observacion => ({ segundos: dias * D, vendida, peso });

const talla = (varianteId: string, productoId: string, o: Partial<TallaFrescuraCruda> = {}): TallaFrescuraCruda => ({
  varianteId,
  productoId,
  productoNombre: productoId,
  codigo: null,
  colorCodigo: "CHO",
  colorNombre: "Chocolate",
  talla: "M",
  categoriaId: "capas",
  categoriaNombre: "Capas",
  temporada: null,
  temporadaOrigen: null,
  esClasico: false,
  finEstacion: null,
  enEstacionAhora: null,
  primeraExhibicion: null,
  ultimaLlegada: null,
  ultimaLlegadaCayla: null,
  pisoHoy: 0,
  almacenHoy: 0,
  apartadasHoy: 0,
  apartadasPisoHoy: 0,
  ...o,
});
const lectura = (tallas: TallaFrescuraCruda[], eventos: Record<string, EventoPiso[]>): LecturaFrescuraConPiso => ({
  separaPiso: true,
  desde: ts(0),
  ahora: ts(120),
  tallas,
  eventos,
  tardias: [],
  dudosas: [],
});
const prendaDe = (sede: FrescuraSede, productoId: string) => {
  const p = sede.prendas.find((x) => x.productoId === productoId);
  if (!p) throw new Error(`no está ${productoId}`);
  return p;
};

/** TRU, Capas: 3 capas vendidas en los días 1, 1 y 2, una colgada hace 10 días, y Capa de Encaje colgada hace 4 (la captura). */
function capasDeTru() {
  const tallas = [
    talla("c1", "capa-1", { primeraExhibicion: ts(100) }),
    talla("c2", "capa-2", { primeraExhibicion: ts(100) }),
    talla("c3", "capa-3", { primeraExhibicion: ts(105) }),
    talla("c4", "capa-4", { primeraExhibicion: ts(110), pisoHoy: 1 }),
    talla("e1", "encaje", { primeraExhibicion: ts(116), pisoHoy: 1 }),
  ];
  const eventos: Record<string, EventoPiso[]> = {
    c1: [bajada(100, 1), venta(101, 1)],
    c2: [bajada(100, 1), venta(101, 1)],
    c3: [bajada(105, 1), venta(107, 1)],
    c4: [bajada(110, 1)],
    e1: [bajada(116, 1)],
  };
  return { tallas, eventos };
}

/** La vara de CAYLA de Capas: 30 vendidas entre los días 5 y 60 y 10 colgadas (AQP vende capas), calculada hace 12 horas. */
const CAYLA_CAPAS: Observacion[] = [...Array.from({ length: 30 }, (_, i) => u(5 + i * 1.9, true)), ...Array.from({ length: 10 }, (_, i) => u(10 + i * 3, false))];
const respaldoCon = (obs: Observacion[], calculadaEn = ts(119.5)): RespaldoCayla => {
  const curva = kaplanMeier(obs);
  const r: VaraRespaldo = { curva, ventanaDias: 120, vendidas: curva.vendidas, nivel: curva.vendidas >= 20 ? "solido" : curva.vendidas >= 10 ? "aceptable" : "pocos_datos", calculadaEn };
  return new Map([["capas", r]]);
};

describe("analizarSede con la vara de CAYLA de respaldo", () => {
  it("sin respaldo (como antes): con 3 ventas rápidas, Capa de Encaje a los 4 días es «Se está quedando», juzgada contra la tienda", () => {
    const { tallas, eventos } = capasDeTru();
    const { sede } = analizarSede(lectura(tallas, eventos));
    const p = prendaDe(sede, "encaje");
    expect(p).toMatchObject({ juzgadaContra: "sede", estado: { tipo: "semaforo", tramo: "envejecida" } });
    expect(p.categoriaSinElla?.vendidas).toBe(3);
    expect(sede.categorias.find((c) => c.categoriaId === "capas")).toMatchObject({ vendidas: 3, nivel: "pocos_datos", respaldo: null });
  });

  it("con respaldo: la tienda tiene 3 ventas y CAYLA 30 → se juzga contra CAYLA y a los 4 días es «Recién llegada»", () => {
    const { tallas, eventos } = capasDeTru();
    const { sede } = analizarSede(lectura(tallas, eventos), respaldoCon(CAYLA_CAPAS));
    const p = prendaDe(sede, "encaje");
    expect(p).toMatchObject({ juzgadaContra: "cayla", estado: { tipo: "semaforo", tramo: "nueva", quieta: false } });
    // Contra CAYLA sin ella: las 30 ventas de CAYLA (la suya no se vendió) y el nivel de CAYLA.
    expect(p.categoriaSinElla?.vendidas).toBe(30);
    const cat = sede.categorias.find((c) => c.categoriaId === "capas")!;
    // La cabecera sigue siendo la de la tienda (3 ventas), con su respaldo al lado, en uso.
    expect(cat).toMatchObject({ vendidas: 3, nivel: "pocos_datos" });
    expect(cat.respaldo).toMatchObject({ vendidas: 30, nivel: "solido", ventanaDias: 120, calculadaEn: ts(119.5), enUso: true });
    expect(cat.respaldo?.cortes.p50).toBeGreaterThan(30 * D);
    // Las demás capas también: la decisión es de la categoría, no de la prenda.
    expect(prendaDe(sede, "capa-4").juzgadaContra).toBe("cayla");
  });

  it("con un respaldo flojo (5 ventas en CAYLA) se juzga contra la tienda; el respaldo se guarda a la vista, sin uso", () => {
    const { tallas, eventos } = capasDeTru();
    const flojo = respaldoCon([...Array.from({ length: 5 }, (_, i) => u(5 + i * 5, true)), u(20, false)]);
    const { sede } = analizarSede(lectura(tallas, eventos), flojo);
    expect(prendaDe(sede, "encaje")).toMatchObject({ juzgadaContra: "sede", estado: { tramo: "envejecida" } });
    expect(sede.categorias.find((c) => c.categoriaId === "capas")?.respaldo).toMatchObject({ vendidas: 5, enUso: false });
  });

  it(`con ${VENTAS_PARA_JUZGAR_SOLA} ventas o más en la tienda se juzga sola, aunque CAYLA tenga más`, () => {
    // 12 capas vendidas en la tienda entre los días 2 y 24, más Capa de Encaje a los 4 días.
    const tallas = [...Array.from({ length: 12 }, (_, i) => talla(`t${i}`, `capa-t${i}`, { primeraExhibicion: ts(80 + i) })), talla("e1", "encaje", { primeraExhibicion: ts(116), pisoHoy: 1 })];
    const eventos: Record<string, EventoPiso[]> = Object.fromEntries(tallas.slice(0, 12).map((t, i) => [t.varianteId, [bajada(80 + i, 1), venta(80 + i + 2 + i * 2, 1)]]));
    eventos.e1 = [bajada(116, 1)];
    const { sede } = analizarSede(lectura(tallas, eventos), respaldoCon(CAYLA_CAPAS));
    expect(prendaDe(sede, "encaje").juzgadaContra).toBe("sede");
    expect(sede.categorias.find((c) => c.categoriaId === "capas")).toMatchObject({ vendidas: 12, respaldo: { enUso: false } });
  });

  it("la foto (D5 contra CAYLA): lo que se colgó DESPUÉS de calcularse la vara no se resta; lo de antes, con la edad que tenía en la foto", () => {
    const { tallas, eventos } = capasDeTru();
    // Colgada 5 horas después de la foto de las 119,5: en la foto no existe, así que no hay nada que restarle a CAYLA.
    tallas.push(talla("n1", "nueva-tarde", { primeraExhibicion: ts(119.7), pisoHoy: 1 }));
    eventos.n1 = [bajada(119.7, 1)];
    const { sede } = analizarSede(lectura(tallas, eventos), respaldoCon(CAYLA_CAPAS));
    const curvaEntera = kaplanMeier(CAYLA_CAPAS);
    const tarde = prendaDe(sede, "nueva-tarde");
    expect(tarde.juzgadaContra).toBe("cayla");
    expect(tarde.categoriaSinElla).toMatchObject({ vendidas: 30, tMax: curvaEntera.tMax });
    expect(tarde.categoriaSinElla?.cortes.p50).toBe(curvaEntera.tiempos[curvaEntera.supervivencia.findIndex((s) => s <= 0.5)]);
    // Capa de Encaje sí estaba en la foto (3,5 días colgada entonces): se le resta esa unidad, no la de hoy (4 días).
    expect(prendaDe(sede, "encaje").categoriaSinElla?.vendidas).toBe(30);
  });

  it("lo sin categoría nunca tiene respaldo", () => {
    const tallas = [talla("s1", "suelta", { categoriaId: null, categoriaNombre: null, primeraExhibicion: ts(116), pisoHoy: 1 })];
    const { sede } = analizarSede(lectura(tallas, { s1: [bajada(116, 1)] }), new Map([["", respaldoCon(CAYLA_CAPAS).get("capas")!]]));
    expect(prendaDe(sede, "suelta").juzgadaContra).toBe("sede");
    expect(sede.categorias[0].respaldo).toBeNull();
  });
});

describe("la revisión adversaria del 2026-10-08: la foto se rearma con los apartados de ENTONCES, y «en uso» es por lo juzgado", () => {
  const lecturaCon = (
    tallas: TallaFrescuraCruda[],
    eventos: Record<string, EventoPiso[]>,
    o: { desde: string; ahora: string; apartados?: Record<string, PuntoApartado[]> },
  ): LecturaFrescuraConPiso => ({ ...lectura(tallas, eventos), ...o });
  /** Tienda B: 12 capas vendidas entre los días 82 y 116 (la que le da a CAYLA sus 10 ventas o más). */
  const tiendaB = () => {
    const tallas = Array.from({ length: 12 }, (_, i) => talla(`b${i}`, `capa-b${i}`, { primeraExhibicion: ts(80 + i) }));
    const eventos: Record<string, EventoPiso[]> = Object.fromEntries(tallas.map((t, i) => [t.varianteId, [bajada(80 + i, 1), venta(80 + i + 2 + i * 2, 1)]]));
    return { tallas, eventos };
  };

  it("un apartado abierto en la foto fue una venta para el cron; liberado sin venderse después, la web igual se la resta a «su categoría sin ella»", () => {
    // Tienda A: X colgada el día 100 y apartada el 110 (sigue apartada en la foto de las 119,5); Z colgada el 100, sin nada.
    const tallasA = [talla("x", "capa-x", { primeraExhibicion: ts(100), pisoHoy: 1 }), talla("z", "capa-z", { primeraExhibicion: ts(100), pisoHoy: 1 })];
    const eventosA: Record<string, EventoPiso[]> = { x: [bajada(100, 1)], z: [bajada(100, 1)] };
    const b = tiendaB();
    // El cron, a las 119,5: lee cada tienda como estaba entonces y junta sus observaciones (la receta de `calcularVaraCayla`).
    const cron = { desde: ts(-0.5), ahora: ts(119.5) };
    const obsA = analizarSede(lecturaCon(tallasA, eventosA, { ...cron, apartados: { x: [{ ts: ts(110), delta: -1 }] } })).observaciones;
    const obsB = analizarSede(lecturaCon(b.tallas, b.eventos, cron)).observaciones;
    const filas = filasDeVaraCayla([obsA, obsB]).map((f) => ({ ...f, calculadaEn: ts(119.5) }));
    expect(filas).toHaveLength(1);
    // 12 de B más la apartada de X: para el cron, lo apartado es una venta.
    expect(filas[0].vendidas).toBe(13);
    const respaldo = respaldoDe(filas, ts(120));
    // La web, a las 120: el apartado de X se liberó sin venderse a las 119,8 (hoy es una pausa, no una venta).
    const hoy = analizarSede(
      lecturaCon(tallasA, eventosA, { desde: ts(0), ahora: ts(120), apartados: { x: [{ ts: ts(110), delta: -1 }, { ts: ts(119.8), delta: 1 }] } }),
      respaldo,
    ).sede;
    expect(prendaDe(hoy, "capa-x").juzgadaContra).toBe("cayla");
    // Sin ella: las 12 de B. Antes del arreglo quedaba en 13: su propia venta de la foto seguía dentro del resto.
    expect(prendaDe(hoy, "capa-x").categoriaSinElla?.vendidas).toBe(12);
    // Z no vendió nada en la foto: las 13 enteras.
    expect(prendaDe(hoy, "capa-z").categoriaSinElla?.vendidas).toBe(13);
  });

  it("una categoría de puros clásicos no se juzga contra nada: el respaldo no está «en uso», el tablero no dice «Contra CAYLA» y «¿Cómo se lee esto?» dice por qué", () => {
    const tallas = [talla("k1", "capa-clasica", { esClasico: true, primeraExhibicion: ts(100), pisoHoy: 2 })];
    const { sede } = analizarSede(lectura(tallas, { k1: [bajada(100, 2)] }), respaldoCon(CAYLA_CAPAS));
    expect(prendaDe(sede, "capa-clasica").juzgadaContra).toBe("sede");
    const cat = sede.categorias.find((c) => c.categoriaId === "capas")!;
    expect(cat.respaldo).toMatchObject({ vendidas: 30, enUso: false });
    expect(varaTablero(cat)).toEqual({ texto: "Sin ventas aún", tono: "apagado" });
    expect(textoRespaldo(cat)).toBe("Aquí no hay prendas que medir (clásicos, o prendas que no cuadran): la vara de CAYLA (30 ventas) queda de apoyo.");
  });
});

describe("la fila lo dice: «contra lo que vende CAYLA»", () => {
  it("juzgada contra CAYLA con 30 ventas: la línea de abajo lo dice y no dice «aproximado»; contra la tienda con 3, al revés", () => {
    const { tallas, eventos } = capasDeTru();
    const conRespaldo = analizarSede(lectura(tallas, eventos), respaldoCon(CAYLA_CAPAS)).sede;
    const sinRespaldo = analizarSede(lectura(tallas, eventos)).sede;
    expect(estadoVista(prendaDe(conRespaldo, "encaje")).debajo).toEqual([CONTRA_CAYLA]);
    expect(estadoVista(prendaDe(sinRespaldo, "encaje")).debajo).toEqual([APROXIMADO]);
  });
});

describe("respaldoDe y leerRespaldoCayla: lo que la web lee de fn_frescura_vara_cayla", () => {
  const fila = (categoriaId: string, calculadaEn: string, vendidas = 30): FilaVaraCayla => ({
    categoriaId,
    calculadaEn,
    tiendas: 3,
    ventanaDias: 60,
    vendidas,
    unidades: vendidas + 5,
    nivel: vendidas >= 20 ? "solido" : "pocos_datos",
    observaciones: [...Array.from({ length: vendidas }, (_, i) => u(3 + i, true)), ...Array.from({ length: 5 }, (_, i) => u(10 + i, false))],
  });
  const cruda = (f: FilaVaraCayla) => ({
    categoria_id: f.categoriaId,
    calculada_en: f.calculadaEn,
    tiendas: f.tiendas,
    ventana_dias: f.ventanaDias,
    vendidas: String(f.vendidas),
    unidades: String(f.unidades),
    nivel: f.nivel,
    observaciones: f.observaciones.map((o) => [o.segundos, o.vendida ? 1 : 0, o.peso]),
  });
  const AHORA = "2026-10-08T15:00:00.000Z";

  it("respaldoDe: solo las vigentes (3 días), con su curva rearmada", () => {
    const r = respaldoDe([fila("a", "2026-10-08T08:20:00Z"), fila("b", "2026-10-04T08:20:00Z")], AHORA);
    expect([...r.keys()]).toEqual(["a"]);
    expect(r.get("a")).toMatchObject({ vendidas: 30, nivel: "solido", ventanaDias: 60, calculadaEn: "2026-10-08T08:20:00Z" });
    expect(r.get("a")?.curva.vendidas).toBe(30);
  });

  it("leerRespaldoCayla: con filas, el mapa y la fecha más vieja de las vigentes; sin permiso, la pista; sin forma o caída, vacío y el aviso", async () => {
    const ok = await leerRespaldoCayla(async () => ({ data: [cruda(fila("a", "2026-10-08T08:20:00Z")), cruda(fila("b", "2026-10-07T08:20:00Z"))], error: null }), AHORA);
    expect(ok).toMatchObject({ calculadaEn: "2026-10-07T08:20:00Z", fallo: null });
    expect(ok.respaldo.size).toBe(2);
    const sinPermiso = await leerRespaldoCayla(async () => ({ data: null, error: { message: "x", hint: "frescura_sin_permiso" } }), AHORA);
    expect(sinPermiso).toMatchObject({ calculadaEn: null, fallo: "No tienes acceso a la vara de CAYLA." });
    expect(sinPermiso.respaldo.size).toBe(0);
    const rara = await leerRespaldoCayla(async () => ({ data: { no: "es una lista" }, error: null }), AHORA);
    expect(rara.fallo).toMatch(/No se pudo leer/);
    const caida = await leerRespaldoCayla(async () => Promise.reject(new Error("se cayó")), AHORA);
    expect(caida.fallo).toMatch(/No se pudo leer/);
    const vieja = await leerRespaldoCayla(async () => ({ data: [cruda(fila("a", "2026-10-01T08:20:00Z"))], error: null }), AHORA);
    expect(vieja).toMatchObject({ calculadaEn: null, fallo: "La vara de CAYLA tiene más de 3 días: se juzga contra la tienda." });
  });
});

describe("el contrato con la salida real de la base: armarFrescuraSede con respaldo", () => {
  const CRUDO = JSON.parse(readFileSync(new URL("./__fixtures__/frescura-sede.json", import.meta.url), "utf8")) as { fn_frescura_sede: unknown };
  const DECISIONES = JSON.parse(readFileSync(new URL("./__fixtures__/frescura-decisiones.json", import.meta.url), "utf8")) as unknown;
  const LECTURA = leerFrescuraSede(CRUDO.fn_frescura_sede);
  if (!LECTURA || !LECTURA.separaPiso) throw new Error("el fixture no trae una lectura con piso");
  const vestidos = LECTURA.tallas.find((t) => t.categoriaNombre === "Vestidos")?.categoriaId;
  const blusas = LECTURA.tallas.find((t) => t.categoriaNombre === "Camisas y Blusas")?.categoriaId;
  if (!vestidos || !blusas) throw new Error("el fixture no trae Vestidos o Camisas y Blusas");
  const rpc: LlamarRpcFrescura = async (fn) => (fn === "fn_frescura_sede" ? { data: CRUDO.fn_frescura_sede, error: null } : { data: DECISIONES, error: null });

  it("Vestidos (2 ventas en la sede) se juzga contra CAYLA cuando hay respaldo; Camisas y Blusas (25) sigue sola", async () => {
    const hace12h = new Date(Date.parse(LECTURA.ahora) - 12 * 3600 * 1000).toISOString();
    const curva = kaplanMeier(CAYLA_CAPAS);
    const respaldo: RespaldoCayla = new Map([
      [vestidos, { curva, ventanaDias: 120, vendidas: 30, nivel: "solido", calculadaEn: hace12h }],
      [blusas, { curva, ventanaDias: 120, vendidas: 30, nivel: "solido", calculadaEn: hace12h }],
    ]);
    const con = await armarFrescuraSede({ id: "t1", nombre: "Tienda" }, rpc, 120, respaldo);
    const sin = await armarFrescuraSede({ id: "t1", nombre: "Tienda" }, rpc, 120);
    const sedeCon = con.lectura.datos;
    const sedeSin = sin.lectura.datos;
    if (!sedeCon?.separaPiso || !sedeSin?.separaPiso) throw new Error("sin lectura");
    const deVestidos = (s: FrescuraSede) => s.prendas.filter((p) => p.categoriaId === vestidos && p.categoriaSinElla !== null);
    expect(deVestidos(sedeCon).length).toBeGreaterThan(0);
    expect(deVestidos(sedeCon).every((p) => p.juzgadaContra === "cayla")).toBe(true);
    expect(deVestidos(sedeSin).every((p) => p.juzgadaContra === "sede")).toBe(true);
    expect(sedeCon.prendas.filter((p) => p.categoriaId === blusas).every((p) => p.juzgadaContra === "sede")).toBe(true);
    expect(sedeCon.categorias.find((c) => c.categoriaId === vestidos)?.respaldo).toMatchObject({ enUso: true, vendidas: 30 });
    expect(sedeCon.categorias.find((c) => c.categoriaId === blusas)?.respaldo).toMatchObject({ enUso: false });
    // Lo decidido (paso 4b) sigue leyéndose igual.
    expect(sedeCon.decisiones.estado).toBe(sedeSin.decisiones.estado);
  });
});
