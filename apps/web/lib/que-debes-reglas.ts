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

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «7 nov»: el día que queda `n` días después de `hoy` (fechas de calendario de Lima, `YYYY-MM-DD`), para el eje del calendario. */
export function diaMas(hoy: string, n: number): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
}

// ---- Los carriles (Felipe 2026-10-31, maqueta docs/maquetas/finanzas-que-debes-rediseno-2026-10/) --------------------------------
// Una fila por sede (y una para lo de la empresa) sobre una línea de días: cada factura es un punto del tamaño de su saldo. Reemplaza las
// burbujas apiladas de «El telar», que se amontonaban con muchas facturas del mismo día. Aquí no se decide nada de píxeles: la columna y el radio.

export type PuntoCarril = { id: string; /** −1 = vencidas, 0..30 = el día desde hoy, 31 = más adelante. */ columna: number; r: number; vencida: boolean };
export type Carril = { /** El id de la unidad; `null` = de la empresa. */ clave: string | null; total: number; puntos: PuntoCarril[] };

export const RADIO_PUNTO_MIN = 6;
export const RADIO_PUNTO_MAX = 15;

/** El radio de un punto: de 6 a 15, con la raíz del saldo (el doble de plata no se ve del doble de ancho). */
export function radioPunto(saldo: number): number {
  return Math.round(Math.min(RADIO_PUNTO_MAX, Math.max(RADIO_PUNTO_MIN, 5 + Math.sqrt(Math.max(0, saldo)) / 12)));
}

/** La columna de una factura en el calendario de `DIAS_CALENDARIO` días desde hoy. */
export function columnaDeCarril(vence: string, hoy: string): number {
  const d = diasHasta(vence, hoy);
  if (d < 0) return -1;
  return d > DIAS_CALENDARIO ? DIAS_CALENDARIO + 1 : d;
}

/**
 * Un carril por unidad que tenga facturas, en el orden de `orden` (las tiendas y el Taller como los lista la barra común); la empresa
 * (`null`) va al final y una unidad que `orden` no conoce, antes de ella. Dentro de un carril, por fecha.
 */
export function carrilesDeDeudas(filas: readonly Pick<FilaPorPagar, "id" | "vence" | "saldo" | "ubicacionId">[], hoy: string, orden: readonly string[]): Carril[] {
  const claves = [...new Set(filas.map((f) => f.ubicacionId))];
  const peso = (c: string | null) => (c === null ? 1e6 : orden.includes(c) ? orden.indexOf(c) : 1e5);
  return claves
    .sort((a, b) => peso(a) - peso(b))
    .map((clave) => {
      const suyas = filas.filter((f) => f.ubicacionId === clave).sort((a, b) => a.vence.localeCompare(b.vence) || b.saldo - a.saldo);
      return {
        clave,
        total: Math.round(suyas.reduce((a, f) => a + f.saldo, 0) * 100) / 100,
        puntos: suyas.map((f) => ({ id: f.id, columna: columnaDeCarril(f.vence, hoy), r: radioPunto(f.saldo), vencida: diasHasta(f.vence, hoy) < 0 })),
      };
    });
}

// ---- «Pide tu atención»: lo vencido y lo que vence en 3 días ---------------------------------------------------------------

/** Desde cuántos días antes de vencer una factura pide atención (ámbar): hoy y los 3 días que siguen. */
export const DIAS_DE_AVISO = 3;

export type AvisoDeuda = { id: string; proveedor: string; documento: string; saldo: number; vence: string; dias: number; tono: "rojo" | "ambar" };

/** Las facturas vencidas (rojo) y las que vencen de hoy a `DIAS_DE_AVISO` días (ámbar), de la más urgente a la menos. */
export function atencionDeDeudas(filas: readonly Pick<FilaPorPagar, "id" | "proveedor" | "documento" | "saldo" | "vence">[], hoy: string): AvisoDeuda[] {
  return filas
    .map((f) => ({ id: f.id, proveedor: f.proveedor, documento: f.documento, saldo: f.saldo, vence: f.vence, dias: diasHasta(f.vence, hoy) }))
    .filter((f) => f.saldo > 0 && f.dias <= DIAS_DE_AVISO)
    .sort((a, b) => a.dias - b.dias || b.saldo - a.saldo)
    .map((f) => ({ ...f, tono: f.dias < 0 ? ("rojo" as const) : ("ambar" as const) }));
}

// ---- «A quién le debes más» ------------------------------------------------------------------------------------------------

export type ProveedorMayor = { proveedorId: string; proveedor: string; saldo: number; n: number; vencido: number };

/** Los proveedores a los que más se les debe (por el saldo de todas sus facturas), con cuánto de eso ya venció. */
export function proveedoresMayores(filas: readonly Pick<FilaPorPagar, "proveedorId" | "proveedor" | "saldo" | "vence">[], hoy: string, tope = 5): ProveedorMayor[] {
  const por = new Map<string, ProveedorMayor>();
  for (const f of filas) {
    const p = por.get(f.proveedorId) ?? { proveedorId: f.proveedorId, proveedor: f.proveedor, saldo: 0, n: 0, vencido: 0 };
    p.saldo += f.saldo;
    p.n += 1;
    if (diasHasta(f.vence, hoy) < 0) p.vencido += f.saldo;
    por.set(f.proveedorId, p);
  }
  return [...por.values()]
    .map((p) => ({ ...p, saldo: Math.round(p.saldo * 100) / 100, vencido: Math.round(p.vencido * 100) / 100 }))
    .sort((a, b) => b.saldo - a.saldo || a.proveedor.localeCompare(b.proveedor, "es"))
    .slice(0, tope);
}

// ---- La ventana «Todo lo que CAYLA debe»: orden y páginas ------------------------------------------------------------------

export type CampoOrdenDeuda = "vence" | "proveedor" | "tipo" | "sede" | "total" | "pagado" | "saldo";
export type OrdenDeuda = { campo: CampoOrdenDeuda; dir: "asc" | "desc" };
/** De entrada, lo que vence primero arriba (lo vencido, primero). */
export const ORDEN_DEUDA_INICIAL: OrdenDeuda = { campo: "vence", dir: "asc" };
export const TAMANOS_PAGINA = [30, 40] as const;
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number];

/** Ordena sin tocar la lista original; el desempate es siempre «vence primero» y después el mayor saldo, para que dos filas iguales no salten. */
export function ordenarDeudas<T extends Pick<FilaPorPagar, "vence" | "proveedor" | "naturaleza" | "total" | "pagado" | "saldo" | "unidades">>(filas: readonly T[], orden: OrdenDeuda): T[] {
  const signo = orden.dir === "asc" ? 1 : -1;
  const clave = (f: T): number | string => {
    switch (orden.campo) {
      case "proveedor":
        return f.proveedor;
      case "tipo":
        return TEXTO_NATURALEZA[f.naturaleza];
      case "sede":
        return f.unidades ?? "~empresa";
      case "total":
        return f.total;
      case "pagado":
        return f.pagado;
      case "saldo":
        return f.saldo;
      default:
        return f.vence;
    }
  };
  return [...filas].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y, "es") : Number(x) - Number(y);
    return c * signo || a.vence.localeCompare(b.vence) || b.saldo - a.saldo;
  });
}

/** Las de una unidad (`"empresa"` = las que no son de ninguna tienda); `"todas"` no filtra. */
export function filtrarPorUnidad<T extends Pick<FilaPorPagar, "ubicacionId">>(filas: readonly T[], unidad: string): T[] {
  return unidad === "todas" ? [...filas] : filas.filter((f) => (f.ubicacionId ?? "empresa") === unidad);
}

// ---- «En qué se va»: lo que se debe, por tipo de deuda ---------------------------------------------------------------------

export type PartePorTipo = { tipo: NaturalezaDeuda; monto: number; n: number; porcentaje: number };

/** Cuánto se debe de cada tipo (mercadería, gasto, activo, insumo), en ese orden y solo los que tienen facturas; los porcentajes redondeados suman 100. */
export function repartoPorTipo(filas: readonly Pick<FilaPorPagar, "naturaleza" | "saldo">[]): PartePorTipo[] {
  const orden = Object.keys(TEXTO_NATURALEZA) as NaturalezaDeuda[];
  const partes = orden.map((tipo) => {
    const suyas = filas.filter((f) => f.naturaleza === tipo);
    return { tipo, monto: Math.round(suyas.reduce((a, f) => a + f.saldo, 0) * 100) / 100, n: suyas.length };
  }).filter((p) => p.n > 0);
  const total = partes.reduce((a, p) => a + p.monto, 0);
  if (total <= 0) return partes.map((p) => ({ ...p, porcentaje: 0 }));
  // El porcentaje mayor absorbe el redondeo: así nunca se lee «99 %» ni «101 %» en la suma.
  const pct = partes.map((p) => Math.round((p.monto / total) * 100));
  const falta = 100 - pct.reduce((a, v) => a + v, 0);
  if (falta !== 0) pct[pct.indexOf(Math.max(...pct))] += falta;
  return partes.map((p, i) => ({ ...p, porcentaje: pct[i] }));
}
