// Qué PRENDA va con la prenda que se mira (Felipe, 2026-10-10): «Combina bien con un polo o una blusa» y, al fijar el color, hasta
// tres prendas concretas que cuelgan en esta sede. Lógica pura, sin React ni red: Vender ya tiene en memoria todo lo que hace falta
// (las variantes con su piso cobrable, el código de color y el prefijo de la categoría) y las fichas de color (`colores.combina_con`).
//
// EL PROBLEMA. `combina_con` dice qué COLOR va con qué color, no qué prenda: con eso solo, a un polo beige le saldría otra blusa
// beige. Y las fichas se escribieron a mano con criterio de estilismo: 87 de 91 empiezan con Blanco, Crudo o Negro, y a 53 de los 95
// colores no los lista nadie (Marrón, el 5.º más vendido, tiene cero listas). Medido en producción el 2026-10-10: ordenar por la
// posición en la lista recomendaba Blanco en 6 de cada 10 tickets, y leer la ficha en un solo sentido dejaba media paleta muda.
//
// CONTRATO
//   PROMETE: una sugerencia solo pasa cuatro PUERTAS a la vez (hay para cobrar aquí · papel pareja · otra prenda · color aprobado
//     por la ficha, en directa, inversa o tono sobre tono con ficha) y se ORDENA por llaves, nunca por una suma de pesos inventados:
//     el papel que completa primero · el color que menos listas repiten (rareza, calculada de las fichas al cargar) · el motivo
//     (directa > inversa > mismo) · unidades cobrables · referencia. Hasta `max` tarjetas, UNA por papel en el orden de `PAREJAS` y sin
//     repetir color; si quedan menos, se muestran menos (nunca se rellena con otra del mismo papel). Sin azar: la misma entrada da la
//     misma salida. El «¿Por qué?» de cada una sale de la regla, no de un texto a mano (ADR-0290).
//   ASUME: el papel de cada categoría vive aquí, por PREFIJO (`categorias.prefijo`, nunca por el nombre visible, ADR-0290), como los
//     íconos (`ICONOS_POR_PREFIJO`) y las fichas del alta (`FICHAS_POR_CATEGORIA`). Una categoría creada desde pantalla nace sin papel:
//     muda (no sugiere ni se sugiere), nunca adivinada. Las 45 filas las revisó Felipe en el PR; cambiar una es un deploy.
//   NO HACE: co-compra (en 11 días solo 3 pares de categorías tienen 10 tickets), pesos por «cuánto hay» ni por foto (el piso cobrable
//     real es casi siempre 1 unidad y el 87 % tiene foto: no separan nada), ni «pedir a otra sede» (no es cobrable aquí).
import { ETIQUETA_COMBINA, type ColorConFicha } from "./ficha-del-color";

export type Papel = "superior" | "inferior" | "entero" | "abrigo" | "calzado" | "bolso" | "accesorio" | "bisuteria" | "intimo" | "ninguno";

/**
 * El papel de cada categoría en un look y cómo se la nombra en la frase («Combina bien con un polo o una blusa»). Por prefijo.
 * `ninguno`: no se combina (papelería, belleza) o no se sugiere en el mostrador (lencería).
 */
export const CATEGORIAS_LOOK: Readonly<Record<string, { papel: Papel; dicho: string }>> = {
  // ---- superior: lo que va arriba ----
  CMS: { papel: "superior", dicho: "una blusa" },
  POL: { papel: "superior", dicho: "un polo" },
  TOP: { papel: "superior", dicho: "un top" },
  CMP: { papel: "superior", dicho: "una chompa" },
  SUD: { papel: "superior", dicho: "una polera" },
  BOD: { papel: "superior", dicho: "un body" },
  COR: { papel: "superior", dicho: "un corset" },
  BLU: { papel: "superior", dicho: "una blusa" },
  // ---- inferior: lo que va abajo ----
  PAN: { papel: "inferior", dicho: "un pantalón" },
  JEA: { papel: "inferior", dicho: "un jean" },
  FAL: { papel: "inferior", dicho: "una falda" },
  SHO: { papel: "inferior", dicho: "un short" },
  // ---- entero: una sola prenda ----
  VES: { papel: "entero", dicho: "un vestido" },
  ENT: { papel: "entero", dicho: "un enterizo" },
  CON: { papel: "entero", dicho: "un conjunto" },
  TBA: { papel: "entero", dicho: "un traje de baño" },
  // ---- abrigo: la capa de encima ----
  CAS: { papel: "abrigo", dicho: "una casaca" },
  ABR: { papel: "abrigo", dicho: "un abrigo" },
  BLZ: { papel: "abrigo", dicho: "un blazer" },
  CHA: { papel: "abrigo", dicho: "un chaleco" },
  CAP: { papel: "abrigo", dicho: "una capa" },
  // ---- calzado ----
  BAI: { papel: "calzado", dicho: "unas bailarinas" },
  BOT: { papel: "calzado", dicho: "unas botas" },
  BOI: { papel: "calzado", dicho: "unos botines" },
  MSN: { papel: "calzado", dicho: "unos mocasines" },
  SAN: { papel: "calzado", dicho: "unas sandalias" },
  ZAP: { papel: "calzado", dicho: "unas zapatillas" },
  ZFO: { papel: "calzado", dicho: "unos zapatos" },
  // ---- bolso: lo que se lleva en la mano o al hombro (el complemento que más se vende junto a una prenda) ----
  CAR: { papel: "bolso", dicho: "una cartera" },
  MOC: { papel: "bolso", dicho: "una mochila" },
  RIN: { papel: "bolso", dicho: "una riñonera" },
  // ---- accesorio ----
  CIN: { papel: "accesorio", dicho: "un cinturón" },
  GOR: { papel: "accesorio", dicho: "un sombrero" },
  LSO: { papel: "accesorio", dicho: "unos lentes de sol" },
  BUF: { papel: "accesorio", dicho: "un pañuelo" },
  BUA: { papel: "accesorio", dicho: "una bufanda" },
  BFN: { papel: "accesorio", dicho: "una bufanda" },
  PAS: { papel: "accesorio", dicho: "una pashmina" },
  REL: { papel: "accesorio", dicho: "un reloj" },
  ACC: { papel: "accesorio", dicho: "un accesorio" },
  // ---- bisutería ----
  ANL: { papel: "bisuteria", dicho: "un anillo" },
  ARE: { papel: "bisuteria", dicho: "unos aretes" },
  COL: { papel: "bisuteria", dicho: "un collar" },
  PUL: { papel: "bisuteria", dicho: "una pulsera" },
  // ---- lo que no se sugiere ----
  LEN: { papel: "intimo", dicho: "ropa interior" },
  MAQ: { papel: "ninguno", dicho: "maquillaje" },
  UTC: { papel: "ninguno", dicho: "colores" },
  LAP: { papel: "ninguno", dicho: "lapiceros" },
  LIB: { papel: "ninguno", dicho: "libretas" },
  UOF: { papel: "ninguno", dicho: "útiles de oficina" },
};

/**
 * Qué papeles completan a cada papel, en orden de prioridad (la primera tarjeta es la del primer papel que tenga algo). Asimétrica a
 * propósito: a un polo le falta primero un pantalón; el bolso va segundo porque Bolsos + Blusas es el par más vendido junto (17 tickets
 * en 11 días, 2026-10-10); bolso y bisutería SÍ anclan (en AQP el bolso beige es el ancla más frecuente); íntimo y papelería, mudos.
 * Decidido por Felipe el 2026-10-10.
 */
export const PAREJAS: Readonly<Record<Papel, readonly Papel[]>> = {
  superior: ["inferior", "bolso", "abrigo", "bisuteria", "calzado"],
  inferior: ["superior", "bolso", "abrigo", "calzado"],
  entero: ["bolso", "abrigo", "bisuteria", "calzado"],
  abrigo: ["superior", "inferior", "entero"],
  calzado: ["inferior", "superior", "entero"],
  bolso: ["superior", "entero", "inferior"],
  accesorio: ["superior", "entero", "inferior"],
  bisuteria: ["superior", "entero"],
  intimo: [],
  ninguno: [],
};

/** Cómo se lee el papel en el «¿Por qué?»: qué hace la prenda sugerida por la que se mira. */
const QUE_HACE: Readonly<Record<Papel, string>> = {
  superior: "va arriba",
  inferior: "va abajo",
  entero: "es la prenda entera",
  abrigo: "lo abriga",
  calzado: "lo calza",
  bolso: "lo acompaña",
  accesorio: "lo acompaña",
  bisuteria: "lo remata",
  intimo: "",
  ninguno: "",
};

export function papelDe(prefijo: string | null | undefined): Papel {
  if (!prefijo) return "ninguno";
  return CATEGORIAS_LOOK[prefijo.trim().toUpperCase()]?.papel ?? "ninguno";
}

export function dichoDe(prefijo: string | null | undefined): string | null {
  if (!prefijo) return null;
  return CATEGORIAS_LOOK[prefijo.trim().toUpperCase()]?.dicho ?? null;
}

// ── Las fichas de color leídas en los dos sentidos ──────────────────────────────────────────────────────────────────────────────
export type IndiceColores = {
  /** Lo que cada color lista (`combina_con`, en su orden). */
  salida: ReadonlyMap<string, readonly string[]>;
  /** Quién lista a cada color: la traspuesta. */
  entrada: ReadonlyMap<string, ReadonlySet<string>>;
  /** En cuántas listas aparece cada color: la «rareza» (Blanco 79 de 91; un color que nadie lista, 0). */
  df: ReadonlyMap<string, number>;
  /** Colores con ficha (descripción o lista no vacía): solo con ficha vale el tono sobre tono. */
  conFicha: ReadonlySet<string>;
};

export function indiceDeColores(colores: readonly ColorConFicha[]): IndiceColores {
  const salida = new Map<string, readonly string[]>();
  const entrada = new Map<string, Set<string>>();
  const df = new Map<string, number>();
  const conFicha = new Set<string>();
  const activos = new Set(colores.map((c) => c.codigo));
  for (const c of colores) {
    const lista = (c.combinaCon ?? []).filter((k, i, arr) => k !== c.codigo && activos.has(k) && arr.indexOf(k) === i);
    salida.set(c.codigo, lista);
    if (lista.length > 0 || (c.descripcion ?? "").trim()) conFicha.add(c.codigo);
    for (const k of lista) {
      if (!entrada.has(k)) entrada.set(k, new Set());
      entrada.get(k)!.add(c.codigo);
      df.set(k, (df.get(k) ?? 0) + 1);
    }
  }
  return { salida, entrada, df, conFicha };
}

// ── La sugerencia ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Una prenda en un color, con lo que cuelga aquí: la unidad de la sugerencia (`agruparCatalogo` ya la arma en Vender). `origen`
 *  lleva, si la pantalla lo quiere, el grupo del que salió (sus casillas de talla se dibujan igual que en la lista). */
export type TarjetaLook<G = unknown> = {
  productoId: string;
  referencia: string;
  categoriaPrefijo: string | null;
  colorCodigo: string | null;
  colorNombre: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  /** Tallas con su piso cobrable; la tarjeta vale si alguna tiene ≥ 1. */
  tallas: readonly { varianteId: string; talla: string; stockAqui: number }[];
  origen?: G;
};

/** Lo que se mira: una prenda real (con `productoId`) o una «Prenda sin registrar» anotada con categoría y color (sin `productoId`). */
export type AnclaLook = {
  productoId: string | null;
  categoriaPrefijo: string | null;
  colorCodigo: string | null;
};

export type MotivoColor = "directa" | "inversa" | "mismo";

export type SugerenciaLook<G = unknown> = {
  tarjeta: TarjetaLook<G>;
  papel: Papel;
  motivo: MotivoColor;
  /** Unidades cobrables de la tarjeta (la suma de sus tallas con piso). */
  unidadesAqui: number;
  /** Tres líneas en lenguaje de tienda, derivadas de la regla: el color, el papel y el piso. */
  porQue: string[];
};

export type OpcionesLook = {
  /** Tope de tarjetas (una por papel). */
  max?: number;
  /** Productos que ya están en el ticket: no se vuelven a sugerir. */
  enTicket?: ReadonlySet<string>;
  /** Pares (prefijo, color) anotados como «Prenda sin registrar» en el ticket: la puerta por `productoId` no los ve. */
  anotadosEnTicket?: ReadonlySet<string>;
  /** El tono sobre tono (mismo color, con ficha) cuenta como aprobado. */
  permitirMismoColor?: boolean;
  /** Para el «¿Por qué?»: nombres de los colores por código y el nombre de la sede. */
  nombreDeColor?: (codigo: string) => string;
  sede?: string;
};

export const claveAnotada = (prefijo: string | null | undefined, color: string | null | undefined) => `${prefijo ?? ""}|${color ?? ""}`;

/** Lo mínimo de una variante del catálogo para armar una tarjeta prenda×color (la forma de `VarianteCatalogo`). */
export type VarianteParaTarjeta = {
  varianteId: string;
  productoId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  colorCodigo?: string | null;
  categoriaPrefijo?: string | null;
  fotoUrl: string | null;
  activo?: boolean;
};

/**
 * Una tarjeta por prenda×color desde el catálogo entero y el piso cobrable de la sede (`pisoDe`): lo que la vista rápida de Catálogo
 * necesita para la frase, donde no existe la grilla de Vender. Agrupa por `productoId` + código de color; una variante inactiva no
 * cuenta. Orden estable: por referencia y color.
 */
export function tarjetasDesdeVariantes(variantes: readonly VarianteParaTarjeta[], pisoDe: (varianteId: string) => number): TarjetaLook[] {
  const porClave = new Map<string, TarjetaLook & { tallas: { varianteId: string; talla: string; stockAqui: number }[] }>();
  for (const v of variantes) {
    if (v.activo === false) continue;
    const clave = `${v.productoId}|${v.colorCodigo ?? ""}`;
    let t = porClave.get(clave);
    if (!t) {
      t = {
        productoId: v.productoId,
        referencia: v.referencia,
        categoriaPrefijo: v.categoriaPrefijo ?? null,
        colorCodigo: v.colorCodigo ?? null,
        colorNombre: v.color,
        colorHex: v.colorHex,
        fotoUrl: v.fotoUrl,
        tallas: [],
      };
      porClave.set(clave, t);
    }
    if (!t.fotoUrl && v.fotoUrl) t.fotoUrl = v.fotoUrl;
    t.tallas.push({ varianteId: v.varianteId, talla: v.talla ?? "Única", stockAqui: Math.max(0, pisoDe(v.varianteId)) });
  }
  return [...porClave.values()].sort((a, b) => comparar(a.referencia, b.referencia) || comparar(a.colorNombre ?? "", b.colorNombre ?? ""));
}

const unidadesDe = (t: TarjetaLook) => t.tallas.reduce((a, x) => a + Math.max(0, x.stockAqui), 0);

/** Por qué el color pasa la puerta, o `null` si no pasa. */
export function motivoDeColor(colorAncla: string, colorTarjeta: string | null, indice: IndiceColores, permitirMismo: boolean): MotivoColor | null {
  if (!colorTarjeta) return null;
  if ((indice.salida.get(colorAncla) ?? []).includes(colorTarjeta)) return "directa";
  // Inversa: el color de la tarjeta lista al de la prenda («Marrón lleva Beige»): quienes listan al ancla incluyen a la tarjeta.
  if (indice.entrada.get(colorAncla)?.has(colorTarjeta)) return "inversa";
  if (permitirMismo && colorTarjeta === colorAncla && indice.conFicha.has(colorAncla)) return "mismo";
  return null;
}

const RANGO_MOTIVO: Record<MotivoColor, number> = { directa: 0, inversa: 1, mismo: 2 };
const comparar = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });

/**
 * Hasta `max` prendas que combinan con la que se mira y cuelgan aquí, una por papel en el orden de `PAREJAS` y sin repetir color.
 * Devuelve `[]` si la prenda no habla: sin papel, papel sin parejas, sin color con ficha, o nada en el piso que pase las puertas.
 */
export function sugerirCombina<G = unknown>(ancla: AnclaLook, tarjetas: readonly TarjetaLook<G>[], indice: IndiceColores, opciones: OpcionesLook = {}): SugerenciaLook<G>[] {
  const max = opciones.max ?? 3;
  const papelAncla = papelDe(ancla.categoriaPrefijo);
  const parejas = PAREJAS[papelAncla];
  const colorAncla = ancla.colorCodigo;
  if (parejas.length === 0 || !colorAncla || !indice.conFicha.has(colorAncla)) return [];
  const permitirMismo = opciones.permitirMismoColor ?? true;
  const enTicket = opciones.enTicket ?? new Set<string>();
  const anotados = opciones.anotadosEnTicket ?? new Set<string>();
  const nombreDe = opciones.nombreDeColor ?? ((c: string) => c);

  type Candidata = { tarjeta: TarjetaLook<G>; papel: Papel; motivo: MotivoColor; unidades: number; df: number };
  const candidatas: Candidata[] = [];
  for (const t of tarjetas) {
    const unidades = unidadesDe(t);
    if (unidades <= 0) continue; // G1: hay para cobrar aquí
    const papel = papelDe(t.categoriaPrefijo);
    if (!parejas.includes(papel)) continue; // G2: papel pareja (nunca el mismo papel ni «ninguno»)
    if (ancla.productoId && t.productoId === ancla.productoId) continue; // G3: otra prenda…
    if (enTicket.has(t.productoId)) continue; // …que no está ya en el ticket…
    if (anotados.has(claveAnotada(t.categoriaPrefijo, t.colorCodigo))) continue; // …ni anotada como sin registrar
    const motivo = motivoDeColor(colorAncla, t.colorCodigo, indice, permitirMismo); // G4: color aprobado por la ficha
    if (!motivo) continue;
    candidatas.push({ tarjeta: t, papel, motivo, unidades, df: indice.df.get(t.colorCodigo!) ?? 0 });
  }
  candidatas.sort(
    (a, b) =>
      parejas.indexOf(a.papel) - parejas.indexOf(b.papel) ||
      a.df - b.df ||
      RANGO_MOTIVO[a.motivo] - RANGO_MOTIVO[b.motivo] ||
      b.unidades - a.unidades ||
      comparar(a.tarjeta.referencia, b.tarjeta.referencia)
  );

  const elegidas: SugerenciaLook<G>[] = [];
  const coloresUsados = new Set<string>();
  for (const papel of parejas) {
    if (elegidas.length >= max) break;
    const c = candidatas.find((x) => x.papel === papel && !coloresUsados.has(x.tarjeta.colorCodigo!));
    if (!c) continue;
    coloresUsados.add(c.tarjeta.colorCodigo!);
    const dicho = dichoDe(ancla.categoriaPrefijo) ?? "la prenda";
    const colorLinea =
      c.motivo === "directa"
        ? `${nombreDe(colorAncla)} lista ${nombreDe(c.tarjeta.colorCodigo!)}`
        : c.motivo === "inversa"
          ? `${nombreDe(c.tarjeta.colorCodigo!)} lleva ${nombreDe(colorAncla)}`
          : "tono sobre tono";
    elegidas.push({
      tarjeta: c.tarjeta,
      papel: c.papel,
      motivo: c.motivo,
      unidadesAqui: c.unidades,
      porQue: [colorLinea, `${QUE_HACE[c.papel]} a ${dicho}`, `${c.unidades} ${opciones.sede ? `en ${opciones.sede}` : "aquí"}`],
    });
  }
  return elegidas;
}

/**
 * Las categorías pareja que tienen algo en el piso en un color aprobado, para la frase: hasta `max` (dos), una por papel en el orden
 * de `PAREJAS`, y dentro del papel la que más cuelga. Devuelve los «dichos» («un polo», «una blusa»).
 */
export function categoriasQueCombinan(ancla: AnclaLook, tarjetas: readonly TarjetaLook<unknown>[], indice: IndiceColores, opciones: OpcionesLook = {}): string[] {
  const max = opciones.max ?? 2;
  const papelAncla = papelDe(ancla.categoriaPrefijo);
  const parejas = PAREJAS[papelAncla];
  const colorAncla = ancla.colorCodigo;
  if (parejas.length === 0 || !colorAncla || !indice.conFicha.has(colorAncla)) return [];
  const permitirMismo = opciones.permitirMismoColor ?? true;
  const enTicket = opciones.enTicket ?? new Set<string>();
  const anotados = opciones.anotadosEnTicket ?? new Set<string>();
  const porPrefijo = new Map<string, { papel: Papel; unidades: number }>();
  for (const t of tarjetas) {
    const unidades = unidadesDe(t);
    if (unidades <= 0 || !t.categoriaPrefijo) continue;
    const papel = papelDe(t.categoriaPrefijo);
    if (!parejas.includes(papel)) continue;
    if (ancla.productoId && t.productoId === ancla.productoId) continue;
    // Las mismas puertas que las tarjetas: la frase no promete una blusa que ya está en el ticket.
    if (enTicket.has(t.productoId) || anotados.has(claveAnotada(t.categoriaPrefijo, t.colorCodigo))) continue;
    if (!motivoDeColor(colorAncla, t.colorCodigo, indice, permitirMismo)) continue;
    const previo = porPrefijo.get(t.categoriaPrefijo);
    porPrefijo.set(t.categoriaPrefijo, { papel, unidades: (previo?.unidades ?? 0) + unidades });
  }
  const salida: string[] = [];
  for (const papel of parejas) {
    if (salida.length >= max) break;
    const mejor = [...porPrefijo.entries()]
      .filter(([, v]) => v.papel === papel)
      .sort((a, b) => b[1].unidades - a[1].unidades || comparar(a[0], b[0]))[0];
    if (mejor) salida.push(dichoDe(mejor[0]) ?? mejor[0]);
  }
  return salida;
}

/** «Combina bien con un polo o una blusa»; `null` sin categorías. */
export function fraseCombina(dichos: readonly string[]): string | null {
  if (dichos.length === 0) return null;
  const lista = dichos.length === 1 ? dichos[0] : `${dichos.slice(0, -1).join(", ")} o ${dichos[dichos.length - 1]}`;
  return `${ETIQUETA_COMBINA} ${lista}`;
}
