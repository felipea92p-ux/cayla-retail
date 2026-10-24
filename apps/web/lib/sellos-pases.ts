// Catálogo ▸ Insignias como una billetera de pases (Felipe 2026-10-22: eligió la «II · Pases» de docs/maquetas/sellos-2026-10/).
// Los sellos dejan de ser una pestaña de Atributos y son su propia entrada de Catálogo; Campañas deja de ser una fila aparte y es la
// primera vista. Desde el 2026-10-23 se llaman «Insignias» en pantalla (el código sigue diciendo `sellos`: la clave no se renombra). Las cuatro vistas son los cuatro grupos de `lib/etiqueta-grupos.ts`: Campañas, Rotación, Artesanal y
// General. Todo sigue siendo la misma tabla `etiquetas`: esto solo decide en qué pila va cada pase y qué dice.
//
// PROMETE: a qué vista va cada fila (por su estilo), en qué pilas se ordenan (rigen hoy, lo que viene, guardadas, desactivadas),
//   qué dice la cabecera de cada pase (la cifra grande y su bajada), qué prendas lleva una insignia agrupadas por modelo y color (con
//   sus unidades si hay lectura) y qué tiene ya listo una campaña. Sin red: lógica pura, se prueba en `sellos-pases.test.ts`.
// ASUME: que el estilo ya pasó por `estiloConocido` y que las fechas son «AAAA-MM-DD» de Lima.
// NO HACE: no lee la base ni decide permisos (eso es de la página: `exigirModulo`, `veModulo`).

import type { EstiloEtiqueta } from "./etiqueta-grupos";
import { ordenarPorTemporada } from "./etiqueta-vigencia";
import { tramoDeCampana } from "./sellos-campanas";

export type VistaSellos = "campanas" | "rotacion" | "artesanal" | "general";

/** El orden de las pestañas: la primera (Campañas) es la que abre sin `?vista=`. */
export const VISTAS_SELLOS: readonly VistaSellos[] = ["campanas", "rotacion", "artesanal", "general"];

/** El estilo con que nace una fila creada desde cada vista: desde Rotación nace una insignia de Rotación, no una «General». */
export const ESTILO_DE_VISTA: Record<VistaSellos, EstiloEtiqueta> = {
  campanas: "campana",
  rotacion: "urgencia",
  artesanal: "positivo",
  general: "neutral",
};

export function vistaDeEstilo(estilo: EstiloEtiqueta): VistaSellos {
  return estilo === "campana" ? "campanas" : estilo === "urgencia" ? "rotacion" : estilo === "positivo" ? "artesanal" : "general";
}

export const TEXTOS_VISTA: Record<VistaSellos, { nombre: string }> = {
  campanas: { nombre: "Campañas" },
  rotacion: { nombre: "Rotación" },
  artesanal: { nombre: "Artesanal" },
  general: { nombre: "General" },
};

/** La vista que se abre: la pedida en `?vista=` si la cuenta la ve; si no, la primera que ve. `null` si no ve ninguna. */
export function vistaInicial(pedida: string | undefined, permitidas: readonly VistaSellos[]): VistaSellos | null {
  const v = permitidas.find((x) => x === pedida);
  return v ?? permitidas[0] ?? null;
}

// ---- Fechas (Lima, «AAAA-MM-DD»: se comparan como texto y se cuentan en días enteros) --------------------------------------

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El día como número absoluto (UTC, sin hora): restar dos da los días entre ellos sin que un cambio de hora mueva nada. */
const numeroDeDia = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10))) / 86_400_000;
export const diasEntre = (desde: string, hasta: string) => numeroDeDia(hasta) - numeroDeDia(desde);
const diaDeSemana = (f: string) => new Date(numeroDeDia(f) * 86_400_000).getUTCDay();

/** «domingo 25 de octubre» */
export function fechaLarga(f: string): string {
  return `${DIAS[diaDeSemana(f)]} ${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;
}
/** «25 oct» */
export function fechaCorta(f: string): string {
  return `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1]}`;
}
/** «15 sep – 31 oct», con el año solo si no es el de hoy. */
export function rangoCorto(desde: string | null, hasta: string | null, hoy: string): string | null {
  if (!desde && !hasta) return null;
  const anio = (f: string) => (f.slice(0, 4) === hoy.slice(0, 4) ? "" : ` ${f.slice(0, 4)}`);
  return `${desde ? fechaCorta(desde) + (hasta && desde.slice(0, 4) !== hasta.slice(0, 4) ? anio(desde) : "") : "…"} – ${hasta ? fechaCorta(hasta) + anio(hasta) : "…"}`;
}

// ---- Las pilas ------------------------------------------------------------------------------------------------------------

/** Lo mínimo de una fila de `etiquetas` que esto necesita. */
export type FilaSello = {
  id: string;
  nombre: string;
  activo: boolean;
  estado: "pendiente" | "aprobado" | "rechazado";
  estilo: EstiloEtiqueta;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  descuentoPct: number | null;
};

/** Cómo se pinta la cabecera del pase: tinta (rige hoy), pizarra (viene), hueso (guardada o desactivada) o el tono del grupo. */
export type TonoPase = "viva" | "viene" | "guardada" | "sello" | "apagada";

export type PilaDePases<T> = { clave: string; titulo: string; tono: TonoPase; pases: T[] };

const porNombre = <T extends FilaSello>(a: T, b: T) => a.nombre.localeCompare(b.nombre, "es");

/**
 * Las pilas de una vista, en el orden en que se leen. Campañas: lo que rige hoy (la que termina antes, arriba), lo que viene (la
 * más cercana primero), las guardadas (sin fechas, después las que ya pasaron en el orden del año) y las desactivadas. Una
 * insignia: las activas por nombre y las desactivadas. Una pila vacía no sale.
 */
export function pilasDeLaVista<T extends FilaSello>(filas: readonly T[], vista: VistaSellos, hoy: string): PilaDePases<T>[] {
  const deLaVista = filas.filter((f) => vistaDeEstilo(f.estilo) === vista);
  const activas = deLaVista.filter((f) => f.activo);
  const apagadas = deLaVista.filter((f) => !f.activo).sort(porNombre);
  let pilas: PilaDePases<T>[];
  if (vista === "campanas") {
    // El orden de siempre (`ordenarPorTemporada`): lo que termina antes, lo que empieza antes, lo que vuelve antes si se repite.
    const orden = ordenarPorTemporada(activas, hoy);
    const del = (t: ReturnType<typeof tramoDeCampana>) => orden.filter((f) => tramoDeCampana(f.vigenteDesde, f.vigenteHasta, hoy) === t);
    const [ahora, viene, sinFechas, pasaron] = [del("ahora"), del("proximas"), del("sin_fechas").sort(porNombre), del("pasaron")];
    pilas = [
      { clave: "ahora", titulo: "Rigen hoy", tono: "viva", pases: ahora },
      { clave: "viene", titulo: "Lo que viene", tono: "viene", pases: viene },
      { clave: "guardadas", titulo: "Guardadas", tono: "guardada", pases: [...sinFechas, ...pasaron] },
      { clave: "apagadas", titulo: "Desactivadas", tono: "apagada", pases: apagadas },
    ];
  } else {
    pilas = [
      { clave: "activos", titulo: TEXTOS_VISTA[vista].nombre, tono: "sello", pases: [...activas].sort(porNombre) },
      { clave: "apagadas", titulo: "Desactivadas", tono: "apagada", pases: apagadas },
    ];
  }
  return pilas.filter((p) => p.pases.length > 0);
}

/** El pase que se abre al entrar: el primero de la primera pila (en Campañas, la que rige hoy y termina antes). */
export function paseInicial<T extends FilaSello>(pilas: readonly PilaDePases<T>[]): T | null {
  return pilas[0]?.pases[0] ?? null;
}

// ---- La cabecera de un pase -----------------------------------------------------------------------------------------------

/** La cifra grande de la derecha y lo que dice debajo: «3 días», «18 faltan», «14 feb», «52 en 30 días». */
export function marcaDelPase(f: FilaSello, hoy: string, vendidas: number | null): { cifra: number | null; texto: string } {
  if (f.estilo === "campana" || f.vigenteDesde || f.vigenteHasta) {
    const t = tramoDeCampana(f.vigenteDesde, f.vigenteHasta, hoy);
    if (t === "ahora" && f.vigenteHasta) {
      const n = diasEntre(hoy, f.vigenteHasta);
      return n === 0 ? { cifra: null, texto: "último día" } : { cifra: n, texto: n === 1 ? "día" : "días" };
    }
    if (t === "proximas" && f.vigenteDesde) return { cifra: diasEntre(hoy, f.vigenteDesde), texto: "faltan" };
    if (t === "pasaron" && f.vigenteHasta) return { cifra: null, texto: fechaCorta(f.vigenteHasta) };
    if (f.estilo === "campana") return { cifra: null, texto: "sin fechas" };
  }
  return vendidas === null ? { cifra: null, texto: "" } : { cifra: vendidas, texto: "en 30 días" };
}

/** La línea bajo el nombre del pase. */
export function bajadaDelPase(f: FilaSello, hoy: string): string {
  const t = tramoDeCampana(f.vigenteDesde, f.vigenteHasta, hoy);
  if (t === "ahora" && f.vigenteHasta) return `hasta el ${fechaLarga(f.vigenteHasta)}${f.vigenteHasta.slice(0, 4) !== hoy.slice(0, 4) ? ` de ${f.vigenteHasta.slice(0, 4)}` : ""}`;
  if (t === "proximas" && f.vigenteDesde) return `empieza el ${fechaLarga(f.vigenteDesde)}`;
  if (t === "pasaron") return rangoCorto(f.vigenteDesde, f.vigenteHasta, hoy) ?? "";
  if (f.estilo === "campana") return "ponle cuándo rige";
  return f.descuentoPct !== null ? `${pct(f.descuentoPct)} de descuento` : "sin fechas: rige siempre";
}

/** 20 → «20 %», 12.5 → «12,5 %» (sin ceros de más). */
export const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;

/** Cuánto lleva una campaña que rige hoy: el día (1 = el primero) y de cuántos, y su avance de 0 a 100. `null` si no rige hoy. */
export function avanceDeCampana(desde: string | null, hasta: string | null, hoy: string): { dia: number; total: number; pct: number } | null {
  if (!desde || !hasta || hoy < desde || hoy > hasta) return null;
  const total = diasEntre(desde, hasta) + 1;
  const dia = diasEntre(desde, hoy) + 1;
  return { dia, total, pct: Math.round((dia / total) * 100) };
}

// ---- Las prendas de una insignia, agrupadas por modelo y color -----------------------------------------------------------------

/** Lo que la vitrina necesita de una talla (una variante a la venta). */
export type TallaVitrina = {
  id: string;
  categoriaId: string | null;
  productoId: string;
  referencia: string;
  colorCodigo: string | null;
  colorNombre: string | null;
  colorHex: string | null;
  categoria: { nombre: string | null; prefijo: string | null; familia: string | null } | null;
  fotoUrl: string | null;
};

/** Una prenda tal como la mira una tienda: un modelo en un color (con todas sus tallas). */
export type ModeloColor = {
  clave: string;
  productoId: string;
  referencia: string;
  colorNombre: string | null;
  colorHex: string | null;
  categoria: TallaVitrina["categoria"];
  fotoUrl: string | null;
  tallas: number;
  /** Lo libre en piso y almacén de todas las tiendas; `null` sin lectura. */
  unidades: number | null;
};

export type PrendasDelSello = {
  modelos: ModeloColor[];
  /** De esas, cuántas entran SOLO porque se marcaron a mano (ninguna de sus tallas entra por una categoría elegida). */
  aMano: number;
  /** `null` si no hay lectura de Rotación (quien mira no puede analizar, o una tienda no respondió). */
  unidades: number | null;
  vendidas: number | null;
};

/**
 * Las prendas a la venta que lleva una insignia —marcadas a mano o por su categoría: la regla de la base (`fn_campanas_por_variante`)—,
 * juntadas por modelo y color. Con lectura, cada una dice sus unidades y la insignia suma lo que queda y lo vendido en 30 días;
 * primero las que tienen más unidades. Sin lectura, por nombre.
 */
export function prendasDelSello(
  aLaVenta: readonly TallaVitrina[],
  categoriaIds: ReadonlySet<string>,
  manuales: ReadonlySet<string>,
  porTalla: ReadonlyMap<string, { stock: number; vendidas: number }> | null,
): PrendasDelSello {
  const grupos = new Map<string, ModeloColor>();
  const porCategoria = new Set<string>();
  let unidades = 0;
  let vendidas = 0;
  for (const t of aLaVenta) {
    if (!manuales.has(t.id) && !(t.categoriaId !== null && categoriaIds.has(t.categoriaId))) continue;
    const clave = `${t.productoId}·${t.colorCodigo ?? ""}`;
    if (t.categoriaId !== null && categoriaIds.has(t.categoriaId)) porCategoria.add(clave);
    const lectura = porTalla?.get(t.id) ?? { stock: 0, vendidas: 0 };
    const g = grupos.get(clave) ?? {
      clave,
      productoId: t.productoId,
      referencia: t.referencia,
      colorNombre: t.colorNombre,
      colorHex: t.colorHex,
      categoria: t.categoria,
      fotoUrl: t.fotoUrl,
      tallas: 0,
      unidades: porTalla ? 0 : null,
    };
    g.tallas++;
    if (g.unidades !== null) g.unidades += lectura.stock;
    if (!g.fotoUrl && t.fotoUrl) g.fotoUrl = t.fotoUrl;
    grupos.set(clave, g);
    unidades += lectura.stock;
    vendidas += lectura.vendidas;
  }
  const modelos = [...grupos.values()].sort(
    (a, b) => (b.unidades ?? 0) - (a.unidades ?? 0) || a.referencia.localeCompare(b.referencia, "es") || (a.colorNombre ?? "").localeCompare(b.colorNombre ?? "", "es"),
  );
  return {
    modelos,
    aMano: modelos.filter((m) => !porCategoria.has(m.clave)).length,
    unidades: porTalla ? unidades : null,
    vendidas: porTalla ? vendidas : null,
  };
}

/** Cuántas columnas pone una grilla `repeat(auto-fill, minmax(<minimo>, 1fr))` con `gap: <hueco>` en `ancho` px: la cuenta del navegador
 *  (cada columna mide al menos `minimo` y entre dos va un `hueco`). Nunca menos de una. */
export function columnasQueCaben(ancho: number, minimo: number, hueco: number): number {
  if (!(ancho > 0) || !(minimo > 0)) return 1;
  return Math.max(1, Math.floor((ancho + Math.max(0, hueco)) / (minimo + Math.max(0, hueco))));
}

/** Cuántas prendas caben en el lookbook (Felipe 2026-10-22: «que solo salgan 2 líneas y en la última de la derecha abajo salga el +28»):
 *  con `columnas` por fila y `filas` filas, si todas caben se ven todas; si sobran, se ven todas las casillas menos una y esa última
 *  (abajo a la derecha) dice cuántas faltan. Las columnas las decide el ancho (la grilla es `auto-fill`), así que el «+N» cambia con él. */
export function lookbookVisible(total: number, columnas: number, filas = 2): { visibles: number; resto: number } {
  const casillas = Math.max(1, Math.floor(columnas)) * Math.max(1, Math.floor(filas));
  if (total <= casillas) return { visibles: Math.max(0, total), resto: 0 };
  return { visibles: casillas - 1, resto: total - (casillas - 1) };
}

// ---- Lo que dice el pase abierto ------------------------------------------------------------------------------------------

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;
const enLista = (nombres: readonly string[]) => new Intl.ListFormat("es", { type: "conjunction" }).format(nombres);

/**
 * Cuántas prendas y de dónde vienen, dicho UNA vez. Las prendas de sus categorías ya están contadas en el número: antes decía «8 prendas
 * y toda Vestidos, Faldas», que se leía como una suma y eran las mismas (/formidable de la hoja de campaña, ADR-0488).
 */
function prendasYDeDonde(prendas: number, aMano: number, categorias: readonly string[], uno = "prenda", varios = "prendas"): string {
  const n = plural(prendas, uno, varios);
  if (!categorias.length) return n;
  const cats = enLista(categorias);
  if (prendas === 0) return `${cats}, todavía sin prendas a la venta`;
  const marcadas = `${aMano} ${aMano === 1 ? "marcada" : "marcadas"} a mano`;
  if (aMano === 0) return `${n} de ${cats}`;
  if (aMano >= prendas) return `${n} ${aMano === 1 ? "marcada" : "marcadas"} a mano; ${cats}, todavía sin prendas a la venta`;
  return `${n}: ${prendas - aMano} de ${cats} y ${marcadas}`;
}

export type ItemListo = { clave: "fechas" | "prendas" | "descuento" | "ofertas"; nombre: string; hecho: boolean; opcional: boolean; detalle: string };

/** Lo que ya tiene una campaña. Fechas y prendas son lo que la hace funcionar; el descuento es opcional (una campaña puede ser solo
 *  de vitrina). Sale de lo mismo que ya decide la pantalla («Sin prendas», «Sin preparar»): no agrega reglas. */
export function loQueTiene(f: FilaSello, prendas: number, categorias: readonly string[], hoy: string, aMano = 0, ofertas?: { total: number; borradores: number }): ItemListo[] {
  const llega = prendas > 0 || categorias.length > 0;
  const items: ItemListo[] = [
    { clave: "fechas", nombre: "Fechas", hecho: Boolean(f.vigenteDesde && f.vigenteHasta), opcional: false, detalle: rangoCorto(f.vigenteDesde, f.vigenteHasta, hoy) ?? "sin fechas" },
    {
      clave: "prendas",
      nombre: "Prendas",
      hecho: llega,
      opcional: false,
      detalle: llega ? prendasYDeDonde(prendas, aMano, categorias) : "ninguna todavía",
    },
    { clave: "descuento", nombre: "Descuento", hecho: f.descuentoPct !== null, opcional: true, detalle: f.descuentoPct !== null ? pct(f.descuentoPct) : "sin descuento" },
  ];
  // Las ofertas de la campaña («Tres preguntas», 2026-10-23): opcionales como el descuento; solo se dicen si la pantalla las conoce.
  if (ofertas) {
    items.push({
      clave: "ofertas",
      nombre: "Ofertas",
      hecho: ofertas.total > 0,
      opcional: true,
      detalle: ofertas.total > 0 ? `${plural(ofertas.total, "oferta", "ofertas")}${ofertas.borradores > 0 ? ` · ${plural(ofertas.borradores, "en borrador", "en borrador")}` : ""}` : "ninguna todavía",
    });
  }
  return items;
}
