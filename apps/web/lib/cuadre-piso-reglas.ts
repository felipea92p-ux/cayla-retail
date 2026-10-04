// «Cuadrar el piso» (ADR-0328, decisión técnica 4): la lógica pura de la pantalla `/inventario/cuadrar`. Sin React ni red,
// para poder probarla entera.
//
// EL PROBLEMA. El sistema cree que TRU tiene 138 prendas colgadas y 635 guardadas; en la tienda cuelgan 600–750 y hay más de 200
// guardadas. Se arregla UNA vez por sede: se escanea lo que de verdad está GUARDADO y lo que el sistema tiene en el almacén y nadie
// escaneó pasa al piso, de un solo movimiento (`cuadrar_piso`, 20261004200100).
//
// CONTRATO
//   PROMETE: armar y conservar la lista de lo escaneado (sin tope: en el cuadre se puede escanear de más, y eso es justo lo que
//            hay que ver); guardarla en el aparato por sede (sobrevive al cambio de cuenta: escanea Almacén, confirma un líder);
//            leer lo que devuelve la base y traducir sus rechazos a palabras de tienda; decir qué falta en cada paso.
//   ASUME:   la cuenta la hace la base (`fn_cuadre_piso_calculo`), una sola vez para revisar y para aplicar. `cuentaDeLaPrenda` es
//            su espejo SOLO para avisar «no cargada» mientras se escanea; una prueba exige que sea la misma fórmula que la
//            migración. Ninguna cifra que se muestra en «Revisar» o en el resultado sale de aquí: sale de la base.
//   NO HACE: no decide quién confirma (la base: solo un líder) ni mueve nada.

import { resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";
import { esRespuestaIncierta, type ErrorEscritura } from "./error-escritura";
import { diaYHoraLima } from "./fechas-lima";
import type { CampoDeGuia } from "./guia-campos";
import type { SonidoLectura } from "./sonido-lectura";

export const RPC_CUADRAR = "cuadrar_piso";
export const RPC_PREVISUALIZAR = "previsualizar_cuadre_piso";
export const RPC_ESTADO = "fn_cuadre_piso_estado";
export const VERSION_BORRADOR_CUADRE = 1;
/** Lo escaneado vive en este aparato hasta 12 horas: un cuadre se termina en el día (la pantalla lo dice). */
export const HORAS_DE_VIDA_DEL_BORRADOR_CUADRE = 12;
/** La hora del escaneo se pide un minuto antes de la primera lectura: cubre la demora entre el servidor y el aparato. Un
 *  margen de más solo hace que la base mire un minuto más de movimientos; uno de menos la dejaría ciega a ellos. */
export const MARGEN_ESCANEO_MS = 60_000;
export const POR_PAGINA_CUADRE = 20;
export const NOTA_MAXIMA_CUADRE = 300;
export const BOTON_COMPROBAR_CUADRE = "Comprobar si se guardó";

export type PrendaCuadre = PrendaBuscableV2 & { fotoUrl: string | null; activo: boolean };
export type LineaCuadre = { varianteId: string; cantidad: number };
/** Lo LIBRE de una prenda en la sede (lo apartado no cuenta: el cuadre no lo mueve). */
export type StockLibre = { almacen: number; piso: number };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const esEntero = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const numero = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------------------------------------------------
// 1. La cuenta (ESPEJO de fn_cuadre_piso_calculo: solo para el aviso «no cargada» mientras se escanea)
// ---------------------------------------------------------------------------------------------------------------------

/** A = almacén libre, P = piso libre, S = escaneado como guardado. Cada prenda va en UNA dirección. */
export function cuentaDeLaPrenda(almacen: number, piso: number, escaneadas: number): { alPiso: number; alAlmacen: number; noCargadas: number } {
  const a = Math.max(0, almacen);
  const p = Math.max(0, piso);
  const s = Math.max(0, escaneadas);
  return { alPiso: Math.max(0, a - s), alAlmacen: Math.min(Math.max(0, s - a), p), noCargadas: Math.max(0, s - a - p) };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Lo escaneado
// ---------------------------------------------------------------------------------------------------------------------

export type LecturaCuadre =
  | { tipo: "suma"; prenda: PrendaCuadre; nueva: boolean }
  | { tipo: "desconocido"; codigo: string }
  | { tipo: "archivada"; prenda: PrendaCuadre };

/**
 * Una lectura de la pistola o la cámara, contra el CATÁLOGO ENTERO (no solo lo que la sede tiene: una prenda guardada que el
 * sistema no tiene en la sede es justo una «no cargada»). Sin tope: escanear de más se ve en «Revisar», no se esconde aquí.
 * Una talla archivada no entra: el cuadre no la mueve, así que contarla confundiría.
 */
export function leerCodigoCuadre(texto: string, catalogo: readonly PrendaCuadre[], lineas: readonly LineaCuadre[]): LecturaCuadre {
  const codigo = texto.trim();
  const prenda = resolverCodigoV2(codigo, catalogo as PrendaCuadre[]);
  if (!prenda) return { tipo: "desconocido", codigo };
  if (!prenda.activo) return { tipo: "archivada", prenda };
  return { tipo: "suma", prenda, nueva: !lineas.some((l) => l.varianteId === prenda.varianteId) };
}

/** Con la pistola se mira el estante, no la pantalla: agudo = sumó, grave y largo = mira la pantalla (no sumó). */
export function sonidoDeLecturaCuadre(l: LecturaCuadre): SonidoLectura {
  if (l.tipo !== "suma") return "desconocida";
  return l.nueva ? "nueva" : "suma";
}

/** Suma 1 y la sube al principio: la última leída siempre arriba (y «Deshacer la última» le resta a esa). */
export function sumarLecturaCuadre(lineas: readonly LineaCuadre[], varianteId: string): LineaCuadre[] {
  const previa = lineas.find((l) => l.varianteId === varianteId);
  return [{ varianteId, cantidad: (previa?.cantidad ?? 0) + 1 }, ...lineas.filter((l) => l.varianteId !== varianteId)];
}

/** «Deshacer la última»: −1 a la de arriba (la última leída); en 0, sale de la lista. */
export function deshacerUltima(lineas: readonly LineaCuadre[]): { lineas: LineaCuadre[]; varianteId: string | null } {
  const [arriba, ...resto] = lineas;
  if (!arriba) return { lineas: [], varianteId: null };
  return { lineas: arriba.cantidad > 1 ? [{ ...arriba, cantidad: arriba.cantidad - 1 }, ...resto] : resto, varianteId: arriba.varianteId };
}

/** El número escrito a mano: sin tope de arriba (hasta 99999, lo que acepta la base); 0 o menos la quita. */
export function fijarCantidadCuadre(lineas: readonly LineaCuadre[], varianteId: string, cantidad: number): LineaCuadre[] {
  const n = Math.min(99999, Math.floor(Number.isFinite(cantidad) ? cantidad : 0));
  if (n <= 0) return quitarLineaCuadre(lineas, varianteId);
  return lineas.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: n } : l));
}

export function quitarLineaCuadre(lineas: readonly LineaCuadre[], varianteId: string): LineaCuadre[] {
  return lineas.filter((l) => l.varianteId !== varianteId);
}

/** «Deshacer» un «Quitar»: la línea vuelve a su lugar (o al final, si la lista se achicó), y si ya estaba, no se duplica. */
export function reponerLinea(lineas: readonly LineaCuadre[], linea: LineaCuadre, indice: number): LineaCuadre[] {
  if (lineas.some((l) => l.varianteId === linea.varianteId)) return [...lineas];
  const i = Math.max(0, Math.min(indice, lineas.length));
  return [...lineas.slice(0, i), linea, ...lineas.slice(i)];
}

export function totalEscaneado(lineas: readonly LineaCuadre[]): number {
  return lineas.reduce((s, l) => s + l.cantidad, 0);
}

/** Lo que viaja a la base: sin ceros, las repetidas sumadas y en orden de prenda (la huella no depende del orden del escaneo). */
export function aGuardado(lineas: readonly LineaCuadre[]): { variante_id: string; cantidad: number }[] {
  const suma = new Map<string, number>();
  for (const l of lineas) if (l.cantidad > 0) suma.set(l.varianteId, (suma.get(l.varianteId) ?? 0) + l.cantidad);
  return [...suma.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([variante_id, cantidad]) => ({ variante_id, cantidad }));
}

/** Cuántas de lo escaneado de una prenda el sistema NO tiene en la sede (piso + almacén libres): el aviso «no cargada». */
export function noCargadasAlEscanear(stock: StockLibre | undefined, escaneadas: number): number {
  return cuentaDeLaPrenda(stock?.almacen ?? 0, stock?.piso ?? 0, escaneadas).noCargadas;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Volver a escanear lo que cambió (la base rechazó: el almacén se movió mientras se escaneaba)
// ---------------------------------------------------------------------------------------------------------------------

/** Las prendas que cambiaron salen de la lista (lo escaneado de ellas ya no se puede comparar) y quedan «por volver a escanear». */
export function pedirReescaneo(lineas: readonly LineaCuadre[], pendientes: readonly string[], ids: readonly string[]): { lineas: LineaCuadre[]; pendientes: string[] } {
  const cambian = new Set(ids);
  return { lineas: lineas.filter((l) => !cambian.has(l.varianteId)), pendientes: [...new Set([...pendientes, ...ids])] };
}

/** Escanear esa prenda (o decir «no hay ninguna guardada») la saca de las pendientes. */
export function resolverPendiente(pendientes: readonly string[], varianteId: string): string[] {
  return pendientes.filter((id) => id !== varianteId);
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. La hora del escaneo (la del SERVIDOR: la base compara contra su libro)
// ---------------------------------------------------------------------------------------------------------------------

/** Cuánto va adelantado (o atrasado) el servidor respecto de este aparato, medido al cargar la pantalla. */
export function desfaseConServidor(servidorIso: string, localMs: number): number {
  const s = Date.parse(servidorIso);
  return Number.isNaN(s) ? 0 : s - localMs;
}

/** La hora desde la que vale lo escaneado: ahora, en el reloj del servidor, con un minuto de margen hacia atrás. */
export function escaneoDesdeAhora(localMs: number, desfaseMs: number): string {
  return new Date(localMs + desfaseMs - MARGEN_ESCANEO_MS).toISOString();
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. El borrador (por SEDE, no por cuenta: escanea la cuenta Almacén y confirma un líder en el mismo navegador)
// ---------------------------------------------------------------------------------------------------------------------

export type BorradorCuadre = {
  v: typeof VERSION_BORRADOR_CUADRE;
  token: string;
  /** null hasta la primera lectura (o el «no hay nada guardado»). */
  escaneoDesde: string | null;
  lineas: LineaCuadre[];
  pendientes: string[];
  confirmoVacio: boolean;
  nota: string;
  creadoEn: string;
  /** Se envió y no se supo la respuesta: al volver, solo se puede comprobar con la MISMA marca. */
  enviadoEn?: string;
};

export function claveBorradorCuadre(ubicacionId: string): string {
  return `cayla:cuadre:${ubicacionId}:borrador`;
}

export function serializarBorradorCuadre(b: BorradorCuadre): string {
  return JSON.stringify(b);
}

const esIso = (x: unknown): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x));

/** El borrador guardado, o null si no hay, está roto o venció (12 h desde que empezó). NO filtra por catálogo: una prenda que
 *  hoy no está en la lista de la sede sigue siendo lo que se escaneó (una «no cargada» no se pierde en silencio). */
export function leerBorradorCuadre(texto: string | null, ahora: Date): BorradorCuadre | null {
  if (!texto) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObjeto(crudo) || crudo.v !== VERSION_BORRADOR_CUADRE || typeof crudo.token !== "string" || !ES_UUID.test(crudo.token)) return null;
  if (!esIso(crudo.creadoEn) || ahora.getTime() - Date.parse(crudo.creadoEn) > HORAS_DE_VIDA_DEL_BORRADOR_CUADRE * 3600_000) return null;
  if (crudo.escaneoDesde !== null && !esIso(crudo.escaneoDesde)) return null;
  if (crudo.enviadoEn !== undefined && !esIso(crudo.enviadoEn)) return null;
  if (!Array.isArray(crudo.lineas) || !Array.isArray(crudo.pendientes)) return null;
  const lineas: LineaCuadre[] = [];
  for (const l of crudo.lineas as unknown[]) {
    if (!esObjeto(l) || typeof l.varianteId !== "string" || !ES_UUID.test(l.varianteId) || !esEntero(l.cantidad) || l.cantidad < 1 || l.cantidad > 99999) return null;
    lineas.push({ varianteId: l.varianteId, cantidad: l.cantidad });
  }
  const pendientes = (crudo.pendientes as unknown[]).filter((p): p is string => typeof p === "string" && ES_UUID.test(p));
  return {
    v: VERSION_BORRADOR_CUADRE,
    token: crudo.token,
    escaneoDesde: (crudo.escaneoDesde as string | null) ?? null,
    lineas,
    pendientes,
    confirmoVacio: crudo.confirmoVacio === true,
    nota: typeof crudo.nota === "string" ? crudo.nota.slice(0, NOTA_MAXIMA_CUADRE) : "",
    creadoEn: crudo.creadoEn,
    ...(crudo.enviadoEn ? { enviadoEn: crudo.enviadoEn as string } : {}),
  };
}

/** La tarjeta «Continuar / Empezar de nuevo». */
export function textoDeBorradorCuadre(b: BorradorCuadre): string {
  const { dia, hora } = diaYHoraLima(b.creadoEn);
  const n = totalEscaneado(b.lineas);
  const cuanto = n > 0 ? `con ${plural(n, "prenda escaneada", "prendas escaneadas")}` : "sin prendas escaneadas todavía";
  return `Tienes un cuadre a medias en este equipo, empezado el ${dia} a las ${hora}, ${cuanto}.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 6. Lo que devuelve la base
// ---------------------------------------------------------------------------------------------------------------------

export type ResumenCuadre = {
  lineasAlPiso: number;
  prendasAlPiso: number;
  lineasAlAlmacen: number;
  prendasAlAlmacen: number;
  lineasNoCargadas: number;
  prendasNoCargadas: number;
  prendasEscaneadas: number;
  antes: { piso: number; almacen: number };
  despues: { piso: number; almacen: number };
  total: number;
  apartadas: number;
  archivadas: { lineas: number; almacen: number; piso: number };
  escaneadasFuera: number;
  danadas: number;
};

export type MotivoLinea = "cuadra" | "archivada" | "no_es_inventario";

export type LineaVista = {
  varianteId: string;
  prenda: string;
  motivo: MotivoLinea;
  almacen: number;
  piso: number;
  apartadas: number;
  escaneadas: number;
  alPiso: number;
  alAlmacen: number;
  noCargadas: number;
};

export type NoCargada = { varianteId: string; prenda: string; escaneadas: number; almacen: number; piso: number; noCargadas: number };

export type RespuestaCuadre = ResumenCuadre & {
  cuadreId: string;
  cuadradoEn: string;
  por: string;
  nota: string | null;
  noCargado: NoCargada[];
  yaRegistrado: boolean;
};

export type VistaCuadre = { resumen: ResumenCuadre; lineas: LineaVista[]; ultimoCuadre: RespuestaCuadre | null; revisadoEn: string | null };

export type EstadoCuadre = { cuadradoEn: string | null; por: string | null; prendasAlPiso: number; prendasAlAlmacen: number; cuadres: number };

function leerResumen(x: Record<string, unknown>): ResumenCuadre | null {
  const antes = esObjeto(x.antes) ? x.antes : null;
  const despues = esObjeto(x.despues) ? x.despues : null;
  const arch = esObjeto(x.archivadas) ? x.archivadas : null;
  if (!antes || !despues || !arch || !("prendas_al_piso" in x) || !("total" in x)) return null;
  return {
    lineasAlPiso: numero(x.lineas_al_piso),
    prendasAlPiso: numero(x.prendas_al_piso),
    lineasAlAlmacen: numero(x.lineas_al_almacen),
    prendasAlAlmacen: numero(x.prendas_al_almacen),
    lineasNoCargadas: numero(x.lineas_no_cargadas),
    prendasNoCargadas: numero(x.prendas_no_cargadas),
    prendasEscaneadas: numero(x.prendas_escaneadas),
    antes: { piso: numero(antes.piso), almacen: numero(antes.almacen) },
    despues: { piso: numero(despues.piso), almacen: numero(despues.almacen) },
    total: numero(x.total),
    apartadas: numero(x.apartadas),
    archivadas: { lineas: numero(arch.lineas), almacen: numero(arch.almacen), piso: numero(arch.piso) },
    escaneadasFuera: numero(x.escaneadas_fuera),
    danadas: numero(x.danadas),
  };
}

const MOTIVOS: readonly MotivoLinea[] = ["cuadra", "archivada", "no_es_inventario"];

function leerLinea(x: unknown): LineaVista | null {
  if (!esObjeto(x) || typeof x.variante_id !== "string" || !MOTIVOS.includes(x.motivo as MotivoLinea)) return null;
  return {
    varianteId: x.variante_id,
    prenda: typeof x.prenda === "string" ? x.prenda : "Una prenda",
    motivo: x.motivo as MotivoLinea,
    almacen: numero(x.almacen),
    piso: numero(x.piso),
    apartadas: numero(x.apartadas),
    escaneadas: numero(x.escaneadas),
    alPiso: numero(x.al_piso),
    alAlmacen: numero(x.al_almacen),
    noCargadas: numero(x.no_cargadas),
  };
}

/** La respuesta de `cuadrar_piso` (o la del cuadre que ya estaba, en el detalle de «ya se cuadró»). null si no calza. */
export function leerRespuestaCuadre(v: unknown): RespuestaCuadre | null {
  if (!esObjeto(v) || typeof v.cuadre_id !== "string" || !esIso(v.cuadrado_en)) return null;
  const resumen = leerResumen(v);
  if (!resumen) return null;
  const noCargado: NoCargada[] = Array.isArray(v.no_cargado)
    ? (v.no_cargado as unknown[]).filter(esObjeto).map((n) => ({
        varianteId: String(n.variante_id ?? ""),
        prenda: typeof n.prenda === "string" ? n.prenda : "Una prenda",
        escaneadas: numero(n.escaneadas),
        almacen: numero(n.almacen),
        piso: numero(n.piso),
        noCargadas: numero(n.no_cargadas),
      }))
    : [];
  return {
    ...resumen,
    cuadreId: v.cuadre_id,
    cuadradoEn: v.cuadrado_en,
    por: typeof v.por === "string" ? v.por : "",
    nota: typeof v.nota === "string" ? v.nota : null,
    noCargado,
    yaRegistrado: v.ya_registrado === true,
  };
}

/** La respuesta de `previsualizar_cuadre_piso`. null si no calza con el contrato. */
export function leerVistaCuadre(v: unknown): VistaCuadre | null {
  if (!esObjeto(v) || !esObjeto(v.resumen) || !Array.isArray(v.lineas)) return null;
  const resumen = leerResumen(v.resumen);
  if (!resumen) return null;
  const lineas: LineaVista[] = [];
  for (const l of v.lineas as unknown[]) {
    const linea = leerLinea(l);
    if (!linea) return null;
    lineas.push(linea);
  }
  return {
    resumen,
    lineas,
    ultimoCuadre: v.ultimo_cuadre ? leerRespuestaCuadre(v.ultimo_cuadre) : null,
    revisadoEn: esIso(v.revisado_en) ? v.revisado_en : null,
  };
}

/** La respuesta de `fn_cuadre_piso_estado`. null si no calza. */
export function leerEstadoCuadre(v: unknown): EstadoCuadre | null {
  if (!esObjeto(v) || !("cuadres" in v)) return null;
  return {
    cuadradoEn: esIso(v.cuadrado_en) ? v.cuadrado_en : null,
    por: typeof v.por === "string" ? v.por : null,
    prendasAlPiso: numero(v.prendas_al_piso),
    prendasAlAlmacen: numero(v.prendas_al_almacen),
    cuadres: numero(v.cuadres),
  };
}

/** Las listas de «Revisar», en el orden en que se leen: lo que baja, lo que sube, lo que no se carga y lo que no se toca. */
export function listasDeLaVista(lineas: readonly LineaVista[]): {
  alPiso: LineaVista[];
  alAlmacen: LineaVista[];
  noCargadas: LineaVista[];
  fuera: LineaVista[];
} {
  const porNombre = (a: LineaVista, b: LineaVista) => a.prenda.localeCompare(b.prenda, "es");
  return {
    alPiso: lineas.filter((l) => l.alPiso > 0).sort(porNombre),
    alAlmacen: lineas.filter((l) => l.alAlmacen > 0).sort(porNombre),
    noCargadas: lineas.filter((l) => l.noCargadas > 0).sort(porNombre),
    fuera: lineas.filter((l) => l.motivo !== "cuadra").sort(porNombre),
  };
}

/** El «antes → después» de una línea, con la cuenta que hizo la base. */
export function antesYDespues(l: LineaVista): { almacen: [number, number]; piso: [number, number] } {
  return { almacen: [l.almacen, l.almacen - l.alPiso + l.alAlmacen], piso: [l.piso, l.piso + l.alPiso - l.alAlmacen] };
}

// ---------------------------------------------------------------------------------------------------------------------
// 7. Textos
// ---------------------------------------------------------------------------------------------------------------------

/** Las cifras de arriba: «435 pasan al piso · 12 suben al almacén · 3 no cargadas · el total de TRU no cambia: 773». */
export function cifrasDelCuadre(r: ResumenCuadre, sede: string): { alPiso: string; alAlmacen: string; noCargadas: string; total: string } {
  return {
    alPiso: `${r.prendasAlPiso.toLocaleString("es-PE")} ${r.prendasAlPiso === 1 ? "pasa" : "pasan"} al piso`,
    alAlmacen: `${r.prendasAlAlmacen.toLocaleString("es-PE")} ${r.prendasAlAlmacen === 1 ? "sube" : "suben"} al almacén`,
    noCargadas: `${r.prendasNoCargadas.toLocaleString("es-PE")} no ${r.prendasNoCargadas === 1 ? "cargada" : "cargadas"}`,
    total: `el total de ${sede} no cambia: ${r.total.toLocaleString("es-PE")}`,
  };
}

/** «el 04/10 a las 18:32 · Ana Torres» (hora de Lima). */
export function textoCuadradoEn(iso: string, por: string | null): string {
  const { dia, hora } = diaYHoraLima(iso);
  return `el ${dia} a las ${hora}${por ? ` · ${por}` : ""}`;
}

/** Arriba de la lista congelada: se envió y no se supo si se guardó. */
export function textoDeEnvioIncierto(enviadoEn: string): string {
  return `Enviaste el cuadre a las ${diaYHoraLima(enviadoEn).hora} y no supimos si se guardó. Pulsa «${BOTON_COMPROBAR_CUADRE}»: si ya se había guardado, no se repite.`;
}

/** Lo que dice la tarjeta del resultado. */
export function textoDeResultado(r: RespuestaCuadre, sede: string): { titulo: string; detalle: string } {
  const c = cifrasDelCuadre(r, sede);
  return {
    titulo: r.yaRegistrado ? `El piso de ${sede} ya estaba cuadrado` : `Piso de ${sede} cuadrado`,
    detalle: `${textoCuadradoEn(r.cuadradoEn, r.por)} · ${c.alPiso} · ${c.alAlmacen}${r.prendasNoCargadas > 0 ? ` · ${c.noCargadas}` : ""}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 8. Los rechazos de la base, en palabras de tienda
// ---------------------------------------------------------------------------------------------------------------------

export type PrendaMovida = { varianteId: string; prenda: string };

export type ErrorDeCuadre =
  | { tipo: "red"; mensaje: string }
  | { tipo: "almacen_movido"; mensaje: string; prendas: PrendaMovida[]; revisadoHasta: string | null }
  | { tipo: "ya_hecho"; mensaje: string; respuesta: RespuestaCuadre | null }
  | { tipo: "token_reusado"; mensaje: string }
  | { tipo: "nota_requerida"; mensaje: string }
  | { tipo: "solo_lider"; mensaje: string }
  | { tipo: "otro"; mensaje: string };

export const TEXTO_RED_CUADRE = `Se cortó la conexión y no sabemos si el cuadre se guardó. Lo escaneado sigue aquí: pulsa «${BOTON_COMPROBAR_CUADRE}». Si ya se había guardado, no se repite.`;

function detalleJson(error: NonNullable<ErrorEscritura>): unknown {
  try {
    return error.details ? JSON.parse(error.details) : null;
  } catch {
    return null;
  }
}

/** El rechazo de la base, dicho para quien está junto al estante. Nunca lanza, ni con un `details` roto. */
export function interpretarErrorDeCuadre(error: ErrorEscritura): ErrorDeCuadre {
  if (!error) return { tipo: "otro", mensaje: "No se pudo cuadrar el piso." };
  if (esRespuestaIncierta(error)) return { tipo: "red", mensaje: TEXTO_RED_CUADRE };
  const mensaje = error.message || "No se pudo cuadrar el piso.";
  switch (error.hint) {
    case "cuadre_almacen_movido": {
      const d = detalleJson(error);
      const prendas = esObjeto(d) && Array.isArray(d.prendas)
        ? (d.prendas as unknown[])
            .filter(esObjeto)
            .filter((p) => typeof p.variante_id === "string")
            .map((p) => ({ varianteId: p.variante_id as string, prenda: typeof p.prenda === "string" ? p.prenda : "Una prenda" }))
        : [];
      return { tipo: "almacen_movido", mensaje, prendas, revisadoHasta: esObjeto(d) && esIso(d.revisado_hasta) ? d.revisado_hasta : null };
    }
    case "cuadre_ya_hecho":
      return { tipo: "ya_hecho", mensaje, respuesta: leerRespuestaCuadre(detalleJson(error)) };
    case "cuadre_token_reusado":
      return { tipo: "token_reusado", mensaje };
    case "cuadre_nota_requerida":
      return { tipo: "nota_requerida", mensaje };
    case "cuadre_solo_lider":
      return { tipo: "solo_lider", mensaje };
    default:
      return { tipo: "otro", mensaje };
  }
}

// Los rechazos que la base levanta DESPUÉS de mirar la marca (20261004200100: forma → marca → sede → responsable → piso y
// almacén → stock → cuadre posterior → almacén movido → nota). Prueban que esa marca no guardó nada (la transacción se deshizo).
const HINTS_DESPUES_DE_LA_MARCA = new Set([
  "cuadre_token_reusado",
  "responsable_requerido",
  "responsable_no_presente",
  "responsable_sin_acceso",
  "ubicacion_requerida",
  "cuadre_tienda_sin_piso",
  "cuadre_ya_hecho",
  "cuadre_almacen_movido",
  "cuadre_nota_requerida",
  "cuadre_item_incoherente",
]);

/**
 * En un REENVÍO (la marca ya viajó y no se supo qué pasó): ¿esta respuesta dice qué pasó con ella? Sí con éxito, con un
 * rechazo posterior a mirar la marca o con un choque de candados (40P01: pasó la marca y se deshizo entero). No con un corte
 * de red, una sesión vencida o una cuenta que no es de líder: la base contestó sin mirar la marca, y soltarla dejaría
 * cuadrar dos veces lo que quizá ya se guardó.
 */
export function respuestaResuelveLaMarcaCuadre(error: ErrorEscritura): boolean {
  if (!error) return true;
  if (esRespuestaIncierta(error)) return false;
  if (error.code === "40P01") return true;
  return !!error.hint && HINTS_DESPUES_DE_LA_MARCA.has(error.hint);
}

// ---------------------------------------------------------------------------------------------------------------------
// 9. La guía de foco (ADR-0284): qué está hecho, qué sigue y qué falta en cada paso. Sale de lo que la base bloquea.
// ---------------------------------------------------------------------------------------------------------------------

/** Paso «Escanear lo guardado»: algo escaneado (o decir que no hay nada guardado) y las prendas por volver a escanear. */
export function camposGuiaEscaneo({ lineas, confirmoVacio, pendientes }: { lineas: number; confirmoVacio: boolean; pendientes: number }): CampoDeGuia[] {
  return [
    {
      id: "guardado",
      nombre: "Lo guardado",
      requerido: true,
      hecho: lineas > 0 || confirmoVacio,
      pendiente: "Escanea cada prenda que está guardada en el almacén (o marca que no hay nada guardado).",
    },
    ...(pendientes > 0
      ? [{ id: "reescanear", nombre: "Volver a escanear", requerido: true, hecho: false, pendiente: "Vuelve a escanear las prendas que cambiaron en el almacén." }]
      : []),
  ];
}

/** Paso «Confirmar»: quién lo hace y, si la sede ya se cuadró antes, por qué se vuelve a cuadrar (lo exige la base). */
export function camposGuiaConfirmar({ responsableListo, notaRequerida, nota }: { responsableListo: boolean; notaRequerida: boolean; nota: string }): CampoDeGuia[] {
  return [
    { id: "responsable", nombre: "Quién cuadra", requerido: true, hecho: responsableListo, pendiente: "Elige quién hace el cuadre." },
    {
      id: "nota",
      nombre: notaRequerida ? "Por qué se vuelve a cuadrar" : "Nota",
      requerido: notaRequerida,
      hecho: nota.trim().length > 0,
      pendiente: notaRequerida ? "Escribe por qué se vuelve a cuadrar el piso." : "",
    },
  ];
}

/** Por qué el botón «Revisar» está apagado, o null si se puede revisar. */
export function motivoNoRevisar({ lineas, confirmoVacio, pendientes }: { lineas: number; confirmoVacio: boolean; pendientes: number }): string | null {
  if (pendientes > 0) return `Falta volver a escanear ${plural(pendientes, "prenda que cambió", "prendas que cambiaron")} en el almacén.`;
  if (lineas === 0 && !confirmoVacio) return "Escanea lo guardado, o marca que no hay nada guardado en el almacén.";
  return null;
}

/** Por qué el botón «Cuadrar el piso» está apagado, o null. Sin ser líder no desaparece: se apaga y dice quién sí puede. */
export function motivoNoConfirmar({
  esLider,
  responsableMotivo,
  notaRequerida,
  nota,
}: {
  esLider: boolean;
  responsableMotivo: string | null;
  notaRequerida: boolean;
  nota: string;
}): string | null {
  if (!esLider) return "Solo un líder confirma el cuadre. Pídele que entre con su cuenta en este mismo equipo: lo escaneado no se pierde.";
  if (notaRequerida && !nota.trim()) return "Escribe por qué se vuelve a cuadrar el piso.";
  if (nota.trim().length > NOTA_MAXIMA_CUADRE) return `La nota admite hasta ${NOTA_MAXIMA_CUADRE} caracteres.`;
  return responsableMotivo;
}
