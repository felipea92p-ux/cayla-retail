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
import { TIPOS_DOCUMENTO_CLIENTA, tipoDocumentoDe, type TipoDocumentoClienta } from "./documento-clienta-reglas";
import { diaLima, diasEntreFechas } from "./fechas-lima";
import { cumpleLegible } from "./club-clientas-reglas";
import type { Clienta } from "./clientas-reglas";
import { nombreCortoSede } from "./stock-por-sede";
import type { TonoChip } from "@/components/ui/Chip";

/* ------------------------------------------------------------------
   Los filtros (las píldoras) y la URL
   ------------------------------------------------------------------ */

export type FiltroLista = "todas" | "socias" | "frecuentes" | "con_publicidad" | "sin_publicidad" | "sin_celular" | "cumplen_este_mes" | "archivadas";

/** En el orden del spike (`fichasHTML`), con «Archivados» al final: es la única que mira fuera de las fichas activas. Los nombres
 *  hablan en palabras de tienda (Felipe 2026-10-20, diseño B de Fichas): «Compran seguido» y «Reciben novedades» en vez de
 *  «Frecuentes» y «Con publicidad». Lo que filtran no cambia. */
export const FILTROS_LISTA: readonly { valor: FiltroLista; texto: string }[] = [
  { valor: "todas", texto: "Todos" },
  { valor: "socias", texto: "Miembros" },
  { valor: "frecuentes", texto: "Compran seguido" },
  { valor: "con_publicidad", texto: "Reciben novedades" },
  { valor: "sin_publicidad", texto: "No reciben novedades" },
  { valor: "sin_celular", texto: "Sin celular" },
  { valor: "cumplen_este_mes", texto: "Cumplen este mes" },
  { valor: "archivadas", texto: "Archivados" },
];

/** @internal Lo lee su prueba (que los cuatro sean los de las cifras de la pantalla).
 *  Los cuatro filtros que son también las cifras de arriba (diseño B): tocar la cifra filtra la lista, así que no se repiten como
 *  píldora. Sin las cifras (la base no las dio), la pantalla vuelve a mostrarlos todos como píldora. */
export const FILTROS_DE_LAS_CIFRAS: readonly FiltroLista[] = ["todas", "socias", "con_publicidad", "frecuentes"];

/** Las píldoras «Para revisar»: lo que no es una cifra (ver `FILTROS_DE_LAS_CIFRAS`). */
export function filtrosParaRevisar(conCifras: boolean): readonly { valor: FiltroLista; texto: string }[] {
  return conCifras ? FILTROS_LISTA.filter((f) => !FILTROS_DE_LAS_CIFRAS.includes(f.valor)) : FILTROS_LISTA;
}

/** Cuántas fichas trae cada página. */
export const POR_PAGINA = 20;
/** La página más lejana que se acepta de la URL: `p_desde` de `fn_clientas_lista` es un `integer`, y una `?pagina=` de nueve
 *  cifras lo desbordaba (la lista decía «No se pudo leer» en vez de llevarte a la última página). */
export const MAX_PAGINA = 100_000;
/** Lo que se busca, recortado: un nombre largo no le sirve a nadie y así la URL no crece sin fin. */
export const MAX_TERMINO = 80;

export type ParamsLista = { termino: string; filtro: FiltroLista; pagina: number };

const ES_FILTRO = new Set<string>(FILTROS_LISTA.map((f) => f.valor));

/** Lo que llega en la URL (`?q=&filtro=&pagina=`), ya saneado: un filtro desconocido es «todas», una página rara, la 1 y una
 *  absurdamente lejana, `MAX_PAGINA` (de ahí `getListaClientas` la baja a la última que existe). */
export function leerParamsLista(p: { q?: string | string[]; filtro?: string | string[]; pagina?: string | string[] }): ParamsLista {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filtro = uno(p.filtro);
  const pagina = Number.parseInt(uno(p.pagina), 10);
  return {
    termino: uno(p.q).trim().slice(0, MAX_TERMINO),
    filtro: ES_FILTRO.has(filtro) ? (filtro as FiltroLista) : "todas",
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, MAX_PAGINA) : 1,
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

/** La última página que existe para `total` fichas (nunca menos de 1: una lista vacía tiene su página 1). */
export function ultimaPagina(total: number): number {
  return Math.max(1, Math.ceil(total / POR_PAGINA));
}

/** Lo mínimo de una lectura de la lista para saber si la página pedida existe. */
export type LecturaDeLista = { filas: readonly unknown[]; total: number; falla: string | null };

/**
 * Lee la página pedida y, si ya no existe (se archivaron fichas, o la URL quedó vieja), la última que sí. La base solo trae
 * el total junto a una fila, así que una página vacía no dice cuántas hay: se lee la 1 para saberlo. Sin esto la tabla
 * quedaba vacía con el aviso de «no hay clientes» estando llena. `leer` es la lectura real (inyectada para probarla sin base).
 */
export async function leerPaginaQueExiste<L extends LecturaDeLista>(pagina: number, leer: (pagina: number) => Promise<L>): Promise<L> {
  const lista = await leer(pagina);
  if (lista.falla || lista.filas.length > 0 || pagina === 1) return lista;
  const primera = await leer(1);
  const ultima = ultimaPagina(primera.total);
  if (primera.falla || ultima === 1) return primera;
  return leer(ultima);
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

/** El estado de la fila (spike: `estadoClienta`): «Solo ficha» (antes «Identificado»: tiene ficha y no se unió al club), Miembro o Miembro frecuente; una ficha fuera de la libreta dice
 *  por qué (archivado, anonimizado o unido a otra ficha). «Frecuente» sin ser socia no se pinta: es de las del club (CL-16), y el filtro
 *  «Frecuentes» igual la encuentra para invitarla. */
export function estadoDeLaFila(c: Pick<ClientaDeLista, "archivadaEn" | "anonimizada" | "fusionadaEnId" | "clubDesde" | "esFrecuente">): Insignia {
  if (c.archivadaEn) return { texto: c.anonimizada && !c.fusionadaEnId ? "Anonimizado" : c.fusionadaEnId ? "Unido a otra ficha" : "Archivado", tono: "apagado" };
  if (!c.clubDesde) return { texto: "Solo ficha", tono: "pizarra" };
  return c.esFrecuente ? { texto: "Miembro frecuente", tono: "verde" } : { texto: "Miembro", tono: "neutro" };
}

/** La columna «Publicidad» (spike: `chipPub`): solo una socia activa tiene algo que decir; las demás, «—» (null). La que
 *  escribió BAJA dice «Pidió BAJA» (apagada): no es lo mismo que una que todavía no la pidió. */
export function publicidadDeLaFila(c: Pick<ClientaDeLista, "archivadaEn" | "clubDesde" | "publicidadDesde" | "bajaEn">): Insignia | null {
  if (c.archivadaEn || !c.clubDesde) return null;
  if (c.publicidadDesde) return { texto: "Recibe novedades", tono: "verde" };
  return c.bajaEn ? { texto: "Pidió BAJA", tono: "apagado" } : { texto: "No recibe novedades", tono: "neutro" };
}

/** «Trujillo» (sin «Tienda»), o «—» si no compró en 12 meses. */
export function suSedeLegible(suSede: string | null): string {
  return suSede ? nombreCortoSede(suSede) : "—";
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** La columna «Última compra» (spike: «12 sep · hace 18 d»): la fecha corta y cuánto hace, contado en días de Lima (`diaLima`). */
export function ultimaCompraLegible(iso: string | null, hoy: string): { fecha: string; hace: string } | null {
  const dia = diaLima(iso);
  if (!dia) return null;
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

/** «Sus compras quedan ligadas a ellos»: la línea de «Clientes con ficha». */
export function detalleConFicha(): string {
  return "Sus compras quedan ligadas a ellos";
}

/** «40 de cada 100 clientes» (o «Todavía ninguno» si no hay fichas). */
export function detalleSocias(c: Pick<CifrasClientas, "identificadas" | "socias">): string {
  return c.identificadas > 0 ? `${Math.round((c.socias / c.identificadas) * 100)} de cada 100 clientes` : "Todavía ninguno";
}

/** «124 miembros no las pidieron» / «1 miembro no las pidió»: los miembros que no reciben novedades. */
export function detallePublicidad(c: Pick<CifrasClientas, "sinPublicidad">): string {
  return c.sinPublicidad === 1 ? "1 miembro no las pidió" : `${c.sinPublicidad} miembros no las pidieron`;
}

/** «3 compras o más en 6 meses»: el umbral de `clienta-actividad-reglas.ts`, el mismo que usa la base. */
export function detalleFrecuentes(): string {
  return `${COMPRAS_PARA_FRECUENTE} compras o más en 6 meses`;
}

/** La frase de una tarjeta de la lista (diseño B): lo que de verdad se lee de una persona, en una línea —«Miembro desde mar 2026 ·
 *  compra seguido · recibe novedades»—. Una ficha fuera de la libreta dice por qué (archivada, anonimizada o unida a otra). */
export function fraseDeLaFila(c: Pick<ClientaDeLista, "archivadaEn" | "anonimizada" | "fusionadaEnId" | "clubDesde" | "esFrecuente" | "publicidadDesde" | "bajaEn">): string {
  if (c.archivadaEn) {
    const por = c.anonimizada && !c.fusionadaEnId ? "Ficha anonimizada" : c.fusionadaEnId ? "Ficha unida a otra" : "Ficha archivada";
    return por;
  }
  if (!c.clubDesde) return "Solo tiene ficha, no está en el club";
  const desde = diaLima(c.clubDesde);
  const [anio, mes] = desde ? desde.split("-") : [];
  const partes = [desde ? `Miembro desde ${MESES_CORTOS[Number(mes) - 1]} ${anio}` : "Miembro del club"];
  if (c.esFrecuente) partes.push("compra seguido");
  const novedades = publicidadDeLaFila(c);
  if (novedades) partes.push(novedades.texto === "Pidió BAJA" ? "pidió BAJA" : novedades.texto.toLowerCase());
  return partes.join(" · ");
}

/** El pie de la tabla (spike: «N de N clientas · todas las cuentas con el módulo ven a todas»). `total` = cuántas pasan el
 *  filtro y la búsqueda; de cuántas: las fichas activas (o las archivadas, en ese filtro). */
export function pieLista(total: number, filtro: FiltroLista, c: CifrasClientas | null): string {
  const deCuantas = c ? (filtro === "archivadas" ? c.archivadas : c.identificadas) : null;
  const cuantas = deCuantas === null ? `${total} cliente${total === 1 ? "" : "s"}` : `${total} de ${deCuantas} ${filtro === "archivadas" ? "archivados" : "clientes"}`;
  return `${cuantas} · todas las cuentas con el módulo ven a todos`;
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

/* ------------------------------------------------------------------
   Exportar la lista (solo Admin, D-109/G.4): el CSV
   ------------------------------------------------------------------ */

export const COLUMNAS_EXPORTAR = ["Tipo de documento", "Número de documento", "Nombre", "Celular", "Miembro desde", "Código de miembro", "Novedades por WhatsApp", "Cumpleaños", "Registrado", "Estado"];

type ClientaParaExportar = Pick<
  Clienta,
  "documentoTipo" | "documentoNumero" | "nombre" | "telefonoWhatsapp" | "clubDesde" | "codigoClub" | "publicidadDesde" | "cumpleDia" | "cumpleMes" | "cumpleAnio" | "createdAt" | "archivadaEn" | "anonimizada" | "fusionadaEnId"
>;

/** Una fila del CSV, en el orden de `COLUMNAS_EXPORTAR`. «Miembro desde» y «Registrado» son el día de Lima de su instante
 *  (`club_desde` y `created_at`, que la base manda en UTC): con sus 10 primeros caracteres, quien entró de 7 pm a medianoche salía
 *  con el día siguiente. */
export function filaParaExportar(c: ClientaParaExportar): string[] {
  return [
    c.documentoNumero ? (TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === c.documentoTipo)?.etiqueta ?? "") : "",
    c.documentoNumero ?? "",
    c.nombre ?? "",
    c.telefonoWhatsapp ?? "",
    diaLima(c.clubDesde) ?? "",
    c.codigoClub ?? "",
    c.publicidadDesde ? "sí" : "no",
    c.cumpleDia && c.cumpleMes ? cumpleLegible(c.cumpleDia, c.cumpleMes, c.cumpleAnio) : "",
    diaLima(c.createdAt) ?? "",
    c.archivadaEn ? (c.anonimizada ? "anonimizado" : c.fusionadaEnId ? "unido a otra ficha" : "archivado") : "activo",
  ];
}
