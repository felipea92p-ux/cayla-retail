// La lista de /clientas y lo que la ficha lee de sus compras (ADR-0288, «Actualización 2026-09-30 (f)»), sin React ni red:
// qué filtros hay y cómo viven en la URL, cómo se lee una fila de `fn_clientas_lista`, qué insignias lleva y qué dice el pie.
// Las reglas de verdad (su sede, frecuente con compra neta, qué entra en cada filtro) las calcula la base al leer
// (`fn_club_resumen_compras`); aquí solo se ponen en palabras.
//
// CONTRATO
//   PROMETE: `leerParamsLista` nunca devuelve un filtro que la base rechace ni una página < 1; `hrefLista` omite lo que es
//            el valor por defecto (la URL limpia es la lista entera); las insignias de una fila son las del spike del club
//            (`estadoClienta`/`chipPub` de docs/maquetas/club-clientas-spike-2026-09/fuente/src/45-club-caja.js).
//   ASUME:   las filas vienen de `fn_clientas_lista` y las cifras de `fn_cifras_clientas` (20260930210000).
//   NO HACE: no pide nada a la base ni lee el reloj (el «hoy» de Lima llega de afuera).

import { COMPRAS_PARA_FRECUENTE, type EstadoFrecuente } from "./clienta-actividad-reglas";
import { tipoDocumentoDe, type TipoDocumentoClienta } from "./documento-clienta-reglas";
import { diasEntreFechas } from "./fechas-lima";
import { nombreCortoSede } from "./stock-por-sede";
import type { TonoChip } from "@/components/ui/Chip";

/* ------------------------------------------------------------------
   Los filtros (las píldoras) y la URL
   ------------------------------------------------------------------ */

export type FiltroLista = "todas" | "socias" | "frecuentes" | "con_publicidad" | "sin_publicidad" | "sin_celular" | "cumplen_este_mes" | "archivadas";

/** En el orden del spike (`fichasHTML`), con «Archivadas» al final: es la única que mira fuera de las fichas activas. */
export const FILTROS_LISTA: readonly { valor: FiltroLista; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "socias", texto: "Socias" },
  { valor: "frecuentes", texto: "Frecuentes" },
  { valor: "con_publicidad", texto: "Con publicidad" },
  { valor: "sin_publicidad", texto: "Sin publicidad" },
  { valor: "sin_celular", texto: "Sin celular" },
  { valor: "cumplen_este_mes", texto: "Cumplen este mes" },
  { valor: "archivadas", texto: "Archivadas" },
];

/** Cuántas fichas trae cada página. */
export const POR_PAGINA = 50;
/** Lo que se busca, recortado: un nombre largo no le sirve a nadie y así la URL no crece sin fin. */
export const MAX_TERMINO = 80;

export type ParamsLista = { termino: string; filtro: FiltroLista; pagina: number };

const ES_FILTRO = new Set<string>(FILTROS_LISTA.map((f) => f.valor));

/** Lo que llega en la URL (`?q=&filtro=&pagina=`), ya saneado: un filtro desconocido es «todas» y una página rara, la 1. */
export function leerParamsLista(p: { q?: string | string[]; filtro?: string | string[]; pagina?: string | string[] }): ParamsLista {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filtro = uno(p.filtro);
  const pagina = Number.parseInt(uno(p.pagina), 10);
  return {
    termino: uno(p.q).trim().slice(0, MAX_TERMINO),
    filtro: ES_FILTRO.has(filtro) ? (filtro as FiltroLista) : "todas",
    pagina: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
  };
}

/** `/clientas` con lo que cambia. Sin lo que es por defecto (sin término, «todas», página 1): la URL limpia es la lista entera.
 *  Cambiar el término o el filtro vuelve a la página 1 (la página 3 de otra búsqueda no dice nada). */
export function hrefLista(actual: ParamsLista, cambios: Partial<ParamsLista>): string {
  const vuelveAlInicio = cambios.termino !== undefined || cambios.filtro !== undefined;
  const p = { ...actual, ...cambios, pagina: cambios.pagina ?? (vuelveAlInicio ? 1 : actual.pagina) };
  const q = new URLSearchParams();
  if (p.termino.trim()) q.set("q", p.termino.trim());
  if (p.filtro !== "todas") q.set("filtro", p.filtro);
  if (p.pagina > 1) q.set("pagina", String(p.pagina));
  const texto = q.toString();
  return texto ? `/clientas?${texto}` : "/clientas";
}

/** Desde qué fila pide la base la página (`p_desde`). */
export function desdeDePagina(pagina: number): number {
  return (Math.max(1, pagina) - 1) * POR_PAGINA;
}

/* ------------------------------------------------------------------
   Una fila de la lista
   ------------------------------------------------------------------ */

/** Lo que devuelve `fn_clientas_lista`, fila por fila. */
export type FilaListaClienta = {
  id: string;
  documento_tipo: string;
  documento_numero: string | null;
  nombre: string | null;
  telefono_whatsapp: string | null;
  club_desde: string | null;
  publicidad_desde: string | null;
  codigo_club: string | null;
  cumple_dia: number | null;
  cumple_mes: number | null;
  cumple_anio: number | null;
  created_at: string;
  archivada_en: string | null;
  anonimizada: boolean;
  fusionada_en_id: string | null;
  su_sede_id: string | null;
  su_sede: string | null;
  compras_sede: number;
  compras_12m: number;
  compras_6m: number;
  es_frecuente: boolean;
  ultima_compra: string | null;
  baja_en: string | null;
  total: number;
};

export type ClientaDeLista = {
  id: string;
  documentoTipo: TipoDocumentoClienta;
  documentoNumero: string | null;
  nombre: string | null;
  telefonoWhatsapp: string | null;
  clubDesde: string | null;
  publicidadDesde: string | null;
  codigoClub: string | null;
  archivadaEn: string | null;
  anonimizada: boolean;
  fusionadaEnId: string | null;
  /** CL-6: la tienda donde más compró en 12 meses (su nombre completo, «Tienda Trujillo»), o null si no compró. */
  suSede: string | null;
  comprasSede: number;
  compras12m: number;
  /** D-103 con compra neta (CL-25): 3 compras o más en 6 meses. */
  esFrecuente: boolean;
  ultimaCompra: string | null;
  /** Socia sin publicidad cuyo último paso de la publicidad fue su BAJA (el spike la pinta «Pidió BAJA»), o null. */
  bajaEn: string | null;
};

export function aClientaDeLista(f: FilaListaClienta): ClientaDeLista {
  return {
    id: f.id,
    documentoTipo: tipoDocumentoDe(f.documento_tipo),
    documentoNumero: f.documento_numero,
    nombre: f.nombre,
    telefonoWhatsapp: f.telefono_whatsapp,
    clubDesde: f.club_desde,
    publicidadDesde: f.publicidad_desde,
    codigoClub: f.codigo_club,
    archivadaEn: f.archivada_en,
    anonimizada: f.anonimizada,
    fusionadaEnId: f.fusionada_en_id,
    suSede: f.su_sede,
    comprasSede: f.compras_sede,
    compras12m: f.compras_12m,
    esFrecuente: f.es_frecuente,
    ultimaCompra: f.ultima_compra,
    bajaEn: f.baja_en,
  };
}

export type Insignia = { texto: string; tono: TonoChip };

/** La columna «Estado» (spike: `estadoClienta`): Identificada, Socia o Socia frecuente; una ficha fuera de la libreta dice por
 *  qué (archivada, anonimizada o unida). «Frecuente» sin ser socia no se pinta: es de las del club (CL-16), y el filtro
 *  «Frecuentes» igual la encuentra para invitarla. */
export function estadoDeLaFila(c: Pick<ClientaDeLista, "archivadaEn" | "anonimizada" | "fusionadaEnId" | "clubDesde" | "esFrecuente">): Insignia {
  if (c.archivadaEn) return { texto: c.anonimizada && !c.fusionadaEnId ? "Anonimizada" : c.fusionadaEnId ? "Unida a otra" : "Archivada", tono: "apagado" };
  if (!c.clubDesde) return { texto: "Identificada", tono: "pizarra" };
  return c.esFrecuente ? { texto: "Socia frecuente", tono: "verde" } : { texto: "Socia", tono: "neutro" };
}

/** La columna «Publicidad» (spike: `chipPub`): solo una socia activa tiene algo que decir; las demás, «—» (null). La que
 *  escribió BAJA dice «Pidió BAJA» (apagada): no es lo mismo que una que todavía no la pidió. */
export function publicidadDeLaFila(c: Pick<ClientaDeLista, "archivadaEn" | "clubDesde" | "publicidadDesde" | "bajaEn">): Insignia | null {
  if (c.archivadaEn || !c.clubDesde) return null;
  if (c.publicidadDesde) return { texto: "Publicidad", tono: "verde" };
  return c.bajaEn ? { texto: "Pidió BAJA", tono: "apagado" } : { texto: "Sin publicidad", tono: "neutro" };
}

/** «Trujillo» (sin «Tienda»), o «—» si no compró en 12 meses. */
export function suSedeLegible(suSede: string | null): string {
  return suSede ? nombreCortoSede(suSede) : "—";
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El día de un instante en Lima (`aaaa-mm-dd`): Lima va 5 h detrás de UTC todo el año. */
function diaLima(iso: string): string {
  return new Date(Date.parse(iso) - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** La columna «Última compra» (spike: «12 sep · hace 18 d»): la fecha corta y cuánto hace, contado en días de Lima. */
export function ultimaCompraLegible(iso: string | null, hoy: string): { fecha: string; hace: string } | null {
  if (!iso) return null;
  const dia = diaLima(iso);
  const [, m, d] = dia.split("-");
  const dias = diasEntreFechas(dia, hoy);
  return {
    fecha: `${Number(d)} ${MESES_CORTOS[Number(m) - 1]}`,
    hace: dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} d`,
  };
}

/* ------------------------------------------------------------------
   Las cifras, las cuentas de cada píldora y el pie
   ------------------------------------------------------------------ */

/** Lo que devuelve `fn_cifras_clientas`, ya en camelCase. */
export type CifrasClientas = {
  identificadas: number;
  socias: number;
  conPublicidad: number;
  sinPublicidad: number;
  frecuentes: number;
  sinCelular: number;
  cumplenEsteMes: number;
  archivadas: number;
};

export type FilaCifrasClientas = {
  identificadas: number;
  socias: number;
  con_publicidad: number;
  sin_publicidad: number;
  frecuentes: number;
  sin_celular: number;
  cumplen_este_mes: number;
  archivadas: number;
};

export function aCifrasClientas(f: FilaCifrasClientas): CifrasClientas {
  return {
    identificadas: f.identificadas,
    socias: f.socias,
    conPublicidad: f.con_publicidad,
    sinPublicidad: f.sin_publicidad,
    frecuentes: f.frecuentes,
    sinCelular: f.sin_celular,
    cumplenEsteMes: f.cumplen_este_mes,
    archivadas: f.archivadas,
  };
}

/** La cuenta que lleva cada píldora: la de TODA la base (como el spike), no la de la búsqueda. */
export function cuentaDelFiltro(c: CifrasClientas, filtro: FiltroLista): number {
  switch (filtro) {
    case "todas":
      return c.identificadas;
    case "socias":
      return c.socias;
    case "frecuentes":
      return c.frecuentes;
    case "con_publicidad":
      return c.conPublicidad;
    case "sin_publicidad":
      return c.sinPublicidad;
    case "sin_celular":
      return c.sinCelular;
    case "cumplen_este_mes":
      return c.cumplenEsteMes;
    case "archivadas":
      return c.archivadas;
  }
}

/** «40 % de las identificadas» (o «Todavía ninguna» si no hay fichas). */
export function detalleSocias(c: Pick<CifrasClientas, "identificadas" | "socias">): string {
  return c.identificadas > 0 ? `${Math.round((c.socias / c.identificadas) * 100)} % de las identificadas` : "Todavía ninguna";
}

/** «3 socias sin publicidad» / «1 socia sin publicidad». */
export function detallePublicidad(c: Pick<CifrasClientas, "sinPublicidad">): string {
  return `${c.sinPublicidad} socia${c.sinPublicidad === 1 ? "" : "s"} sin publicidad`;
}

/** «3 compras en 6 meses»: el umbral de `clienta-actividad-reglas.ts`, el mismo que usa la base. */
export function detalleFrecuentes(): string {
  return `${COMPRAS_PARA_FRECUENTE} compras en 6 meses`;
}

/** El pie de la tabla (spike: «N de N clientas · todas las cuentas con el módulo ven a todas»). `total` = cuántas pasan el
 *  filtro y la búsqueda; de cuántas: las fichas activas (o las archivadas, en ese filtro). */
export function pieLista(total: number, filtro: FiltroLista, c: CifrasClientas | null): string {
  const deCuantas = c ? (filtro === "archivadas" ? c.archivadas : c.identificadas) : null;
  const cuantas = deCuantas === null ? `${total} clienta${total === 1 ? "" : "s"}` : `${total} de ${deCuantas} ${filtro === "archivadas" ? "archivadas" : "clientas"}`;
  return `${cuantas} · todas las cuentas con el módulo ven a todas`;
}

/* ------------------------------------------------------------------
   La ficha: su sede y frecuente, con la misma regla que la lista
   ------------------------------------------------------------------ */

/** Lo que devuelve `fn_clienta_su_sede`. */
export type FilaResumenCompras = {
  su_sede_id: string | null;
  su_sede: string | null;
  compras_sede: number;
  compras_12m: number;
  compras_6m: number;
  es_frecuente: boolean;
  ultima_compra: string | null;
};

export type ResumenCompras = {
  suSede: string | null;
  comprasSede: number;
  compras12m: number;
  compras6m: number;
  esFrecuente: boolean;
  ultimaCompra: string | null;
};

export function aResumenCompras(f: FilaResumenCompras): ResumenCompras {
  return {
    suSede: f.su_sede,
    comprasSede: f.compras_sede,
    compras12m: f.compras_12m,
    compras6m: f.compras_6m,
    esFrecuente: f.es_frecuente,
    ultimaCompra: f.ultima_compra,
  };
}

/** El dato «Su sede» de la ficha (spike: «AQP · 2 de 2»): la sede y, aparte, cuántas de sus compras de 12 meses fueron ahí. */
export function suSedeDeLaFicha(r: ResumenCompras | null): { valor: string; detalle: string | null } {
  if (!r) return { valor: "—", detalle: null };
  if (!r.suSede) return { valor: "—", detalle: "sin compras en 12 meses" };
  return { valor: suSedeLegible(r.suSede), detalle: `${r.comprasSede} de ${r.compras12m}` };
}

/**
 * «Frecuente» en la ficha: con el resumen de la base (compra NETA, CL-25) dice lo mismo que la lista; si la base no lo trajo
 * (la migración de la tanda 1f sin pegar), vale el `respaldo` que la ficha ya calculaba sobre sus compras (`estadoFrecuente`),
 * para no quedarse sin el dato (principio 9).
 */
export function frecuenteDeLaFicha(r: ResumenCompras | null, respaldo: EstadoFrecuente): EstadoFrecuente {
  if (!r) return respaldo;
  return {
    esFrecuente: r.esFrecuente,
    faltanParaFrecuente: r.esFrecuente ? 0 : Math.max(0, COMPRAS_PARA_FRECUENTE - r.compras6m),
    comprasEnVentana: r.compras6m,
  };
}
