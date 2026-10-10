// Plan de campaña (ADR-0349): cuánto comprar por categoría para una campaña (diciembre 2026 primero). Lógica pura, sin React ni red.
//
// EL PROBLEMA. Diciembre triplica un mes promedio y no hay historia para pronosticarlo (Felipe, 2026-10-05). Comprar «lo que se espera
// vender» trata igual dos categorías muy distintas: una donde lo que sobra se vende casi al mismo precio el año siguiente (pasarse
// cuesta poco: conviene comprar de más) y otra que pasa de moda (pasarse cuesta caro: conviene quedarse corto). Es el modelo del
// vendedor de diarios, el mismo que usa Amazon cuando pronostica cuantiles en vez de promedios (docs/investigacion/2026-10-05-…).
//
// LA CUENTA.
//   · Lo que se pierde por cada prenda que faltó: precio − costo (Cu). Por cada prenda que sobró: costo − lo que se recupera (Co),
//     con lo que se recupera = precio × recupero %.
//   · Cuantil crítico = Cu ÷ (Cu + Co): la probabilidad de cubrir la demanda que conviene comprar.
//   · La demanda de la campaña es incierta: tres escenarios (flojo, normal, bueno) forman una distribución triangular; se compra
//     hasta su cuantil crítico, menos lo que ya hay en la red.
//   · La curva de tallas la propone el sistema desde lo vendido (con su prenda o anotado) en 90 días, apoyada en un reparto parejo
//     entre las tallas de la categoría con el mismo encogimiento del motor de demanda: n/(n+k), k = 10 unidades.
//
// CONTRATO
//   PROMETE: leer `fn_plan_compra` sin confiar en su forma; las mismas validaciones que `guardar_plan_compra_linea` (para que la guía
//            de foco y el botón digan lo mismo que la base); cantidades enteras que suman exacto (resto mayor).
//   NO HACE: no compra nada ni decide por la persona: propone y muestra el porqué.

export const RPC_PLAN = "fn_plan_compra";
export const RPC_GUARDAR_LINEA = "guardar_plan_compra_linea";
/** Cuántas unidades vendidas «valen» igual que el reparto parejo al proponer la curva. */
export const K_CURVA = 10;

export type TallaPlan = { id: string; valor: string };
export type CategoriaPlan = { id: string; nombre: string; prefijo: string | null; familia: string | null; tallas: TallaPlan[] };
export type LineaPlan = {
  categoriaId: string;
  flojo: number;
  normal: number;
  bueno: number;
  precio: number;
  costo: number;
  recuperoPct: number;
  /** talla_id → porcentaje entero; vacío = sin curva decidida. */
  curva: Record<string, number>;
  nota: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
};
export type LecturaPlan = {
  plan: { id: string; nombre: string; desde: string; hasta: string };
  hoy: string;
  planes: { id: string; nombre: string }[];
  categorias: CategoriaPlan[];
  lineas: Map<string, LineaPlan>;
  stock: Map<string, number>;
  /** categoría → talla → unidades vendidas en 90 días. */
  vendidoPorTalla: Map<string, Map<string, number>>;
  /** categoría → unidades vendidas dentro de la campaña. */
  vendidoEnCampana: Map<string, number>;
};

// ---------------------------------------------------------------------------------------------------------------------
// 1. Leer
// ---------------------------------------------------------------------------------------------------------------------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);

export function leerPlan(v: unknown): LecturaPlan | null {
  if (!esObjeto(v) || !esObjeto(v.plan)) return null;
  const id = texto(v.plan.id);
  const nombre = texto(v.plan.nombre);
  const desde = texto(v.plan.desde);
  const hasta = texto(v.plan.hasta);
  const hoy = texto(v.hoy);
  if (!id || !nombre || !desde || !hasta || !hoy) return null;

  const categorias = lista(v.categorias).flatMap((c): CategoriaPlan[] => {
    const cid = texto(c.id);
    const cnom = texto(c.nombre);
    if (!cid || !cnom) return [];
    const tallas = lista(c.tallas).flatMap((t): TallaPlan[] => (texto(t.id) && texto(t.valor) ? [{ id: t.id as string, valor: t.valor as string }] : []));
    return [{ id: cid, nombre: cnom, prefijo: texto(c.prefijo), familia: texto(c.familia), tallas }];
  });

  const lineas = new Map<string, LineaPlan>();
  for (const l of lista(v.lineas)) {
    const cid = texto(l.categoria_id);
    if (!cid) continue;
    const curva: Record<string, number> = {};
    if (esObjeto(l.curva)) for (const [k, p] of Object.entries(l.curva)) curva[k] = numero(p);
    lineas.set(cid, {
      categoriaId: cid,
      flojo: numero(l.flojo),
      normal: numero(l.normal),
      bueno: numero(l.bueno),
      precio: numero(l.precio),
      costo: numero(l.costo),
      recuperoPct: numero(l.recupero_pct),
      curva,
      nota: texto(l.nota),
      actualizadoPor: texto(l.actualizado_por),
      actualizadoEn: texto(l.updated_at),
    });
  }

  const porCategoria = (filas: unknown) => {
    const m = new Map<string, number>();
    for (const f of lista(filas)) {
      const cid = texto(f.categoria_id);
      if (cid) m.set(cid, (m.get(cid) ?? 0) + numero(f.unidades));
    }
    return m;
  };
  const vendidoPorTalla = new Map<string, Map<string, number>>();
  for (const f of lista(v.curvas)) {
    const cid = texto(f.categoria_id);
    const tid = texto(f.talla_id);
    if (!cid || !tid) continue;
    const m = vendidoPorTalla.get(cid) ?? new Map<string, number>();
    m.set(tid, (m.get(tid) ?? 0) + numero(f.unidades));
    vendidoPorTalla.set(cid, m);
  }

  return {
    plan: { id, nombre, desde, hasta },
    hoy,
    planes: lista(v.planes).flatMap((p) => (texto(p.id) && texto(p.nombre) ? [{ id: p.id as string, nombre: p.nombre as string }] : [])),
    categorias,
    lineas,
    stock: porCategoria(v.stock),
    vendidoPorTalla,
    vendidoEnCampana: porCategoria(v.vendido),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Cuánto comprar
// ---------------------------------------------------------------------------------------------------------------------

/** Cu ÷ (Cu + Co). Si sobrar no cuesta nada (se recupera todo el costo), conviene cubrir el escenario bueno: 1. */
export function cuantilCritico(precio: number, costo: number, recuperoPct: number): number {
  const cu = Math.max(precio - costo, 0);
  const co = Math.max(costo - (precio * recuperoPct) / 100, 0);
  if (cu + co === 0) return 0.5;
  return cu / (cu + co);
}

/** El cuantil p de una triangular (mínimo a, más probable c, máximo b). */
export function cuantilTriangular(a: number, c: number, b: number, p: number): number {
  if (b <= a) return a;
  const q = Math.min(Math.max(p, 0), 1);
  const fc = (c - a) / (b - a);
  return q < fc ? a + Math.sqrt(q * (b - a) * (c - a)) : b - Math.sqrt((1 - q) * (b - a) * (b - c));
}

export type Calculo = {
  /** La probabilidad de cubrir la demanda que conviene (0 a 1). */
  cuantil: number;
  /** Las unidades que conviene tener para la campaña. */
  objetivo: number;
  /** Lo que ya hay en la red. */
  stock: number;
  /** Lo que hay que comprar: objetivo − stock, nunca negativo. */
  comprar: number;
  /** Lo que cuesta comprarlo. */
  inversion: number;
};

export function calcular(l: Pick<LineaPlan, "flojo" | "normal" | "bueno" | "precio" | "costo" | "recuperoPct">, stock: number): Calculo {
  const cuantil = cuantilCritico(l.precio, l.costo, l.recuperoPct);
  const objetivo = Math.ceil(cuantilTriangular(l.flojo, l.normal, l.bueno, cuantil) - 1e-9);
  const comprar = Math.max(0, objetivo - stock);
  return { cuantil, objetivo, stock, comprar, inversion: Math.round(comprar * l.costo * 100) / 100 };
}

/** «Pasarse cuesta poco: conviene cubrir hasta un diciembre bueno.» El porqué del número, en palabras de Compras. */
export function porQue(c: Calculo): string {
  const pct = Math.round(c.cuantil * 100);
  if (pct >= 99) return "Lo que sobra se vende casi al costo: sobrar no cuesta, así que se compra para cubrir hasta un diciembre bueno.";
  if (c.cuantil >= 0.75) return `Sobrar cuesta poco frente a quedarse corto: se compra para cubrir ${pct} de cada 100 diciembres posibles.`;
  if (c.cuantil <= 0.4) return `Sobrar cuesta caro: se compra para cubrir solo ${pct} de cada 100 diciembres posibles.`;
  return `Quedarse corto y sobrar cuestan parecido: se compra para cubrir ${pct} de cada 100 diciembres posibles.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Curva de tallas
// ---------------------------------------------------------------------------------------------------------------------

/** Reparte `total` en enteros según `pesos`, sumando exacto (método del resto mayor; empate: el orden de entrada). */
export function repartir(total: number, pesos: readonly { id: string; peso: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const suma = pesos.reduce((s, p) => s + Math.max(p.peso, 0), 0);
  if (pesos.length === 0) return out;
  if (suma === 0) return repartir(total, pesos.map((p) => ({ id: p.id, peso: 1 })));
  const exactos = pesos.map((p, i) => ({ id: p.id, i, exacto: (total * Math.max(p.peso, 0)) / suma }));
  let asignado = 0;
  for (const e of exactos) {
    const base = Math.floor(e.exacto + 1e-9);
    out.set(e.id, base);
    asignado += base;
  }
  const porResto = [...exactos].sort((a, b) => b.exacto - Math.floor(b.exacto + 1e-9) - (a.exacto - Math.floor(a.exacto + 1e-9)) || a.i - b.i);
  for (let k = 0; k < total - asignado; k++) out.set(porResto[k % porResto.length].id, (out.get(porResto[k % porResto.length].id) ?? 0) + 1);
  return out;
}

/**
 * La curva que propone el sistema para una categoría: lo vendido por talla en 90 días, apoyado en el reparto parejo con peso
 * n/(n+K_CURVA) (n = unidades vendidas). En porcentajes enteros que suman 100. Sin tallas, vacía.
 */
export function curvaSugerida(tallas: readonly TallaPlan[], vendido: ReadonlyMap<string, number> | undefined): Record<string, number> {
  if (tallas.length === 0) return {};
  const n = tallas.reduce((s, t) => s + (vendido?.get(t.id) ?? 0), 0);
  const w = n / (n + K_CURVA);
  const pesos = tallas.map((t) => ({ id: t.id, peso: w * (n > 0 ? (vendido?.get(t.id) ?? 0) / n : 0) + (1 - w) / tallas.length }));
  return Object.fromEntries(repartir(100, pesos));
}

/** Cuántas de cada talla comprar, según la curva (o parejo si no hay curva). */
export function comprarPorTalla(total: number, tallas: readonly TallaPlan[], curva: Record<string, number>): Map<string, number> {
  const conCurva = Object.keys(curva).length > 0;
  return repartir(total, tallas.map((t) => ({ id: t.id, peso: conCurva ? (curva[t.id] ?? 0) : 1 })));
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Validar (lo mismo que `guardar_plan_compra_linea`)
// ---------------------------------------------------------------------------------------------------------------------

export type Borrador = { flojo: string; normal: string; bueno: string; precio: string; costo: string; recupero: string; curva: Record<string, string> };
export type CampoPlan = "flojo" | "normal" | "bueno" | "precio" | "costo" | "recupero" | "curva";

const entero = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);
const monto = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null;
};

/** Lo que impide guardar, campo por campo (vacío = se puede). Cada texto dice qué hacer. */
export function problemasDelBorrador(b: Borrador, tallas: readonly TallaPlan[]): Partial<Record<CampoPlan, string>> {
  const p: Partial<Record<CampoPlan, string>> = {};
  const flojo = entero(b.flojo);
  const normal = entero(b.normal);
  const bueno = entero(b.bueno);
  if (flojo === null) p.flojo = "Escribe cuántas venderías en un diciembre flojo (puede ser 0).";
  if (normal === null) p.normal = "Escribe cuántas venderías en un diciembre normal.";
  else if (flojo !== null && normal < flojo) p.normal = "Un diciembre normal no vende menos que uno flojo.";
  if (bueno === null) p.bueno = "Escribe cuántas venderías en un diciembre bueno.";
  else if (normal !== null && bueno < normal) p.bueno = "Un diciembre bueno no vende menos que uno normal.";
  const precio = monto(b.precio);
  const costo = monto(b.costo);
  if (precio === null || precio <= 0) p.precio = "Escribe el precio de venta promedio de la categoría.";
  if (costo === null) p.costo = "Escribe el costo promedio por prenda.";
  else if (precio !== null && costo >= precio) p.costo = "El costo tiene que ser menor que el precio de venta.";
  const recupero = entero(b.recupero);
  if (recupero === null || recupero > 100) p.recupero = "Escribe a qué % del precio vendes lo que sobre (de 0 a 100).";
  const usadas = tallas.filter((t) => (b.curva[t.id] ?? "").trim() !== "");
  if (usadas.length > 0) {
    const valores = tallas.map((t) => entero(b.curva[t.id] ?? "0") ?? NaN);
    const suma = valores.reduce((s, x) => s + x, 0);
    if (valores.some((x) => !Number.isFinite(x) || x > 100)) p.curva = "Cada talla lleva un porcentaje entero de 0 a 100.";
    else if (suma !== 100) p.curva = `La curva suma ${suma} %: tiene que sumar 100 %.`;
  }
  return p;
}

/** Los argumentos de `guardar_plan_compra_linea` desde un borrador válido. */
export function argsGuardar(planId: string, categoriaId: string, b: Borrador, tallas: readonly TallaPlan[], nota: string) {
  const curva: Record<string, number> = {};
  if (tallas.some((t) => (b.curva[t.id] ?? "").trim() !== "")) for (const t of tallas) curva[t.id] = Number((b.curva[t.id] ?? "0").trim() || "0");
  return {
    p_plan_id: planId,
    p_categoria_id: categoriaId,
    p_flojo: Number(b.flojo.trim()),
    p_normal: Number(b.normal.trim()),
    p_bueno: Number(b.bueno.trim()),
    p_precio: Number(b.precio.trim().replace(",", ".")),
    p_costo: Number(b.costo.trim().replace(",", ".")),
    p_recupero_pct: Number(b.recupero.trim()),
    p_curva: curva,
    p_nota: nota.trim() === "" ? null : nota.trim(),
  };
}

/** El borrador para una categoría: lo guardado, o vacío con la curva que propone el sistema. */
export function borradorDe(linea: LineaPlan | undefined, tallas: readonly TallaPlan[], vendido: ReadonlyMap<string, number> | undefined): Borrador {
  const curva = linea && Object.keys(linea.curva).length > 0 ? linea.curva : curvaSugerida(tallas, vendido);
  return {
    flojo: linea ? String(linea.flojo) : "",
    normal: linea ? String(linea.normal) : "",
    bueno: linea ? String(linea.bueno) : "",
    precio: linea ? linea.precio.toFixed(2) : "",
    costo: linea ? linea.costo.toFixed(2) : "",
    recupero: linea ? String(linea.recuperoPct) : "",
    curva: Object.fromEntries(Object.entries(curva).map(([k, v]) => [k, String(v)])),
  };
}

/** El borrador como línea (para calcular en vivo mientras se escribe); null si todavía no se puede. */
export function lineaDeBorrador(b: Borrador, tallas: readonly TallaPlan[]): Pick<LineaPlan, "flojo" | "normal" | "bueno" | "precio" | "costo" | "recuperoPct" | "curva"> | null {
  if (Object.keys(problemasDelBorrador(b, tallas)).length > 0) return null;
  const a = argsGuardar("", "", b, tallas, "");
  return { flojo: a.p_flojo, normal: a.p_normal, bueno: a.p_bueno, precio: a.p_precio, costo: a.p_costo, recuperoPct: a.p_recupero_pct, curva: a.p_curva };
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. Lo real (en enero)
// ---------------------------------------------------------------------------------------------------------------------

export type EstadoCampana = "antes" | "durante" | "despues";
export const estadoCampana = (hoy: string, desde: string, hasta: string): EstadoCampana => (hoy < desde ? "antes" : hoy > hasta ? "despues" : "durante");

/** «Se vendieron 140: entre el normal (120) y el bueno (180).» Para comparar el supuesto con lo que pasó. */
export function fraseDeLoReal(vendido: number, l: Pick<LineaPlan, "flojo" | "normal" | "bueno">): string {
  const donde =
    vendido < l.flojo ? "menos que el diciembre flojo"
    : vendido <= l.normal ? "entre el flojo y el normal"
    : vendido <= l.bueno ? "entre el normal y el bueno"
    : "más que el diciembre bueno";
  return `Se vendieron ${vendido}: ${donde}.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 6. La hoja: una fila por categoría y los totales
// ---------------------------------------------------------------------------------------------------------------------

/** Cómo se escriben las cantidades, el dinero y las fechas en esta pantalla (una sola vez, no en cada componente). */
export const enteroES = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
export const solesES = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fechaLargaES = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });

export type FilaPlan = {
  c: CategoriaPlan;
  linea: LineaPlan | undefined;
  /** Lo que ya hay en la red (libre de apartados y sin Cuarentena). */
  stock: number;
  calculo: Calculo | null;
  /** Lo que se vendió dentro de las fechas de la campaña. */
  vendido: number;
};

/**
 * Una fila por categoría activa, con su cuenta hecha. Primero lo que ya tiene plan; después, lo que más stock tiene (lo que más
 * pesa para la campaña); a igual stock, por nombre. El orden es estable: dos lecturas iguales dan la misma tabla.
 */
export function armarFilas(plan: LecturaPlan): FilaPlan[] {
  return plan.categorias
    .map((c): FilaPlan => {
      const linea = plan.lineas.get(c.id);
      const stock = plan.stock.get(c.id) ?? 0;
      return { c, linea, stock, calculo: linea ? calcular(linea, stock) : null, vendido: plan.vendidoEnCampana.get(c.id) ?? 0 };
    })
    .sort((a, b) => Number(!!b.linea) - Number(!!a.linea) || b.stock - a.stock || a.c.nombre.localeCompare(b.c.nombre, "es"));
}

export type TotalesPlan = {
  /** Cuántas categorías ya tienen plan. */
  conPlan: number;
  /** Cuántas categorías hay en total. */
  total: number;
  /** Prendas a comprar, sumando solo las categorías con plan. */
  aComprar: number;
  /** Inversión al costo, sumando solo las categorías con plan. */
  inversion: number;
  /** Lo vendido en la campaña, de TODAS las categorías (con o sin plan). */
  vendido: number;
};

export function totalesDelPlan(filas: readonly FilaPlan[]): TotalesPlan {
  const con = filas.filter((f) => f.linea);
  return {
    conPlan: con.length,
    total: filas.length,
    aComprar: con.reduce((s, f) => s + (f.calculo?.comprar ?? 0), 0),
    inversion: con.reduce((s, f) => s + (f.calculo?.inversion ?? 0), 0),
    vendido: filas.reduce((s, f) => s + f.vendido, 0),
  };
}
