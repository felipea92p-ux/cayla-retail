import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSUMO_MAXIMO,
  HINTS_TELA,
  aMilesimas,
  cantidadAPedir,
  coloresDeLaOrden,
  consumoSugerido,
  insumosParaRpc,
  leerConsumo,
  metrosAPedir,
  ofertaDeConsumoDelModelo,
  prendasDeLaFila,
  problemasTela,
  telasDeLaHoja,
  telasSugeridas,
  veredictoTela,
  type HintTela,
  type InsumoDelTaller,
  type InsumoRpc,
  type TelaBorrador,
} from "./orden-tela-reglas";

// Contrato. PROMETE: que el bloque «Tela» propone la tela del color de la prenda (nunca una archivada), calcula los metros a pedir como la base calcula
// `cantidad_plan`, y dice «falta…» con las mismas reglas que `fn_produccion_insumos_normalizar` (la prueba al azar comprueba que `problemasTela` está vacío
// EXACTAMENTE cuando lo que se manda cumple lo que la función exige); que cada `hint` existe en la migración y que las llaves del payload son las que la
// función lee. NO PROMETE que la base acepte: ella valida otra vez (saldo, permisos); su prueba contra Postgres es `scripts/pruebas/produccion_fases.mjs`.

const RAIZ = join(__dirname, "..", "..", "..");
const MIGRACION = "supabase/migrations/20261014154000_produccion_fases_y_tela_de_la_orden.sql";

const LINO = "tej-lino";
const tela = (id: string, o: Partial<InsumoDelTaller> = {}): InsumoDelTaller => ({
  id,
  nombre: id,
  tipo: "tela",
  unidad: "metro",
  tejidoId: LINO,
  colorCodigo: null,
  saldo: 100,
  mermaPct: 0.05,
  archivado: false,
  ...o,
});
const LINO_NEG = tela("lino-negro", { nombre: "Lino negro", colorCodigo: "NEG" });
const LINO_CRU = tela("lino-crudo", { nombre: "Lino crudo", colorCodigo: "CRU", saldo: 20 });
const LINO_SIN = tela("lino-sin-color", { nombre: "Lino sin color", saldo: 50 });
const LINO_NEG_VIEJO = tela("lino-negro-viejo", { nombre: "Lino negro (viejo)", colorCodigo: "NEG", saldo: 500, archivado: true });
const POPELINA_NEG = tela("popelina-negra", { nombre: "Popelina negra", tejidoId: "tej-pop", colorCodigo: "NEG" });
const HILO: InsumoDelTaller = { id: "hilo", nombre: "Hilo", tipo: "avio", unidad: "cono", tejidoId: null, colorCodigo: null, saldo: 10, mermaPct: 0, archivado: false };
const INSUMOS = [LINO_NEG, LINO_CRU, LINO_SIN, LINO_NEG_VIEJO, POPELINA_NEG, HILO];

const LINEAS = [
  { colorCodigo: "NEG", cantidad: 10 },
  { colorCodigo: "NEG", cantidad: 20 },
  { colorCodigo: "CRU", cantidad: 0 },
  { colorCodigo: "PRO", cantidad: 5 },
];
const COLORES = coloresDeLaOrden(LINEAS);
const CTX = { insumos: INSUMOS, colores: COLORES };
const fila = (o: Partial<TelaBorrador> = {}): TelaBorrador => ({ insumoId: LINO_NEG.id, colorCodigo: "NEG", consumoPorPrenda: "1.2", ...o });
const hints = (telas: TelaBorrador[]) => problemasTela(telas, CTX).map((p) => p.hint);

describe("los colores de la orden", () => {
  it("suma las prendas por color y deja fuera un color con 0 (no existe para la tela); un modelo sin colores es un solo color nulo", () => {
    expect(COLORES).toEqual([
      { colorCodigo: "NEG", cantidad: 30 },
      { colorCodigo: "PRO", cantidad: 5 },
    ]);
    expect(coloresDeLaOrden([{ colorCodigo: null, cantidad: 12 }, { colorCodigo: null, cantidad: 3 }])).toEqual([{ colorCodigo: null, cantidad: 15 }]);
    expect(coloresDeLaOrden([])).toEqual([]);
    expect(coloresDeLaOrden([{ colorCodigo: "NEG", cantidad: Number.NaN }, { colorCodigo: "NEG", cantidad: -4 }])).toEqual([]);
  });
});

describe("telasSugeridas — la tela del color de la prenda", () => {
  it("con tela del color: una fila por color de la orden, con la del tejido y ese color; sin tela del color, la del tejido sin color", () => {
    expect(telasSugeridas({ tejidoId: LINO, colores: COLORES, insumos: INSUMOS })).toEqual([
      { insumoId: LINO_NEG.id, colorCodigo: "NEG", consumoPorPrenda: "" },
      { insumoId: LINO_SIN.id, colorCodigo: "PRO", consumoPorPrenda: "" },
    ]);
  });
  it("sin tela del color ni tela sin color, la fila queda sin tela (la persona elige); nunca una archivada ni una de otro tejido", () => {
    const sinComodin = INSUMOS.filter((i) => i.id !== LINO_SIN.id);
    expect(telasSugeridas({ tejidoId: LINO, colores: COLORES, insumos: sinComodin })).toEqual([
      { insumoId: LINO_NEG.id, colorCodigo: "NEG", consumoPorPrenda: "" },
      { insumoId: null, colorCodigo: "PRO", consumoPorPrenda: "" },
    ]);
    // El lino negro archivado tiene más saldo (500) y no se propone; la popelina negra es de otro tejido.
    const soloMalas = [LINO_NEG_VIEJO, POPELINA_NEG, HILO];
    expect(telasSugeridas({ tejidoId: LINO, colores: COLORES, insumos: soloMalas }).map((t) => t.insumoId)).toEqual([null, null]);
  });
  it("entre varias telas del mismo tejido y color gana la de más saldo; un modelo sin color toma la tela sin color; sin tejido no se adivina nada", () => {
    const grande = tela("lino-negro-2", { colorCodigo: "NEG", saldo: 300 });
    expect(telasSugeridas({ tejidoId: LINO, colores: [{ colorCodigo: "NEG", cantidad: 5 }], insumos: [LINO_NEG, grande] })[0].insumoId).toBe(grande.id);
    expect(telasSugeridas({ tejidoId: LINO, colores: [{ colorCodigo: null, cantidad: 5 }], insumos: INSUMOS })).toEqual([{ insumoId: LINO_SIN.id, colorCodigo: null, consumoPorPrenda: "" }]);
    expect(telasSugeridas({ tejidoId: null, colores: COLORES, insumos: INSUMOS }).map((t) => t.insumoId)).toEqual([null, null]);
    expect(telasSugeridas({ tejidoId: LINO, colores: [], insumos: INSUMOS })).toEqual([]);
  });
  it("el consumo del modelo, si se pasa, llena la caja de cada fila", () => {
    expect(telasSugeridas({ tejidoId: LINO, colores: COLORES, insumos: INSUMOS, consumo: "1.200" }).every((t) => t.consumoPorPrenda === "1.200")).toBe(true);
  });
});

describe("consumo y metros", () => {
  it("consumoSugerido deja listo lo que el modelo declara, a 3 decimales («1.200»); vacío si el modelo no lo sabe", () => {
    expect(consumoSugerido({ telaPorPrenda: 1.2, fuente: "declarado" })).toBe("1.200");
    expect(consumoSugerido({ telaPorPrenda: 0.85, fuente: "medido" })).toBe("0.850");
    expect(consumoSugerido(null)).toBe("");
    expect(consumoSugerido({ telaPorPrenda: 0, fuente: "declarado" })).toBe("");
  });
  it("metrosAPedir = consumo × prendas × (1 + merma), a 3 decimales como cantidad_plan: 1.2 × 30 × 1.05 = 37.8", () => {
    expect(metrosAPedir("1.2", 30, 0.05)).toBe(37.8);
    expect(metrosAPedir(1.2, 30, 0.05)).toBe(37.8);
    expect(metrosAPedir("1.25", 100, 0)).toBe(125);
    expect(metrosAPedir("1.333", 7, 0.1)).toBe(10.264);
    expect(metrosAPedir(" 2 ", 0, 0.05)).toBe(0);
    expect(aMilesimas(1.0005)).toBe(1.001);
    expect(aMilesimas(37.800000000000004)).toBe(37.8);
  });
  it("sin un consumo mayor que cero no hay metros (null): vacío, cero, negativo, coma o texto", () => {
    for (const t of ["", "0", "-1", "1,2", "abc", "1e3"]) expect(metrosAPedir(t, 30, 0.05), t).toBeNull();
    expect(leerConsumo("1.200")).toBe(1.2);
    expect(leerConsumo(0)).toBeNull();
  });
  it("veredictoTela: faltan = plan − (saldo − comprometido), nunca negativo; alcanza cuando no falta nada", () => {
    expect(veredictoTela(37.8, 100, 0)).toMatchObject({ alcanza: true, faltan: 0 });
    expect(veredictoTela(37.8, 100, 70)).toMatchObject({ alcanza: false, faltan: 7.8 });
    expect(veredictoTela(37.8, 37.8, 0)).toMatchObject({ alcanza: true, faltan: 0 });
    expect(veredictoTela(50, 0, 0)).toMatchObject({ alcanza: false, faltan: 50 });
  });

  it("veredictoTela con lo que viene en camino (regla de Felipe, 2026-10-16): la tela que llega baja lo que falta, y dice si alcanza GRACIAS a ella", () => {
    // Sin nada que viniera, igual que antes.
    expect(veredictoTela(50, 0, 0, 0)).toEqual({ alcanza: false, faltan: 50, faltanSinLoQueViene: 50, conLoQueViene: false });
    // Faltan 50 y vienen 35: faltan 15, y no alcanza.
    expect(veredictoTela(50, 0, 0, 35)).toEqual({ alcanza: false, faltan: 15, faltanSinLoQueViene: 50, conLoQueViene: false });
    // Faltan 50 y vienen 120: alcanza, pero solo contando lo pedido.
    expect(veredictoTela(50, 0, 0, 120)).toEqual({ alcanza: true, faltan: 0, faltanSinLoQueViene: 50, conLoQueViene: true });
    // Si ya alcanza con el estante, lo que viene no cambia nada: no es «gracias a lo que viene».
    expect(veredictoTela(37.8, 100, 0, 50)).toEqual({ alcanza: true, faltan: 0, faltanSinLoQueViene: 0, conLoQueViene: false });
    // Las otras órdenes reservan primero: el estante libre es saldo − comprometido, y lo que viene se suma a eso.
    expect(veredictoTela(37.8, 100, 70, 10)).toEqual({ alcanza: true, faltan: 0, faltanSinLoQueViene: 7.8, conLoQueViene: true });
    // Un número roto (NaN, negativo) no cuenta como tela que viene.
    expect(veredictoTela(50, 0, 0, Number.NaN)).toEqual({ alcanza: false, faltan: 50, faltanSinLoQueViene: 50, conLoQueViene: false });
    expect(veredictoTela(50, 0, 0, -20)).toEqual({ alcanza: false, faltan: 50, faltanSinLoQueViene: 50, conLoQueViene: false });
  });
});

describe("problemasTela — cada hint se puede provocar desde la hoja, y solo esos", () => {
  const casos: { hint: HintTela; telas: TelaBorrador[]; por: string }[] = [
    { hint: "insumo_invalido", telas: [fila({ insumoId: "no-existe" })], por: "una tela que no está en Insumos" },
    { hint: "insumo_archivado", telas: [fila({ insumoId: LINO_NEG_VIEJO.id })], por: "una tela archivada" },
    { hint: "insumo_color_ajeno", telas: [fila({ colorCodigo: "AZU" })], por: "un color que la orden no fabrica" },
    { hint: "insumo_color_ajeno", telas: [fila({ insumoId: LINO_CRU.id, colorCodigo: "CRU" })], por: "un color de la orden con 0 prendas" },
    { hint: "insumo_consumo_invalido", telas: [fila({ consumoPorPrenda: "" })], por: "consumo vacío" },
    { hint: "insumo_consumo_invalido", telas: [fila({ consumoPorPrenda: "0" })], por: "consumo en cero" },
    { hint: "insumo_consumo_invalido", telas: [fila({ consumoPorPrenda: "1,2" })], por: "consumo con coma" },
    { hint: "insumo_consumo_invalido", telas: [fila({ consumoPorPrenda: "abc" })], por: "consumo con texto" },
    { hint: "insumo_consumo_invalido", telas: [fila({ consumoPorPrenda: "-1" })], por: "consumo negativo" },
    { hint: "insumo_consumo_invalido", telas: [fila({ consumoPorPrenda: "10000" })], por: "consumo fuera de rango" },
    { hint: "insumo_repetido", telas: [fila(), fila({ consumoPorPrenda: "0.9" })], por: "la misma tela dos veces para el mismo color" },
    { hint: "insumo_repetido", telas: [fila({ insumoId: HILO.id, colorCodigo: null }), fila({ insumoId: HILO.id, colorCodigo: "" })], por: "el mismo avío dos veces para toda la orden («» es null, como btrim)" },
  ];
  for (const c of casos) {
    it(`${c.hint}: ${c.por}`, () => {
      expect(hints(c.telas)).toContain(c.hint);
    });
  }
  it("entre todos los casos aparecen los 5 hints: ninguno es inalcanzable desde la hoja", () => {
    const vistos = new Set(casos.flatMap((c) => hints(c.telas)));
    expect([...vistos].sort()).toEqual([...HINTS_TELA].sort());
  });
  it("una orden SIN tela es válida, y una fila sin tela elegida no viaja ni es una falta (aunque tenga consumo escrito)", () => {
    expect(problemasTela([], CTX)).toEqual([]);
    expect(problemasTela([fila({ insumoId: null, consumoPorPrenda: "abc" })], CTX)).toEqual([]);
    expect(insumosParaRpc([fila({ insumoId: null })])).toEqual([]);
  });
  it("todo en orden: la tela del color, la misma tela para dos colores, un avío para toda la orden, y el color con espacios se lee limpio", () => {
    expect(hints([fila(), fila({ colorCodigo: "PRO" }), fila({ insumoId: HILO.id, colorCodigo: null, consumoPorPrenda: "0.02" })])).toEqual([]);
    expect(hints([fila({ colorCodigo: " NEG " })])).toEqual([]);
  });
  it("una fila con varias cosas mal las dice todas, con su índice, en el orden en que la base las mira", () => {
    const p = problemasTela([fila(), fila({ insumoId: LINO_NEG_VIEJO.id, colorCodigo: "AZU", consumoPorPrenda: "x" })], CTX);
    expect(p.map((x) => `${x.indice}:${x.hint}`)).toEqual(["1:insumo_archivado", "1:insumo_color_ajeno", "1:insumo_consumo_invalido"]);
    expect(p[0].texto).toMatch(/archivada/);
  });
});

describe("insumosParaRpc — lo que viaja", () => {
  it("solo las filas con tela elegida; el consumo como texto recortado, tal cual (la base lo lee con su regla); el color limpio o null", () => {
    expect(insumosParaRpc([fila({ consumoPorPrenda: " 1.2 " }), fila({ insumoId: null }), fila({ insumoId: HILO.id, colorCodigo: " ", consumoPorPrenda: "1,5" })])).toEqual([
      { insumo_id: LINO_NEG.id, color_codigo: "NEG", consumo_por_prenda: "1.2" },
      { insumo_id: HILO.id, color_codigo: null, consumo_por_prenda: "1,5" },
    ]);
  });
  it("las llaves son exactamente las que `fn_produccion_insumos_normalizar` lee (`v_i ->> '…'`), menos la nota, que la hoja no pide", () => {
    const cuerpo = funcion("fn_produccion_insumos_normalizar");
    const enSql = new Set([...cuerpo.matchAll(/v_i ->> '(\w+)'/g)].map((m) => m[1]));
    const [primera] = insumosParaRpc([fila()]);
    expect(Object.keys(primera).sort()).toEqual([...enSql].filter((k) => k !== "nota").sort());
  });
});

// ---------- Paridad con la migración ----------

const SQL = readFileSync(join(RAIZ, MIGRACION), "utf8");
function funcion(nombre: string): string {
  const desde = SQL.indexOf(`create or replace function retail.${nombre}(`);
  expect(desde, nombre).toBeGreaterThan(-1);
  return SQL.slice(desde, SQL.indexOf("$$;", desde));
}

describe("paridad con la migración 20261014154000", () => {
  it("cada hint de la pantalla existe en fn_produccion_insumos_normalizar, y no hay allá ninguno que la pantalla no conozca", () => {
    const cuerpo = funcion("fn_produccion_insumos_normalizar");
    for (const h of HINTS_TELA) expect(cuerpo, h).toContain(`hint = '${h}'`);
    const enSql = [...new Set([...cuerpo.matchAll(/hint = '([a-z_]+)'/g)].map((m) => m[1]))].sort();
    expect(enSql).toEqual([...HINTS_TELA].sort());
  });
  it("el tope del consumo, la fórmula del plan (consumo × prendas × (1 + merma), 3 decimales) y «sin tela es válida» son los de la función", () => {
    const cuerpo = funcion("fn_produccion_insumos_normalizar");
    expect(Number(/v_consumo > (\d+)/.exec(cuerpo)?.[1])).toBe(CONSUMO_MAXIMO);
    expect(cuerpo).toContain("round(v_consumo * v_prendas * (1 + coalesce(v_merma, 0)), 3)");
    expect(cuerpo).toContain("if p_insumos is null or jsonb_typeof(p_insumos) <> 'array' then return '[]'::jsonb; end if;");
    // La merma es fracción (0.05), como `insumos.merma_pct`.
    expect(SQL).toMatch(/merma_pct` es fracción: 0\.05/);
  });
});

// ---------- Al azar, con semilla fija: no falta nada ⇔ la base lo aceptaría ----------

/** Lo que `fn_produccion_insumos_normalizar` exige, reescrito sobre el PAYLOAD y las líneas (independiente de la implementación). */
function laBaseAceptaria(p: InsumoRpc[], lineas: { colorCodigo: string | null; cantidad: number }[]): boolean {
  const vistas = new Set<string>();
  for (const i of p) {
    const insumo = INSUMOS.find((x) => x.id === i.insumo_id);
    if (!insumo || insumo.archivado) return false;
    if (i.color_codigo !== null) {
      const prendas = lineas.filter((l) => l.colorCodigo === i.color_codigo).reduce((s, l) => s + l.cantidad, 0);
      if (prendas <= 0) return false;
    }
    const t = i.consumo_por_prenda.trim();
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return false;
    const c = Number(t);
    if (c <= 0 || c > 9999) return false;
    const llave = `${i.insumo_id}|${i.color_codigo ?? ""}`;
    if (vistas.has(llave)) return false;
    vistas.add(llave);
  }
  return true;
}

describe("la pantalla no promete lo que la base rechaza, ni frena lo que la base acepta (al azar, con semilla fija)", () => {
  const prng = (semilla: number) => () => {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const elegir = <X,>(r: () => number, xs: X[]) => xs[Math.floor(r() * xs.length)];
  const casiSiempreBueno = <X,>(buenos: X[], hostiles: X[]) => [...buenos, ...buenos, ...buenos, ...hostiles];

  it("problemasTela vacío ⇔ el payload no trae una tela archivada ni inexistente, ni un color ajeno, ni un consumo ilegible o repetido (1000 borradores)", () => {
    const r = prng(406);
    let sinProblemas = 0;
    let conTela = 0;
    for (let i = 0; i < 1000; i++) {
      const lineas = ["NEG", "CRU", "PRO", null].map((colorCodigo) => ({ colorCodigo, cantidad: elegir(r, [0, 0, 5, 12]) }));
      const colores = coloresDeLaOrden(lineas);
      const telas: TelaBorrador[] = Array.from({ length: Math.floor(r() * 4) }, () => ({
        insumoId: elegir(r, casiSiempreBueno([LINO_NEG.id, LINO_CRU.id, LINO_SIN.id, HILO.id], [null, LINO_NEG_VIEJO.id, "no-existe", POPELINA_NEG.id])),
        colorCodigo: elegir(r, [null, "NEG", "CRU", "PRO", " NEG ", "", "AZU"]),
        consumoPorPrenda: elegir(r, casiSiempreBueno(["1.2", "0.85", "2"], ["", "0", "-1", "1,2", "abc", "10000"])),
      }));
      const problemas = problemasTela(telas, { insumos: INSUMOS, colores });
      const rpc = insumosParaRpc(telas);
      expect(problemas.length === 0, JSON.stringify({ lineas, telas, problemas })).toBe(laBaseAceptaria(rpc, lineas));
      if (problemas.length === 0) {
        sinProblemas += 1;
        if (rpc.length > 0) conTela += 1;
      }
    }
    expect(sinProblemas).toBeGreaterThan(20);
    expect(conTela).toBeGreaterThan(10);
  });
});

describe("ofertaDeConsumoDelModelo (el interruptor «Dejar este consumo como el del modelo»)", () => {
  const lino = tela("lino");
  const boton = { ...tela("boton"), tipo: "avio" as const, unidad: "unidad" };
  const filas = (...consumos: [string | null, string][]): TelaBorrador[] => consumos.map(([insumoId, consumoPorPrenda]) => ({ insumoId, colorCodigo: null, consumoPorPrenda }));
  const declarado = (telaPorPrenda: number, fuente: "declarado" | "medido" = "declarado") => ({ telaPorPrenda, fuente });

  it("sin tela con consumo escrito no hay nada que ofrecer (ni con tela elegida y consumo vacío o roto)", () => {
    expect(ofertaDeConsumoDelModelo([], [lino], declarado(1.2))).toEqual({ tipo: "ninguna" });
    expect(ofertaDeConsumoDelModelo(filas(["lino", ""]), [lino], declarado(1.2))).toEqual({ tipo: "ninguna" });
    expect(ofertaDeConsumoDelModelo(filas(["lino", "abc"]), [lino], declarado(1.2))).toEqual({ tipo: "ninguna" });
    expect(ofertaDeConsumoDelModelo(filas([null, "1.5"]), [lino], declarado(1.2))).toEqual({ tipo: "ninguna" });
  });

  it("si el modelo todavía no dice nada, esta orden lo deja declarado sola (sin interruptor)", () => {
    expect(ofertaDeConsumoDelModelo(filas(["lino", "1.2"]), [lino], null)).toEqual({ tipo: "primera", nuevo: 1.2, unidad: "metro" });
    expect(ofertaDeConsumoDelModelo(filas(["lino", "1.2"]), [lino], declarado(0))).toMatchObject({ tipo: "primera" });
  });

  it("lo escrito igual a lo que dice el modelo (a tres decimales) no ofrece nada; distinto, ofrece corregir y dice de dónde viene lo de hoy", () => {
    expect(ofertaDeConsumoDelModelo(filas(["lino", "1.2"]), [lino], declarado(1.2))).toEqual({ tipo: "ninguna" });
    expect(ofertaDeConsumoDelModelo(filas(["lino", "1,200"]), [lino], declarado(1.2))).toEqual({ tipo: "ninguna" });
    expect(ofertaDeConsumoDelModelo(filas(["lino", "1.35"]), [lino], declarado(1.2, "medido"))).toEqual({ tipo: "corregir", nuevo: 1.35, actual: 1.2, fuente: "medido", unidad: "metro" });
  });

  it("cuenta la PRIMERA tela con consumo; un avío antes no cuenta, y una tela sin consumo se salta", () => {
    expect(ofertaDeConsumoDelModelo(filas(["boton", "4"], ["lino", ""], ["lino", "1.5"]), [lino, boton], declarado(1.2))).toMatchObject({ tipo: "corregir", nuevo: 1.5 });
    expect(ofertaDeConsumoDelModelo(filas(["boton", "4"]), [lino, boton], declarado(1.2))).toEqual({ tipo: "ninguna" });
  });
});

describe("paridad del interruptor con la base", () => {
  it("la apertura lee `fijar_consumo_modelo`, rechaza con 42501 a quien no edita el catálogo y comprueba ANTES de abrir", () => {
    const sql = readFileSync(join(__dirname, "../../..", MIGRACION), "utf8");
    expect(sql).toContain("'fijar_consumo_modelo'");
    expect(sql).toContain("hint = 'consumo_modelo_sin_permiso'");
    expect(sql.indexOf("consumo_modelo_sin_permiso")).toBeLessThan(sql.indexOf("v_id := retail.abrir_produccion("));
  });
});

describe("telasDeLaHoja — la lista que dibuja Nueva orden: filas por color y avíos", () => {
  const HILO_BEIGE = { ...HILO, id: "hilo-beige", nombre: "Hilo beige" };
  const insumos = [...INSUMOS, HILO_BEIGE];
  const sugeridas: TelaBorrador[] = [
    { insumoId: LINO_NEG.id, colorCodigo: "NEG", consumoPorPrenda: "1.2" },
    { insumoId: null, colorCodigo: "PRO", consumoPorPrenda: "1.2" },
  ];
  const lista = (manual: TelaBorrador[] | null) => telasDeLaHoja({ sugeridas, manual, insumos });

  it("sin haber tocado nada manda la sugerencia", () => {
    expect(lista(null)).toEqual(sugeridas);
  });
  it("lo que la persona tocó de un color gana sobre la sugerencia de ese color; los colores que no tocó siguen sugeridos", () => {
    const manual = [{ insumoId: LINO_CRU.id, colorCodigo: "NEG", consumoPorPrenda: "1.5" }];
    expect(lista(manual)).toEqual([manual[0], sugeridas[1]]);
  });
  it("un avío de toda la orden y uno de UN color se quedan, después de las filas de color", () => {
    const deTodos: TelaBorrador = { insumoId: HILO.id, colorCodigo: null, consumoPorPrenda: "0.02" };
    const deUnColor: TelaBorrador = { insumoId: HILO_BEIGE.id, colorCodigo: "PRO", consumoPorPrenda: "0.01" };
    const l = lista([...sugeridas, deTodos, deUnColor]);
    expect(l.slice(2)).toEqual([deTodos, deUnColor]);
  });
  it("un avío de un color NO se toma por la fila de tela de ese color, aunque esté antes en la lista", () => {
    const deUnColor: TelaBorrador = { insumoId: HILO_BEIGE.id, colorCodigo: "NEG", consumoPorPrenda: "0.01" };
    const l = lista([deUnColor, { insumoId: LINO_NEG.id, colorCodigo: "NEG", consumoPorPrenda: "1.2" }]);
    expect(l[0].insumoId).toBe(LINO_NEG.id);
    expect(l.slice(2)).toEqual([deUnColor]);
  });
  it("una fila de avío recién agregada, todavía sin elegir, no desaparece (si no, «+ Agregar avío» no haría nada)", () => {
    const vacia: TelaBorrador = { insumoId: null, colorCodigo: null, consumoPorPrenda: "" };
    expect(lista([...sugeridas, vacia])).toEqual([...sugeridas, vacia]);
  });
  it("un avío cuyo color ya no se fabrica y la tela de un color que ya no se fabrica se descartan", () => {
    const aviosSinColor: TelaBorrador = { insumoId: HILO.id, colorCodigo: "ROJ", consumoPorPrenda: "0.02" };
    const telaSinColor: TelaBorrador = { insumoId: LINO_CRU.id, colorCodigo: "ROJ", consumoPorPrenda: "1.2" };
    expect(lista([...sugeridas, aviosSinColor, telaSinColor])).toEqual(sugeridas);
  });
  it("un modelo sin colores puede llevar avíos (antes se descartaban todos)", () => {
    const sinColor: TelaBorrador[] = [{ insumoId: LINO_SIN.id, colorCodigo: null, consumoPorPrenda: "1.2" }];
    const hilo: TelaBorrador = { insumoId: HILO.id, colorCodigo: null, consumoPorPrenda: "0.02" };
    expect(telasDeLaHoja({ sugeridas: sinColor, manual: [...sinColor, hilo], insumos })).toEqual([sinColor[0], hilo]);
  });
  it("lo que devuelve viaja a la base tal cual: las filas con tela elegida, con su color o sin él", () => {
    const deUnColor: TelaBorrador = { insumoId: HILO_BEIGE.id, colorCodigo: "PRO", consumoPorPrenda: "0.01" };
    expect(insumosParaRpc(lista([...sugeridas, deUnColor]))).toEqual([
      { insumo_id: LINO_NEG.id, color_codigo: "NEG", consumo_por_prenda: "1.2" },
      { insumo_id: HILO_BEIGE.id, color_codigo: "PRO", consumo_por_prenda: "0.01" },
    ]);
  });
});

describe("prendasDeLaFila", () => {
  const colores = [
    { codigo: "NEG", prendas: 30 },
    { codigo: "PRO", prendas: 5 },
  ];
  it("un color lleva las prendas de ese color; toda la orden, las de todos", () => {
    expect(prendasDeLaFila("NEG", colores)).toBe(30);
    expect(prendasDeLaFila(null, colores)).toBe(35);
  });
  it("un color que la orden no fabrica no lleva ninguna", () => {
    expect(prendasDeLaFila("ROJ", colores)).toBe(0);
  });
  it("un modelo sin colores: toda la orden es su única fila", () => {
    expect(prendasDeLaFila(null, [{ codigo: null, prendas: 12 }])).toBe(12);
  });
  it("coincide con lo que la base calcula como plan (`cantidad_plan`): consumo × prendas de la fila × (1 + merma)", () => {
    expect(metrosAPedir("0.02", prendasDeLaFila("NEG", colores), 0)).toBe(0.6);
    expect(metrosAPedir("0.02", prendasDeLaFila(null, colores), 0)).toBe(0.7);
  });
});

describe("cantidadAPedir — se pide hacia arriba, nunca de menos", () => {
  it("un plan de hilo menor que un cono se pide como un cono, no como cero", () => {
    expect(cantidadAPedir(0.24, "cono")).toBe(1);
    expect(cantidadAPedir(2.01, "cono")).toBe(3);
  });
  it("los metros a un decimal hacia arriba (15.12 → 15.2) y lo exacto no sube (15.1 → 15.1)", () => {
    expect(cantidadAPedir(15.12, "metro")).toBe(15.2);
    expect(cantidadAPedir(15.1, "metro")).toBe(15.1);
  });
  it("no sube por el ruido de los decimales binarios (0.6 × 10)", () => {
    expect(cantidadAPedir(0.1 + 0.2, "metro")).toBe(0.3);
    expect(cantidadAPedir(0.6000000000000001, "kilo")).toBe(0.6);
  });
  it("las unidades enteras: 192 botones son 192; un par y una docena también", () => {
    expect(cantidadAPedir(192, "unidad")).toBe(192);
    expect(cantidadAPedir(1.2, "par")).toBe(2);
    expect(cantidadAPedir(0.5, "docena")).toBe(1);
  });
  it("lo que no es una cantidad no se pide: cero", () => {
    expect(cantidadAPedir(0, "metro")).toBe(0);
    expect(cantidadAPedir(-3, "cono")).toBe(0);
    expect(cantidadAPedir(Number.NaN, "metro")).toBe(0);
  });
  it("una unidad que el catálogo no conoce se trata como metros (un decimal)", () => {
    expect(cantidadAPedir(1.01, "rollo")).toBe(1.1);
  });
});
