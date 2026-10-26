// Finanzas ▸ Cuentas y dinero ▸ Qué debes, en «El telar» (Felipe 2026-10-23): cada factura es una burbuja del color de su sede y
// del tamaño de su saldo, sobre un calendario de los próximos 30 días; debajo, la lista con filtros que se ven puestos y se quitan.
// Lógica pura: la base (`fn_por_pagar_consolidado`) decide qué se debe y de quién; aquí solo se filtra y se ubica cada burbuja.

import { TEXTO_NATURALEZA, TRAMOS, tramoDe, diasHasta, type ClaveTramo, type FilaPorPagar, type NaturalezaDeuda } from "./por-pagar-consolidado-reglas";

/** Los días que dibuja el calendario, desde hoy. Lo vencido va en su columna a la izquierda; lo de después, a la derecha. */
export const DIAS_CALENDARIO = 30;

// ---- Los filtros (viven en la URL: ?tramo=, ?tipo=, ?q=) -----------------------------------------------------------------

export type FiltrosDeuda = { tramo: ClaveTramo | null; tipo: NaturalezaDeuda | null; q: string };

const CLAVES_TRAMO = new Set<string>(TRAMOS.map((t) => t.clave));
const NATURALEZAS = new Set<string>(Object.keys(TEXTO_NATURALEZA));

/** Lee los filtros de la URL; un valor que no existe se ignora (no deja la lista vacía por una dirección vieja o tipeada). */
export function leerFiltrosDeuda(sp: { get(k: string): string | null }): FiltrosDeuda {
  const tramo = sp.get("tramo");
  const tipo = sp.get("tipo");
  return {
    tramo: tramo && CLAVES_TRAMO.has(tramo) ? (tramo as ClaveTramo) : null,
    tipo: tipo && NATURALEZAS.has(tipo) ? (tipo as NaturalezaDeuda) : null,
    q: (sp.get("q") ?? "").trim(),
  };
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lo que pasa los filtros: el tramo de vencimiento, el tipo y lo buscado (proveedor, comprobante o concepto, sin tildes). */
export function filtrarDeudas<T extends Pick<FilaPorPagar, "vence" | "naturaleza" | "proveedor" | "documento" | "concepto">>(filas: readonly T[], f: FiltrosDeuda, hoy: string): T[] {
  const q = sinTildes(f.q);
  return filas.filter(
    (x) =>
      (!f.tramo || tramoDe(x, hoy) === f.tramo) &&
      (!f.tipo || x.naturaleza === f.tipo) &&
      (!q || sinTildes(`${x.proveedor} ${x.documento} ${x.concepto ?? ""}`).includes(q)),
  );
}

/** Los filtros puestos, en palabras, con la clave que se quita al tocarlos. */
export function filtrosPuestosDeuda(f: FiltrosDeuda): { clave: keyof FiltrosDeuda; texto: string }[] {
  const puestos: { clave: keyof FiltrosDeuda; texto: string }[] = [];
  if (f.tramo) puestos.push({ clave: "tramo", texto: `Vence: ${TRAMOS.find((t) => t.clave === f.tramo)!.etiqueta.toLowerCase()}` });
  if (f.tipo) puestos.push({ clave: "tipo", texto: `Tipo: ${TEXTO_NATURALEZA[f.tipo].toLowerCase()}` });
  if (f.q) puestos.push({ clave: "q", texto: `Busca: «${f.q}»` });
  return puestos;
}

// ---- Las burbujas -----------------------------------------------------------------------------------------------------

export type Burbuja = {
  id: string;
  /** La columna del calendario: −1 = vencidas, 0..30 = el día desde hoy, 31 = más adelante. */
  columna: number;
  /** El radio, en las unidades del dibujo: crece con la raíz del saldo (una factura del doble no se ve del doble de ancho). */
  r: number;
  /** Cuánto sube desde la línea del calendario el centro de la burbuja (se apilan las del mismo día). */
  alto: number;
};

export const RADIO_MIN = 8;
export const RADIO_MAX = 34;

/** El radio de una burbuja: de 8 a 34, con la raíz del saldo. */
export function radioBurbuja(saldo: number): number {
  return Math.round(Math.min(RADIO_MAX, Math.max(RADIO_MIN, RADIO_MIN + Math.sqrt(Math.max(0, saldo)) / 6)) * 10) / 10;
}

/** La columna de una factura en el calendario de `DIAS_CALENDARIO` días desde hoy. */
export function columnaBurbuja(vence: string, hoy: string): number {
  const d = diasHasta(vence, hoy);
  if (d < 0) return -1;
  return d > DIAS_CALENDARIO ? DIAS_CALENDARIO + 1 : d;
}

/**
 * Una burbuja por factura, apiladas por columna: primero las de mayor saldo (abajo, la grande; arriba, las chicas), con 4 de aire
 * entre una y otra. El dibujo pone la columna en x; aquí no se decide nada de píxeles más allá del radio y la pila.
 */
export function burbujasDeDeudas(filas: readonly Pick<FilaPorPagar, "id" | "vence" | "saldo">[], hoy: string): Burbuja[] {
  const orden = [...filas].sort((a, b) => b.saldo - a.saldo || a.id.localeCompare(b.id));
  const pila = new Map<number, number>();
  return orden.map((f) => {
    const columna = columnaBurbuja(f.vence, hoy);
    const r = radioBurbuja(f.saldo);
    const debajo = pila.get(columna) ?? 0;
    pila.set(columna, debajo + r * 2 + 4);
    return { id: f.id, columna, r, alto: debajo + r };
  });
}
