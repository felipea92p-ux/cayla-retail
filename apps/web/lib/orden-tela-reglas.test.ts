import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSUMO_MAXIMO,
  HINTS_SOLO_BASE,
  HINTS_TELA,
  admitePorTalla,
  aMilesimas,
  aviosSugeridos,
  cantidadAPedir,
  coloresDeLaOrden,
  consumoPorTallaSugerido,
  consumoPromedio,
  consumoSugerido,
  insumosParaRpc,
  leerConsumo,
  metrosAPedir,
  ofertaDeAviosDelModelo,
  ofertaDeConsumoDelModelo,
  planDeFila,
  prendasDeLaFila,
  problemasTela,
  separarPorTalla,
  tallasDeLaFila,
  telasDeLaHoja,
  telasSugeridas,
  unirEnUnaCifra,
  usaPorTalla,
  veredictoTela,
  type AvioDelModelo,
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
      { colorCodigo: "NEG", cantidad: 30, tallas: [] },
      { colorCodigo: "PRO", cantidad: 5, tallas: [] },
    ]);
    expect(coloresDeLaOrden([{ colorCodigo: null, cantidad: 12 }, { colorCodigo: null, cantidad: 3 }])).toEqual([{ colorCodigo: null, cantidad: 15, tallas: [] }]);
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
    expect(telasSugeridas({ tejidoId: LINO, colores: [{ colorCodigo: "NEG", cantidad: 5, tallas: [] }], insumos: [LINO_NEG, grande] })[0].insumoId).toBe(grande.id);
    expect(telasSugeridas({ tejidoId: LINO, colores: [{ colorCodigo: null, cantidad: 5, tallas: [] }], insumos: INSUMOS })).toEqual([{ insumoId: LINO_SIN.id, colorCodigo: null, consumoPorPrenda: "" }]);
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
    const t = (i.consumo_por_prenda ?? "").trim();
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


// ---------- Consumo por talla (ADR-0513, actividad 2) ----------
// Las mismas cifras que `scripts/pruebas/produccion_consumo_por_talla.mjs` comprueba contra Postgres: color 1 = 10 de la talla S y 20 de la M; color 2 = 5 y 15;
// lino con 5 % de merma. S 1.0 y M 1.5 → plan del color 1 = (10×1.0 + 20×1.5) × 1.05 = 42.000 y promedio 1.333.

const LINEAS_T = [
  { colorCodigo: "NEG", cantidad: 10, talla: "S" },
  { colorCodigo: "NEG", cantidad: 20, talla: "M" },
  { colorCodigo: "PRO", cantidad: 5, talla: "S" },
  { colorCodigo: "PRO", cantidad: 15, talla: "M" },
];
const COLORES_T = coloresDeLaOrden(LINEAS_T);
const CTX_T = { insumos: INSUMOS, colores: COLORES_T };
const porTalla = (o: Record<string, string>, extra: Partial<TelaBorrador> = {}): TelaBorrador => ({ insumoId: LINO_NEG.id, colorCodigo: "NEG", consumoPorPrenda: "", porTalla: o, ...extra });
const TALLAS_NEG = tallasDeLaFila("NEG", COLORES_T);

describe("las tallas de la orden", () => {
  it("cada color trae sus tallas con prendas, de la más chica a la más grande; una línea sin talla deja al color sin «por talla»", () => {
    expect(COLORES_T).toEqual([
      { colorCodigo: "NEG", cantidad: 30, tallas: [{ talla: "S", cantidad: 10 }, { talla: "M", cantidad: 20 }] },
      { colorCodigo: "PRO", cantidad: 20, tallas: [{ talla: "S", cantidad: 5 }, { talla: "M", cantidad: 15 }] },
    ]);
    expect(coloresDeLaOrden([{ colorCodigo: "NEG", cantidad: 3, talla: "M" }, { colorCodigo: "NEG", cantidad: 4, talla: "S" }, { colorCodigo: "NEG", cantidad: 9, talla: "L" }])[0].tallas.map((t) => t.talla)).toEqual(["S", "M", "L"]);
    expect(coloresDeLaOrden([{ colorCodigo: "NEG", cantidad: 3, talla: "S" }, { colorCodigo: "NEG", cantidad: 4, talla: null }])[0].tallas).toEqual([]);
    expect(coloresDeLaOrden([{ colorCodigo: "NEG", cantidad: 0, talla: "S" }, { colorCodigo: "NEG", cantidad: 4, talla: "M" }])[0].tallas).toEqual([{ talla: "M", cantidad: 4 }]);
  });
  it("una fila de toda la orden junta las tallas de todos los colores (15 S y 35 M); con una línea sin talla no se puede saber", () => {
    expect(tallasDeLaFila(null, COLORES_T)).toEqual([{ talla: "S", cantidad: 15 }, { talla: "M", cantidad: 35 }]);
    expect(tallasDeLaFila(null, coloresDeLaOrden([{ colorCodigo: "NEG", cantidad: 3, talla: null }]))).toEqual([]);
    expect(tallasDeLaFila("ZZZ", COLORES_T)).toEqual([]);
  });
  it("«por talla» se ofrece con dos tallas o más; con una sola, una cifra ya es la de la talla", () => {
    expect(admitePorTalla(TALLAS_NEG)).toBe(true);
    expect(admitePorTalla([{ talla: "S", cantidad: 5 }])).toBe(false);
    expect(admitePorTalla([])).toBe(false);
  });
});

describe("el plan por talla es el de la base", () => {
  it("planDeFila = Σ (cifra × prendas de la talla) × (1 + merma): 42.000; el promedio guardado es 1.333 y una talla sin leer deja el plan sin calcular", () => {
    const t = porTalla({ S: "1.0", M: "1.5" });
    expect(usaPorTalla(t, TALLAS_NEG)).toBe(true);
    expect(planDeFila(t, TALLAS_NEG, 30, 0.05)).toBe(42);
    expect(consumoPromedio(t, TALLAS_NEG)).toBe(1.333);
    expect(planDeFila(porTalla({ S: "1.0", M: "" }), TALLAS_NEG, 30, 0.05)).toBeNull();
    expect(planDeFila(porTalla({ S: "1.0", M: "x" }), TALLAS_NEG, 30, 0.05)).toBeNull();
  });
  it("una fila de toda la orden suma todos los colores: (15×1.0 + 35×2.0) × 1.05 = 89.25 y promedio 1.700", () => {
    const todas = tallasDeLaFila(null, COLORES_T);
    const t = porTalla({ S: "1.0", M: "2.0" }, { colorCodigo: null });
    expect(planDeFila(t, todas, 50, 0.05)).toBe(89.25);
    expect(consumoPromedio(t, todas)).toBe(1.7);
  });
  it("sin cifra por talla, o con una sola talla, todo es como siempre: consumo × prendas × (1 + merma)", () => {
    expect(planDeFila(fila({ consumoPorPrenda: "1.2" }), TALLAS_NEG, 30, 0.05)).toBe(37.8);
    expect(planDeFila(porTalla({ S: "9" }, { consumoPorPrenda: "1.2" }), [{ talla: "S", cantidad: 30 }], 30, 0.05)).toBe(37.8);
    expect(consumoPromedio(fila({ consumoPorPrenda: "1.2" }), TALLAS_NEG)).toBe(1.2);
  });
  it("separar por talla parte de la cifra única; volver a una cifra deja el promedio; sin dos tallas no cambia nada", () => {
    const una = fila({ consumoPorPrenda: "1.333" });
    const separada = separarPorTalla(una, TALLAS_NEG);
    expect(separada.porTalla).toEqual({ S: "1.333", M: "1.333" });
    expect(separarPorTalla(una, [{ talla: "S", cantidad: 30 }])).toBe(una);
    const distinta = { ...separada, porTalla: { S: "1.0", M: "1.5" } };
    const unida = unirEnUnaCifra(distinta, TALLAS_NEG);
    expect(unida.consumoPorPrenda).toBe("1.333");
    expect(unida.porTalla).toBeNull();
    expect(separarPorTalla(distinta, TALLAS_NEG).porTalla).toEqual({ S: "1.0", M: "1.5" });
  });
});

describe("problemasTela con cifra por talla", () => {
  it("dice qué talla falta, con su motivo, y no pide la cifra única (la base la calcula)", () => {
    const p = problemasTela([porTalla({ S: "1.0", M: "" })], CTX_T);
    expect(p.map((x) => `${x.hint}:${x.talla}`)).toEqual(["insumo_consumo_invalido:M"]);
    expect(p[0].texto).toMatch(/talla M/);
    expect(problemasTela([porTalla({ S: "1.0", M: "1,5" }), porTalla({ S: "0", M: "x" }, { insumoId: HILO.id, colorCodigo: null })], CTX_T).map((x) => `${x.indice}:${x.talla}`)).toEqual(["0:M", "1:S", "1:M"]);
    expect(problemasTela([porTalla({ S: "1.0", M: "10000" })], CTX_T).map((x) => x.talla)).toEqual(["M"]);
    expect(problemasTela([porTalla({ S: "1.0", M: "1.5" })], CTX_T)).toEqual([]);
  });
  it("una talla que la orden ya no fabrica (llave de más) no estorba: no se pide ni viaja", () => {
    expect(problemasTela([porTalla({ S: "1.0", M: "1.5", XXL: "" })], CTX_T)).toEqual([]);
  });
  it("con una sola talla en el color, la fila se trata como de una cifra aunque traiga porTalla", () => {
    const solo = coloresDeLaOrden([{ colorCodigo: "NEG", cantidad: 10, talla: "S" }]);
    expect(problemasTela([porTalla({ S: "1.0" }, { consumoPorPrenda: "" })], { insumos: INSUMOS, colores: solo }).map((x) => x.hint)).toEqual(["insumo_consumo_invalido"]);
  });
});

describe("insumosParaRpc con cifra por talla", () => {
  it("manda `consumo_por_talla` con las tallas de la fila (y solo ellas) y NO manda `consumo_por_prenda`", () => {
    const [i] = insumosParaRpc([porTalla({ S: " 1.0 ", M: "1.5", XXL: "9" })], COLORES_T);
    expect(i).toEqual({ insumo_id: LINO_NEG.id, color_codigo: "NEG", consumo_por_talla: { S: "1.0", M: "1.5" } });
    expect("consumo_por_prenda" in i).toBe(false);
  });
  it("una fila de una cifra, o sin tallas conocidas, viaja como siempre", () => {
    expect(insumosParaRpc([fila({ consumoPorPrenda: "1.2" })], COLORES_T)).toEqual([{ insumo_id: LINO_NEG.id, color_codigo: "NEG", consumo_por_prenda: "1.2" }]);
    expect(insumosParaRpc([porTalla({ S: "1.0", M: "1.5" }, { consumoPorPrenda: "1.2" })])).toEqual([{ insumo_id: LINO_NEG.id, color_codigo: "NEG", consumo_por_prenda: "1.2" }]);
  });
});

describe("lo que propone el modelo por talla", () => {
  const modelo = { telaPorPrenda: 1.18, fuente: "declarado" as const, porTalla: { S: 1.15, M: 1.2 }, declaradoPorPrenda: 1.18 };
  it("la cifra por talla del modelo se propone solo donde cubre TODAS las tallas del color; si no, queda la cifra única", () => {
    const f = telasSugeridas({ tejidoId: LINO, colores: COLORES_T, insumos: INSUMOS, consumo: "1.180", porTalla: consumoPorTallaSugerido(modelo) });
    expect(f.map((t) => t.porTalla)).toEqual([{ S: "1.150", M: "1.200" }, { S: "1.150", M: "1.200" }]);
    const conL = coloresDeLaOrden([...LINEAS_T, { colorCodigo: "NEG", cantidad: 3, talla: "L" }]);
    expect(telasSugeridas({ tejidoId: LINO, colores: conL, insumos: INSUMOS, consumo: "1.180", porTalla: consumoPorTallaSugerido(modelo) }).map((t) => t.porTalla ?? null)).toEqual([null, { S: "1.150", M: "1.200" }]);
    expect(telasSugeridas({ tejidoId: LINO, colores: COLORES_T, insumos: INSUMOS, consumo: "1.180" }).every((t) => t.porTalla === undefined)).toBe(true);
  });
  it("cuando manda lo medido, la FORMA es la de Audaces y solo sube el nivel: cada talla × (medido ÷ declarado)", () => {
    const medido = { ...modelo, telaPorPrenda: 1.251, fuente: "medido" as const };
    const k = 1.251 / 1.18;
    expect(consumoPorTallaSugerido(medido)).toEqual({ S: aMilesimas(1.15 * k), M: aMilesimas(1.2 * k) });
    expect(consumoPorTallaSugerido(modelo)).toEqual({ S: 1.15, M: 1.2 });
    expect(consumoPorTallaSugerido({ telaPorPrenda: 1.2, fuente: "declarado" })).toBeNull();
    expect(consumoPorTallaSugerido(null)).toBeNull();
  });
  it("«dejar como el del modelo»: con cifra por talla se compara la FORMA (el promedio de una orden depende de sus tallas): igual forma = nada que ofrecer; otra = corregir", () => {
    const igual = [porTalla({ S: "1.150", M: "1.200" })];
    expect(ofertaDeConsumoDelModelo(igual, INSUMOS, modelo, COLORES_T)).toEqual({ tipo: "ninguna" });
    const otra = [porTalla({ S: "1.150", M: "1.300" })];
    expect(ofertaDeConsumoDelModelo(otra, INSUMOS, modelo, COLORES_T)).toMatchObject({ tipo: "corregir", actual: 1.18 });
    // El modelo tiene forma y la orden una sola cifra (o al revés): es otra cosa, se ofrece corregir.
    expect(ofertaDeConsumoDelModelo([fila({ consumoPorPrenda: "1.180" })], INSUMOS, modelo, COLORES_T)).toMatchObject({ tipo: "corregir" });
    expect(ofertaDeConsumoDelModelo(igual, INSUMOS, { telaPorPrenda: 1.18, fuente: "declarado" }, COLORES_T)).toMatchObject({ tipo: "corregir" });
    // Sin modelo que lo diga, la primera orden lo deja declarado, con el promedio de la fila.
    expect(ofertaDeConsumoDelModelo([porTalla({ S: "1.0", M: "1.5" })], INSUMOS, null, COLORES_T)).toMatchObject({ tipo: "primera", nuevo: 1.333 });
  });
});

describe("paridad con la migración 20261026151000 (consumo por talla)", () => {
  const SQL_TALLA = readFileSync(join(RAIZ, "supabase/migrations/20261026151000_produccion_consumo_por_talla.sql"), "utf8");
  it("el hint que la hoja nunca provoca existe en la base, y todo hint nuevo de la base está en una de las dos listas", () => {
    for (const h of HINTS_SOLO_BASE) expect(SQL_TALLA, h).toContain(`hint = '${h}'`);
    const nuevos = [...new Set([...SQL_TALLA.matchAll(/hint = '([a-z_]+)'/g)].map((m) => m[1]))].sort();
    for (const h of nuevos) expect([...HINTS_TELA, ...HINTS_SOLO_BASE] as string[], h).toContain(h);
  });
  it("la llave que viaja (`consumo_por_talla`), la suma por talla y el tope son los de la función", () => {
    const [primera] = insumosParaRpc([porTalla({ S: "1", M: "1" })], COLORES_T);
    expect(SQL_TALLA).toContain(`v_i -> '${Object.keys(primera).find((k) => k === "consumo_por_talla")}'`);
    expect(SQL_TALLA).toContain("v_plan := round(v_suma * (1 + coalesce(v_merma, 0)), 3);");
    expect(SQL_TALLA).toContain("round(v_suma / v_peso, 3)");
    expect(SQL_TALLA).toContain(`v_consumo > ${CONSUMO_MAXIMO}`);
  });
});


// ---------- Los avíos del modelo (ADR-0513, actividad 3) ----------
// Las mismas cifras que `scripts/pruebas/produccion_avios_modelo.mjs` comprueba contra Postgres: botones 4 para toda la orden y un hilo del color de la orden.

describe("los avíos que el modelo ya tiene", () => {
  const BOTON = tela("boton", { tipo: "avio", unidad: "unidad", tejidoId: null, colorCodigo: null });
  const HILO_NEG = tela("hilo-neg", { tipo: "avio", unidad: "cono", tejidoId: null, colorCodigo: "NEG" });
  const HILO_ROJO = tela("hilo-rojo", { tipo: "avio", unidad: "cono", tejidoId: null, colorCodigo: "ROJ" });
  const VIEJO = tela("boton-viejo", { tipo: "avio", unidad: "unidad", tejidoId: null, colorCodigo: null, archivado: true });
  const ESTANTE = [...INSUMOS, BOTON, HILO_NEG, HILO_ROJO, VIEJO];
  const delModelo: AvioDelModelo[] = [
    { insumoId: "boton", colorCodigo: null, cantidadPorPrenda: 4 },
    { insumoId: "hilo-neg", colorCodigo: "NEG", cantidadPorPrenda: 0.03 },
  ];

  it("se proponen como filas de la hoja, en el orden del modelo, con tres decimales", () => {
    expect(aviosSugeridos({ avios: delModelo, colores: COLORES, insumos: ESTANTE })).toEqual([
      { insumoId: "boton", colorCodigo: null, consumoPorPrenda: "4.000" },
      { insumoId: "hilo-neg", colorCodigo: "NEG", consumoPorPrenda: "0.030" },
    ]);
  });
  it("se salta lo que no sirve para esta orden, sin preguntar: avío archivado o que ya no está, uno que no es avío, el de un color que la orden no fabrica, y repetidos", () => {
    const avios: AvioDelModelo[] = [
      { insumoId: "boton-viejo", colorCodigo: null, cantidadPorPrenda: 4 },
      { insumoId: "no-existe", colorCodigo: null, cantidadPorPrenda: 4 },
      { insumoId: LINO_NEG.id, colorCodigo: null, cantidadPorPrenda: 4 },
      { insumoId: "hilo-rojo", colorCodigo: "ROJ", cantidadPorPrenda: 0.03 },
      { insumoId: "boton", colorCodigo: null, cantidadPorPrenda: 4 },
      { insumoId: "boton", colorCodigo: null, cantidadPorPrenda: 9 },
    ];
    expect(aviosSugeridos({ avios, colores: COLORES, insumos: ESTANTE })).toEqual([{ insumoId: "boton", colorCodigo: null, consumoPorPrenda: "4.000" }]);
    expect(aviosSugeridos({ avios: [], colores: COLORES, insumos: ESTANTE })).toEqual([]);
  });
  it("lo que se propone pasa la validación de la base (no trae faltas)", () => {
    const filas = [fila(), ...aviosSugeridos({ avios: delModelo, colores: COLORES, insumos: ESTANTE })];
    expect(problemasTela(filas, { insumos: ESTANTE, colores: COLORES })).toEqual([]);
  });
  it("la hoja pone los avíos del modelo detrás de la tela mientras nadie toca nada; al tocar, manda lo que la persona dejó (lo que quitó no vuelve)", () => {
    const sugeridas = telasSugeridas({ tejidoId: LINO, colores: COLORES, insumos: ESTANTE });
    const avios = aviosSugeridos({ avios: delModelo, colores: COLORES, insumos: ESTANTE });
    const sinTocar = telasDeLaHoja({ sugeridas, manual: null, insumos: ESTANTE, avios });
    expect(sinTocar.map((t) => t.insumoId)).toEqual([LINO_NEG.id, LINO_SIN.id, "boton", "hilo-neg"]);
    // Tocó la tela y quitó el hilo: la lista que quedó (`manual`) ya no lo trae y no vuelve.
    const manual = sinTocar.filter((t) => t.insumoId !== "hilo-neg");
    expect(telasDeLaHoja({ sugeridas, manual, insumos: ESTANTE, avios }).map((t) => t.insumoId)).toEqual([LINO_NEG.id, LINO_SIN.id, "boton"]);
  });
  it("la oferta de dejarlos como los del modelo: primera vez, igual, otros, o ninguno", () => {
    const filaAvio = (insumoId: string, colorCodigo: string | null, consumoPorPrenda: string): TelaBorrador => ({ insumoId, colorCodigo, consumoPorPrenda });
    const iguales = [fila(), filaAvio("boton", null, "4"), filaAvio("hilo-neg", "NEG", "0.03")];
    // El modelo no tiene avíos: la primera orden los anota sola.
    expect(ofertaDeAviosDelModelo(iguales, ESTANTE, [])).toEqual({ tipo: "primera", cuantos: 2 });
    // Lo mismo que el modelo, escrito de otra forma («4» y «4.000»): nada que ofrecer.
    expect(ofertaDeAviosDelModelo(iguales, ESTANTE, delModelo)).toEqual({ tipo: "ninguna" });
    // Otra cantidad, un avío de más o de menos: se ofrece corregir.
    expect(ofertaDeAviosDelModelo([fila(), filaAvio("boton", null, "6"), filaAvio("hilo-neg", "NEG", "0.03")], ESTANTE, delModelo)).toEqual({ tipo: "corregir", cuantos: 2, delModelo: 2 });
    expect(ofertaDeAviosDelModelo([fila(), filaAvio("boton", null, "4")], ESTANTE, delModelo)).toEqual({ tipo: "corregir", cuantos: 1, delModelo: 2 });
    // Sin avíos en la orden (o con una fila sin leer) no hay nada que ofrecer, tenga o no el modelo.
    expect(ofertaDeAviosDelModelo([fila()], ESTANTE, delModelo)).toEqual({ tipo: "ninguna" });
    expect(ofertaDeAviosDelModelo([filaAvio("boton", null, "")], ESTANTE, [])).toEqual({ tipo: "ninguna" });
    // La tela no cuenta como avío.
    expect(ofertaDeAviosDelModelo([fila()], ESTANTE, [])).toEqual({ tipo: "ninguna" });
  });
});

describe("los complementos de la prenda: forro y otras telas (ADR-0563)", () => {
  const FORRO = tela("forro-popelina", { nombre: "Forro popelina", tejidoId: "tej-pop" });
  const insumos = [...INSUMOS, FORRO];
  const lino: TelaBorrador = { insumoId: LINO_NEG.id, colorCodigo: "NEG", consumoPorPrenda: "1.2" };
  const sugeridas: TelaBorrador[] = [lino, { insumoId: null, colorCodigo: "PRO", consumoPorPrenda: "1.2" }];
  const forroDeTodos: TelaBorrador = { insumoId: FORRO.id, colorCodigo: null, consumoPorPrenda: "0.9", complemento: true };
  const forroDeNegro: TelaBorrador = { insumoId: FORRO.id, colorCodigo: "NEG", consumoPorPrenda: "0.9", complemento: true };

  it("insumosParaRpc manda `complemento: true` solo en lo que lo es: el resto viaja EXACTAMENTE como antes (sin la llave)", () => {
    const rpc = insumosParaRpc([lino, forroDeTodos, { ...forroDeNegro, complemento: false }], COLORES);
    expect(rpc[0]).toEqual({ insumo_id: LINO_NEG.id, color_codigo: "NEG", consumo_por_prenda: "1.2" });
    expect(rpc[1]).toEqual({ insumo_id: FORRO.id, color_codigo: null, consumo_por_prenda: "0.9", complemento: true });
    expect("complemento" in rpc[2]).toBe(false);
  });
  it("un complemento con cifra por talla también lleva la marca", () => {
    const porTalla = { insumoId: FORRO.id, colorCodigo: "NEG", consumoPorPrenda: "", complemento: true, porTalla: { S: "0.8", M: "1.0" } };
    const colores = coloresDeLaOrden([{ colorCodigo: "NEG", cantidad: 5, talla: "S" }, { colorCodigo: "NEG", cantidad: 5, talla: "M" }]);
    expect(insumosParaRpc([porTalla], colores)[0]).toMatchObject({ complemento: true, consumo_por_talla: { S: "0.8", M: "1.0" } });
  });
  it("la lista de Nueva orden conserva el forro (de toda la orden o de un color) después de las filas de color, y no lo toma por la tela de su color", () => {
    // El forro de NEG va ANTES que el lino en lo que la persona tocó: aun así la tela de NEG es el lino.
    const lista = telasDeLaHoja({ sugeridas, manual: [forroDeNegro, lino, forroDeTodos], insumos });
    expect(lista).toEqual([lino, sugeridas[1], forroDeNegro, forroDeTodos]);
  });
  it("un forro de un color que la orden no fabrica se descarta (como un avío), y una fila nueva sin elegir sigue ahí", () => {
    const ajeno: TelaBorrador = { ...forroDeNegro, colorCodigo: "XXX" };
    const vacia: TelaBorrador = { insumoId: null, colorCodigo: null, consumoPorPrenda: "" };
    expect(telasDeLaHoja({ sugeridas, manual: [lino, ajeno, vacia], insumos })).toEqual([lino, sugeridas[1], vacia]);
  });
  it("el forro no es la tela del modelo: aunque vaya primero, «Dejar este consumo como el del modelo» mira al lino", () => {
    const declarado = { telaPorPrenda: 1.2, fuente: "declarado" as const };
    expect(ofertaDeConsumoDelModelo([forroDeTodos, lino], insumos, null, COLORES)).toMatchObject({ tipo: "primera", nuevo: 1.2 });
    expect(ofertaDeConsumoDelModelo([forroDeTodos, lino], insumos, declarado, COLORES)).toEqual({ tipo: "ninguna" });
    // Sin ninguna tela principal (solo el forro), no hay nada que declarar.
    expect(ofertaDeConsumoDelModelo([forroDeTodos], insumos, null, COLORES)).toEqual({ tipo: "ninguna" });
  });
  it("problemasTela trata al forro como cualquier material: lo mismo repetido en el mismo color se rechaza, en colores distintos no", () => {
    const hintsConForro = (telas: TelaBorrador[]) => problemasTela(telas, { insumos, colores: COLORES }).map((p) => p.hint);
    expect(hintsConForro([lino, forroDeNegro, { ...forroDeNegro }])).toEqual(["insumo_repetido"]);
    expect(hintsConForro([lino, forroDeNegro, { ...forroDeNegro, colorCodigo: "PRO" }])).toEqual([]);
  });
});

describe("paridad con la migración 20261029021000 (complementos)", () => {
  const SQL_COMPLEMENTOS = readFileSync(join(RAIZ, "supabase/migrations/20261029021000_produccion_complementos_de_la_orden.sql"), "utf8");
  it("la base lee la misma llave que manda la web y guarda el rol en la columna que la lectura devuelve", () => {
    const rpc = insumosParaRpc([{ insumoId: "x", colorCodigo: null, consumoPorPrenda: "1", complemento: true }]);
    const llaves = Object.keys(rpc[0]).filter((k) => !["insumo_id", "color_codigo", "consumo_por_prenda", "consumo_por_talla"].includes(k));
    expect(llaves).toEqual(["complemento"]);
    expect(SQL_COMPLEMENTOS).toContain("(x ->> 'complemento')::boolean");
    expect(SQL_COMPLEMENTOS).toContain("add column if not exists es_complemento boolean not null default false");
    expect(SQL_COMPLEMENTOS).toContain("'es_complemento', pi.es_complemento");
  });
  it("un valor que no es verdadero o falso se rechaza con un hint que la hoja ya conoce", () => {
    const hint = /using hint = '(\w+)'/.exec(SQL_COMPLEMENTOS)?.[1];
    expect(HINTS_TELA).toContain(hint);
  });
});
