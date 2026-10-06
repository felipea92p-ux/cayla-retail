// ===========================================================================
// Traslados como PASES (ADR-0355, opción D de docs/maquetas/traslados-visual-2026-10/).
//
// Cada traslado se dibuja como un pase de abordar: de qué sede a cuál en grande (TRU → LIM; el Taller entero), los tres datos
// que importan (salió · llega · prendas) y UN botón. Todo lo que el pase dice sale de aquí, puro y probado; la pantalla solo
// dibuja. Ninguna regla de stock, recepción, cierre ni anulación vive aquí: esas siguen en las RPC. Tampoco se inventa un
// estado que la base no guarda: el sistema no sabe si una caja YA llegó (solo cuándo debía llegar), y el botón lo dice así
// («Si ya llegó, ábrela y cuéntala»), como pidió la prueba ciega del 2026-10-06.
//
// Conteo a ciegas (ADR-0239 D-130): mientras la caja viene hacia la sede que mira, el pase dice QUÉ tipos de prenda trae,
// nunca CUÁNTAS. `ciego` es la única puerta: un campo que diría la cantidad pregunta por ella.
// ===========================================================================

import type { FotoTraslado } from "./producto-fotos-reglas";
import {
  debioLlegar,
  diaHora,
  diasDeDiferencia,
  enTexto,
  esTerminado,
  horaLima,
  ordenarTraslados,
  requiereAccion,
  situacionTraslado,
  type ContextoTraslados,
  type SituacionTraslado,
  type TrasladoBuscable,
} from "./traslados-reglas";

/** Lo que el pase necesita de un traslado. Lo cumplen la lista (`TrasladoResumen`) y el detalle (convertido en el servidor). */
export type DatosPase = {
  id: string;
  numero: number;
  ubicacionOrigenId: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoId: string;
  ubicacionDestinoNombre: string;
  estado: string;
  fechaEstimadaLlegada: string | null;
  creadoEn: string;
  confirmadoEn: string | null;
  cerradoEn: string | null;
  anuladoEn: string | null;
  nota: string | null;
  unidadesEnviadas: number;
  /** Lo contado y guardado (suma de lo recibido de cada prenda); 0 si nadie contó. */
  unidadesRecibidas: number;
  /** Tipos de prenda (una línea por variante: talla y color). */
  lineas: number;
  lineasContadas: number;
  cerradoConDiferencia: boolean;
  creadoPorNombre: string | null;
  fotos: FotoTraslado[];
  colores: string[];
  referencias: string[];
  skus: string[];
};

export type PestanaPase = "llegan" | "envias" | "terminadas";
export const PESTANAS: readonly { id: PestanaPase; nombre: string }[] = [
  { id: "llegan", nombre: "Te llegan" },
  { id: "envias", nombre: "Envías" },
  { id: "terminadas", nombre: "Terminadas" },
];

/** El color y el ícono del pase: lo que le toca a quien mira, no el estado interno. */
export type TonoPase = "atraso" | "llega" | "contando" | "revisar" | "sale" | "cerrado" | "dif" | "anulado" | "pedido";

export type CampoPase = { etiqueta: string; valor: string; detalle: string | null; tarde?: boolean };

export type VistaPase = {
  id: string;
  numero: number;
  /** Qué es el pase: una caja (traslado), un pedido de otra sede o lo que subiste para enviar. */
  clase: "traslado" | "pedido" | "para-enviar";
  /** Lo que dice la banda a la derecha: «Caja Nº 287», «Pedido», «Para enviar». */
  rotulo: string;
  tono: TonoPase;
  pestana: PestanaPase;
  /** «Atrasada», «Viene hacia ti», «Contando»… — el nombre de lo que le toca a quien mira. */
  nombre: string;
  codigoOrigen: string;
  codigoDestino: string;
  sedeOrigen: string;
  sedeDestino: string;
  soyOrigen: boolean;
  soyDestino: boolean;
  /** Dónde va el camión en la línea (0 = acaba de salir, 1 = en la puerta). */
  progreso: number;
  /** El camión solo se dibuja mientras la caja viaja (ni contándose ni terminada). */
  conCamion: boolean;
  tarde: boolean;
  ciego: boolean;
  campos: [CampoPase, CampoPase, CampoPase];
  cifra: { grande: string; chica: string; tarde: boolean };
  boton: { texto: string; principal: boolean };
  sello: { texto: string; tono: TonoPase; fecha: string } | null;
  /** Le pide algo a quien mira (cuenta en el anillo y en el contador de su pestaña). */
  porHacer: boolean;
  enviaNombre: string | null;
  nota: string | null;
  fotos: FotoTraslado[];
  colores: string[];
};

// --- Códigos de sede ----------------------------------------------------------

/**
 * El código grande del pase. En producción las tiendas se llaman «Tienda TRU», «Tienda LIM», «Tienda AQP»: el código es la
 * última palabra si va en mayúsculas (2 a 4 letras). El Taller va entero: «TAL» no se entendió en la prueba ciega. Si una sede
 * no trae código en el nombre («Tienda Lima» en la base local), queda el nombre sin «Tienda». El código de Dynamic
 * (`public.sedes.codigo`) NO se usa: el de Lima es «003».
 */
export function codigoDeSede(u: { nombre: string; tipo?: string | null }): string {
  const nombre = u.nombre.trim();
  if (u.tipo === "taller") return nombre;
  const m = /(?:^|\s)([A-ZÁÉÍÓÚÑ]{2,4})$/.exec(nombre);
  if (m) return m[1];
  return nombre.replace(/^tienda\s+/i, "") || nombre;
}

// --- Tiempo -------------------------------------------------------------------

/** «40 min», «1 h 10», «3 h», «2 días»: cuánto pasó o falta, corto, para la cifra grande. */
export function duracionCorta(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = Math.round((min % 60) / 5) * 5;
    if (m === 60) return `${h + 1} h`;
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  }
  return `${Math.round(min / 1440)} días`;
}

/** «hoy», «mañana», «ayer» o «20 sep»: el día de una fecha, sin la hora. */
export function diaPalabra(iso: string, ahoraIso: string): string {
  const d = diasDeDiferencia(iso, ahoraIso);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  return diaHora(iso, ahoraIso).split(" · ")[0];
}

const esHoy = (iso: string | null, ahoraIso: string) => !!iso && diasDeDiferencia(iso, ahoraIso) === 0;

// --- Lectura del pase -----------------------------------------------------------

const enTransito = (t: DatosPase) => t.estado === "en_transito";
/** Alguien ya empezó a contar (se guarda casilla por casilla): ya no viaja, se está contando. */
export const seEstaContando = (t: DatosPase) => enTransito(t) && t.lineasContadas > 0;

function leible(t: DatosPase) {
  return { ...t, fechaEstimadaLlegada: t.fechaEstimadaLlegada, confirmadoEn: t.confirmadoEn };
}

/** La situación del pase según la sede que mira (la misma lectura de la lista de siempre: `situacionTraslado`). */
export function situacionDelPase(t: DatosPase, ctx: ContextoTraslados): SituacionTraslado {
  return situacionTraslado(leible(t), ctx);
}

/** Mientras viaja hacia la sede que mira, no se dice cuántas prendas trae (ADR-0239 D-130). */
export function esCiego(t: DatosPase, ctx: ContextoTraslados): boolean {
  return t.ubicacionDestinoId === ctx.miUbicacionId && enTransito(t);
}

/** ¿Pasó la hora estimada y nadie empezó a contar? Es un dato del pase («1 h 10 de atraso»), no un candado. */
export function estaAtrasada(t: DatosPase, ahoraIso: string): boolean {
  return enTransito(t) && !seEstaContando(t) && !!t.fechaEstimadaLlegada && debioLlegar(t.fechaEstimadaLlegada, ahoraIso);
}

export function tonoDelPase(t: DatosPase, ctx: ContextoTraslados): TonoPase {
  const s = situacionDelPase(t, ctx);
  switch (s) {
    case "anulado":
      return "anulado";
    case "cerrado":
      return "cerrado";
    case "cerrado_con_diferencia":
      return "dif";
    case "requiere_revision":
    case "con_diferencia":
      return "revisar";
    case "requiere_recepcion":
      return seEstaContando(t) ? "contando" : estaAtrasada(t, ctx.ahoraIso) ? "atraso" : "llega";
    case "en_camino_saliente":
      return seEstaContando(t) ? "contando" : "sale";
  }
}

export function pestanaDelPase(t: DatosPase, ctx: ContextoTraslados): PestanaPase {
  if (esTerminado(situacionDelPase(t, ctx))) return "terminadas";
  return t.ubicacionDestinoId === ctx.miUbicacionId ? "llegan" : "envias";
}

/** El nombre de una CAJA (femenino) según lo que le toca a quien mira. */
export function nombreDelPase(t: DatosPase, ctx: ContextoTraslados, codigoDestino: string): string {
  const s = situacionDelPase(t, ctx);
  const tono = tonoDelPase(t, ctx);
  const soyDestino = t.ubicacionDestinoId === ctx.miUbicacionId;
  switch (tono) {
    case "atraso":
      return "Atrasada";
    case "llega":
      return "Viene hacia ti";
    case "sale":
      return "Enviada";
    case "contando":
      return soyDestino ? "Contando" : `${codigoDestino} la está contando`;
    case "revisar":
      if (s === "requiere_revision") return "Falta revisar";
      return soyDestino ? "Faltó algo · espera a un líder" : `Faltó algo · la revisa ${codigoDestino}`;
    case "cerrado":
      return "Recibida completa";
    case "dif":
      return "Cerrada con nota";
    case "anulado":
      return "Anulada";
    default:
      return "";
  }
}

/** Dónde va el camión: lo que pasó del tiempo estimado. 1 = en la puerta (contándose, terminada o atrasada). */
export function progresoDelViaje(t: DatosPase, ahoraIso: string): number {
  if (t.estado === "anulada") return 0;
  if (!enTransito(t) || seEstaContando(t) || !t.fechaEstimadaLlegada) return 1;
  const salio = Date.parse(t.creadoEn);
  const llega = Date.parse(t.fechaEstimadaLlegada);
  const ahora = Date.parse(ahoraIso);
  if (!(llega > salio)) return 1;
  return Math.max(0.04, Math.min(1, (ahora - salio) / (llega - salio)));
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Lo que faltó (negativo) o sobró (positivo), en prendas, una vez contado todo. */
export function diferenciaDeUnidades(t: DatosPase): number {
  return t.unidadesRecibidas - t.unidadesEnviadas;
}

export function cifraDelPase(t: DatosPase, ctx: ContextoTraslados): VistaPase["cifra"] {
  const tono = tonoDelPase(t, ctx);
  const soyDestino = t.ubicacionDestinoId === ctx.miUbicacionId;
  if (tono === "llega" || tono === "atraso" || tono === "sale") {
    if (t.fechaEstimadaLlegada && debioLlegar(t.fechaEstimadaLlegada, ctx.ahoraIso)) {
      return { grande: duracionCorta(Date.parse(ctx.ahoraIso) - Date.parse(t.fechaEstimadaLlegada)), chica: "de atraso", tarde: true };
    }
    if (!t.fechaEstimadaLlegada) return { grande: "—", chica: "sin hora", tarde: false };
    return { grande: horaLima(t.fechaEstimadaLlegada), chica: `llega ${diaPalabra(t.fechaEstimadaLlegada, ctx.ahoraIso)}`, tarde: false };
  }
  if (tono === "contando") return { grande: `${t.lineasContadas}/${t.lineas}`, chica: "contadas", tarde: false };
  const dif = diferenciaDeUnidades(t);
  if (tono === "revisar") {
    if (dif < 0) return { grande: `−${-dif}`, chica: plural(-dif, "faltó", "faltaron"), tarde: false };
    if (dif > 0) return { grande: `+${dif}`, chica: plural(dif, "sobró", "sobraron"), tarde: false };
    return { grande: "0", chica: "por revisar", tarde: false };
  }
  if (tono === "dif") return { grande: dif < 0 ? `−${-dif}` : `+${dif}`, chica: "cerrada con nota", tarde: false };
  if (tono === "anulado") return { grande: "0", chica: "volvió todo", tarde: false };
  return { grande: soyDestino ? `+${t.unidadesRecibidas || t.unidadesEnviadas}` : `${t.unidadesRecibidas || t.unidadesEnviadas}`, chica: soyDestino ? "entraron" : "llegaron", tarde: false };
}

/** Los tres datos del pase. Nunca la cantidad de una caja que viene hacia quien mira (`ciego`). */
export function camposDelPase(t: DatosPase, ctx: ContextoTraslados, codigoOrigen: string): [CampoPase, CampoPase, CampoPase] {
  const tono = tonoDelPase(t, ctx);
  const ciego = esCiego(t, ctx);
  const salio: CampoPase = { etiqueta: "Salió", valor: diaHora(t.creadoEn, ctx.ahoraIso), detalle: null };
  const tipos = `${t.lineas} ${plural(t.lineas, "tipo", "tipos")}`;
  if (tono === "anulado") {
    return [
      salio,
      { etiqueta: "Anulada", valor: t.anuladoEn ? diaHora(t.anuladoEn, ctx.ahoraIso) : "—", detalle: null },
      { etiqueta: "Volvieron", valor: `${t.unidadesEnviadas} ${plural(t.unidadesEnviadas, "prenda", "prendas")}`, detalle: `a ${codigoOrigen}` },
    ];
  }
  if (tono === "llega" || tono === "atraso" || tono === "sale") {
    const eta = t.fechaEstimadaLlegada;
    const tarde = !!eta && debioLlegar(eta, ctx.ahoraIso);
    return [
      salio,
      {
        etiqueta: "Llega",
        valor: eta ? diaHora(eta, ctx.ahoraIso) : "sin hora",
        detalle: !eta ? null : tarde ? `${duracionCorta(Date.parse(ctx.ahoraIso) - Date.parse(eta))} tarde` : enTexto(eta, ctx.ahoraIso),
        tarde,
      },
      ciego
        ? { etiqueta: "Prendas", valor: tipos, detalle: "las cuentas al llegar" }
        : { etiqueta: "Prendas", valor: String(t.unidadesEnviadas), detalle: `${tipos} de prenda` },
    ];
  }
  if (tono === "contando") {
    return [
      salio,
      { etiqueta: "Contando", valor: `${t.lineasContadas} de ${t.lineas}`, detalle: "tipos de prenda" },
      ciego ? { etiqueta: "Prendas", valor: tipos, detalle: "sin saber cuántas" } : { etiqueta: "Prendas", valor: String(t.unidadesEnviadas), detalle: "enviadas" },
    ];
  }
  const llego: CampoPase = { etiqueta: "Llegó", valor: t.confirmadoEn || t.cerradoEn ? diaHora((t.confirmadoEn ?? t.cerradoEn)!, ctx.ahoraIso) : "—", detalle: null };
  const dif = diferenciaDeUnidades(t);
  if (tono === "revisar" || tono === "dif") {
    const n = Math.abs(dif);
    return [
      salio,
      llego,
      { etiqueta: dif > 0 ? "Sobró" : "Faltó", valor: `${n} ${plural(n, "prenda", "prendas")}`, detalle: tono === "dif" ? "cerrada con nota" : "por revisar" },
    ];
  }
  const u = t.unidadesRecibidas || t.unidadesEnviadas;
  return [salio, llego, { etiqueta: "Entraron", valor: `${u} ${plural(u, "prenda", "prendas")}`, detalle: null }];
}

/** El único botón del pase. El sistema no sabe si la caja ya llegó: el texto no lo da por hecho. */
export function botonDelPase(t: DatosPase, ctx: ContextoTraslados): VistaPase["boton"] {
  const s = situacionDelPase(t, ctx);
  const tono = tonoDelPase(t, ctx);
  const soyDestino = t.ubicacionDestinoId === ctx.miUbicacionId;
  switch (tono) {
    case "atraso":
      return { texto: "Ya llegó: abrir y contar", principal: true };
    case "llega":
      return { texto: "Si ya llegó, ábrela y cuéntala", principal: false };
    case "contando":
      return soyDestino ? { texto: "Seguir contando", principal: true } : { texto: "Ver lo que enviaste", principal: false };
    case "revisar":
      return s === "requiere_revision" ? { texto: "Revisar lo que faltó", principal: true } : { texto: "Ver la diferencia", principal: false };
    case "sale":
      return { texto: "Ver lo que enviaste", principal: false };
    case "cerrado":
      return { texto: "Ver lo que llegó", principal: false };
    case "dif":
      return { texto: "Ver la nota", principal: false };
    case "anulado":
      return { texto: "Ver por qué se anuló", principal: false };
    default:
      return { texto: "Ver la caja", principal: false };
  }
}

export const TEXTO_SELLO: Partial<Record<TonoPase, string>> = { cerrado: "RECIBIDA", dif: "CON NOTA", anulado: "ANULADA" };

/** El sello de goma de lo terminado: RECIBIDA, CON NOTA o ANULADA, con su fecha. */
export function selloDelPase(t: DatosPase, ctx: ContextoTraslados): VistaPase["sello"] {
  const tono = tonoDelPase(t, ctx);
  const texto = TEXTO_SELLO[tono];
  if (!texto) return null;
  const fecha = t.anuladoEn ?? t.cerradoEn ?? t.confirmadoEn;
  return { texto, tono, fecha: fecha ? fechaDeSello(fecha) : "" };
}

const MESES_SELLO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
/** «6 OCT · 10:40», en Lima. */
export function fechaDeSello(iso: string): string {
  const p = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "numeric" }).formatToParts(new Date(iso));
  const dia = p.find((x) => x.type === "day")?.value ?? "";
  const mes = Number(p.find((x) => x.type === "month")?.value ?? 0);
  return `${dia} ${MESES_SELLO[mes - 1] ?? ""} · ${horaLima(iso)}`;
}

/** Todo lo que el pase dice, en un solo objeto (lo arma el servidor; el navegador solo lo dibuja). */
export function vistaDelPase(t: DatosPase, ctx: ContextoTraslados, codigos: { origen: string; destino: string }): VistaPase {
  const tono = tonoDelPase(t, ctx);
  return {
    id: t.id,
    numero: t.numero,
    clase: "traslado",
    rotulo: `Caja Nº ${t.numero}`,
    tono,
    pestana: pestanaDelPase(t, ctx),
    nombre: nombreDelPase(t, ctx, codigos.destino),
    codigoOrigen: codigos.origen,
    codigoDestino: codigos.destino,
    sedeOrigen: t.ubicacionOrigenNombre,
    sedeDestino: t.ubicacionDestinoNombre,
    soyOrigen: t.ubicacionOrigenId === ctx.miUbicacionId,
    soyDestino: t.ubicacionDestinoId === ctx.miUbicacionId,
    progreso: progresoDelViaje(t, ctx.ahoraIso),
    conCamion: tono === "llega" || tono === "atraso" || tono === "sale",
    tarde: estaAtrasada(t, ctx.ahoraIso),
    ciego: esCiego(t, ctx),
    campos: camposDelPase(t, ctx, codigos.origen),
    cifra: cifraDelPase(t, ctx),
    boton: botonDelPase(t, ctx),
    sello: selloDelPase(t, ctx),
    porHacer: requiereAccion(situacionDelPase(t, ctx)),
    enviaNombre: t.creadoPorNombre,
    nota: t.nota,
    fotos: t.fotos,
    colores: t.colores,
  };
}

// --- La billetera ---------------------------------------------------------------

/** Los pases de cada pestaña, en el orden de siempre: primero lo que te toca (lo que espera hace más), después lo que viaja, al
 *  final lo terminado (lo más reciente primero). Es `ordenarTraslados`, la misma regla de la lista anterior. */
export function pasesPorPestana<T extends DatosPase>(ts: readonly T[], ctx: ContextoTraslados): Record<PestanaPase, T[]> {
  const ordenados = ordenarTraslados(
    ts.map((t) => ({ ...t, fechaEstimadaLlegada: t.fechaEstimadaLlegada })),
    ctx,
  ) as T[];
  const out: Record<PestanaPase, T[]> = { llegan: [], envias: [], terminadas: [] };
  for (const t of ordenados) out[pestanaDelPase(t, ctx)].push(t);
  return out;
}

/** «Hechas hoy» del anillo (decisión de Felipe del 2026-10-06): lo que la sede que mira confirmó o cerró hoy (como destino) y lo
 *  que anuló hoy (como origen). Los pedidos respondidos no tienen una fecha de respuesta en la lista: no se cuentan. */
export function hechasHoy(ts: readonly DatosPase[], ctx: ContextoTraslados): number {
  return ts.filter((t) => {
    if (t.ubicacionDestinoId === ctx.miUbicacionId && t.estado !== "anulada") {
      if (t.estado === "en_transito") return false;
      // Una diferencia que sigue abierta todavía le pide algo a alguien: no está hecha.
      if (t.estado === "recibido_con_diferencia") return false;
      return esHoy(t.cerradoEn, ctx.ahoraIso) || esHoy(t.confirmadoEn, ctx.ahoraIso);
    }
    return t.ubicacionOrigenId === ctx.miUbicacionId && t.estado === "anulada" && esHoy(t.anuladoEn, ctx.ahoraIso);
  }).length;
}

export type Anillo = { hechas: number; total: number; pendientes: number; fraccion: number };

/** El anillo «0/5 · Te tocan 5 cosas hoy». `pendientes` es el MISMO número del menú: lo que llega por recibir o revisar
 *  (`requiereAccion`) más lo que otras sedes te piden (`tePiden`). */
export function anilloDelDia(p: { porRecibir: number; tePiden: number; hechas: number }): Anillo {
  const pendientes = p.porRecibir + p.tePiden;
  const total = pendientes + p.hechas;
  return { hechas: p.hechas, total, pendientes, fraccion: total === 0 ? 1 : p.hechas / total };
}

/** Lo que el buscador de la billetera mira de un pase: lo de siempre (número, sede, prenda, código, nota) más el código del pase
 *  («TRU», «Taller»). Se busca con `coincideBusqueda`, la misma regla de la lista anterior y de Movimientos. */
export function buscableDelPase(t: DatosPase, codigos: { origen: string; destino: string }): TrasladoBuscable {
  return {
    numero: t.numero,
    ubicacionOrigenNombre: `${t.ubicacionOrigenNombre} ${codigos.origen}`,
    ubicacionDestinoNombre: `${t.ubicacionDestinoNombre} ${codigos.destino}`,
    nota: t.nota,
    referencias: t.referencias,
    skus: t.skus,
  };
}

/** El pase que se abre solo al entrar a Traslados: lo primero que te toca (lo que llega, después lo que te piden enviar); si no
 *  hay nada que hacer, el primero de la billetera. `null` si no hay ninguno. */
export function paseInicial<T extends { id: string; porHacer: boolean }>(pases: Record<PestanaPase, readonly T[]>): T | null {
  for (const p of ["llegan", "envias"] as const) {
    const t = pases[p].find((x) => x.porHacer);
    if (t) return t;
  }
  return pases.llegan[0] ?? pases.envias[0] ?? pases.terminadas[0] ?? null;
}

/** La caja anterior y la siguiente en su pestaña (las flechas del escenario y ← → del teclado). */
export function vecinosEnPestana<T extends { id: string }>(lista: readonly T[], id: string): { anterior: T | null; siguiente: T | null; posicion: number } {
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) return { anterior: null, siguiente: null, posicion: -1 };
  return { anterior: lista[i - 1] ?? null, siguiente: lista[i + 1] ?? null, posicion: i };
}
