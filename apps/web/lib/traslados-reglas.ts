// Reglas de Traslados en dos fases (20260916150000), sin nada de servidor:
// las lecturas contra Postgres viven en `traslados.ts` (mismo reparto que
// movimientos-v2.ts / movimientos-reglas.ts).
//
// Dos generaciones conviven acá a propósito: `estaAtrasado` (la de siempre, la usa la tarjeta de
// Existencias) y la «Lectura operativa» de abajo (la de la pantalla Traslados y el contador del
// menú, 2026-09-18). Las funciones de la lectura de 2026-09-16 (`vistaTraslado`, `textoPrendas`,
// `llegaHoy`…) se retiraron: el rediseño las dejó sin ningún llamador.

/** Atrasado = pasó la fecha estimada y todavía no se cerró — el mismo
 *  criterio para "en_transito" (nadie confirmó nada) y para
 *  "recibido_con_diferencia" (confirmaron algo, pero sigue sin cerrar). */
export function estaAtrasado(fechaEstimadaLlegada: string, estado: string, ahoraIso: string = new Date().toISOString()): boolean {
  if (estado === "cerrada" || estado === "completada") return false;
  return new Date(ahoraIso).getTime() > new Date(fechaEstimadaLlegada).getTime();
}

// ===========================================================================
// Lectura operativa de la pantalla Traslados (rediseño 2026-09-18)
//
// La pantalla dejó de leer un traslado por su estado interno («en_transito») y
// pasó a leerlo por lo que le TOCA HACER a quien mira. Todo sale de datos que
// la base ya guarda —estado, las dos sedes, la hora estimada de llegada y
// cuándo empezó a registrarse la recepción—; no hay estado nuevo ni cambia
// ninguna regla de stock, recepción o cierre (esas viven en las RPC).
//
// El motivo: «En tránsito» mezclaba dos cosas con acciones distintas — el
// bulto que ya debería estar en la tienda (hay que contarlo) y el que todavía
// viaja en el bus (no hay nada que hacer salvo esperar). Un contador que las
// suma no le dice al encargado qué hacer distinto según su valor.
// ===========================================================================

/** Lo mínimo que estas reglas necesitan de un traslado (`TrasladoResumen` lo cumple de sobra). */
export type TrasladoLeible = {
  estado: string;
  ubicacionOrigenId: string;
  ubicacionDestinoId: string;
  fechaEstimadaLlegada: string | null;
  /** Se llena cuando alguien registra la primera línea recibida: la recepción ya empezó. */
  confirmadoEn: string | null;
};

export type ContextoTraslados = {
  miUbicacionId: string;
  /** Quién puede cerrar un traslado con diferencia (`cerrar_traslado_con_diferencia`): un líder o la terminal administrativa
   *  (ADR-0160, `fn_puede_ajustar_inventario`). Antes se llamaba `esLider`. */
  puedeCerrarDiferencia: boolean;
  /** El «ahora» con el que se calcula todo. Lo fija el servidor y se pasa hacia abajo para
   *  que el HTML del servidor y el del navegador digan exactamente lo mismo («hace 1 h»). */
  ahoraIso: string;
};

/**
 * Cómo se lee un traslado desde MI sede — lo que me toca hacer, no el nombre interno del estado:
 *  · requiere_recepcion — viene hacia acá y ya debería estar (pasó la hora estimada, o alguien
 *                         ya empezó a contarlo): hay que confirmarlo.
 *  · requiere_revision  — quedó con diferencia y soy líder de la sede que lo recibió: me toca cerrarlo.
 *                         (Ojo: la RPC dejaría cerrarlo a CUALQUIER líder, no solo al de esa sede; el aviso se
 *                         dirige al líder de la sede que recibió porque es a quien le concierne el stock.
 *                         Si se decide que cualquier líder debe recibir el aviso, se cambia acá y en
 *                         `getTrasladosPorAtender` — no es un cambio de cableado.)
 *  · en_camino_entrante — viene hacia acá y todavía está dentro del tiempo estimado: solo esperar.
 *  · en_camino_saliente — salió de acá y la otra sede aún no lo confirma: no me toca, pero se sigue.
 *  · con_diferencia     — quedó con diferencia y espera a otra persona (no soy líder de esa sede).
 *  · cerrado            — terminó (cerrada, o «completada» del modelo anterior).
 * Un estado que no sea ninguno de los dos abiertos (en_transito, recibido_con_diferencia) se lee como cerrado. */
export type SituacionTraslado =
  | "requiere_recepcion"
  | "requiere_revision"
  | "en_camino_entrante"
  | "en_camino_saliente"
  | "con_diferencia"
  | "cerrado";

/** ¿Ya pasó la hora estimada? Sin hora estimada no se puede prometer que «viene normal»:
 *  se lee como «ya debería estar» (es el caso seguro — se ve en vez de esconderse).
 *  `iniciar_traslado` exige la hora, así que un traslado abierto sin ella no debería existir. */
export function debioLlegar(fechaEstimadaLlegada: string | null, ahoraIso: string): boolean {
  if (!fechaEstimadaLlegada) return true;
  return new Date(ahoraIso).getTime() >= new Date(fechaEstimadaLlegada).getTime();
}

export function situacionTraslado(t: TrasladoLeible, ctx: ContextoTraslados): SituacionTraslado {
  const soyDestino = t.ubicacionDestinoId === ctx.miUbicacionId;
  if (t.estado === "recibido_con_diferencia") return soyDestino && ctx.puedeCerrarDiferencia ? "requiere_revision" : "con_diferencia";
  if (t.estado !== "en_transito") return "cerrado";
  if (!soyDestino) return "en_camino_saliente";
  // Que alguien ya haya registrado líneas (`confirmadoEn`) significa que el bulto llegó,
  // aunque la hora estimada diga lo contrario: hay que terminar de confirmarlo.
  return debioLlegar(t.fechaEstimadaLlegada, ctx.ahoraIso) || t.confirmadoEn ? "requiere_recepcion" : "en_camino_entrante";
}

/** Lo que exige una acción de quien mira, ahora. Alimenta la franja, el filtro «Acción hoy» y el contador del menú. */
export function requiereAccion(s: SituacionTraslado): boolean {
  return s === "requiere_recepcion" || s === "requiere_revision";
}

export function esAbierto(s: SituacionTraslado): boolean {
  return s !== "cerrado";
}

/** Los filtros de la lista. Son predicados: un traslado puede caer en varios (uno con diferencia que
 *  me toca revisar cuenta en «Acción hoy» y en «Con diferencia»).
 *  `por_recibir` NO es un chip de la «Vista rápida»: es el atajo de la tarjeta «Por recibir hoy»,
 *  que cuenta solo recepciones y por eso tiene que filtrar solo recepciones — si filtrara «Acción
 *  hoy», un líder con una diferencia pendiente vería «0» en la tarjeta y una fila al tocarla. */
export type FiltroTraslado = "todos" | "accion" | "en_camino" | "con_diferencia" | "cerrados" | "por_recibir";

/** Los cinco chips de la fila «Vista rápida», en su orden. */
export const FILTROS_TRASLADO: FiltroTraslado[] = ["todos", "accion", "en_camino", "con_diferencia", "cerrados"];

export const ETIQUETA_FILTRO_TRASLADO: Record<FiltroTraslado, string> = {
  todos: "Todos",
  accion: "Acción hoy",
  en_camino: "En camino",
  con_diferencia: "Con diferencia",
  cerrados: "Cerrados",
  por_recibir: "Por recibir hoy",
};

export function coincideFiltro(s: SituacionTraslado, filtro: FiltroTraslado): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "accion":
      return requiereAccion(s);
    case "en_camino":
      return s === "en_camino_entrante" || s === "en_camino_saliente";
    case "con_diferencia":
      return s === "con_diferencia" || s === "requiere_revision";
    case "cerrados":
      return s === "cerrado";
    case "por_recibir":
      return s === "requiere_recepcion";
  }
}

export type ResumenTraslados = {
  /** «Por recibir hoy»: vienen hacia acá y ya deberían estar (o ya empezaron a contarse). */
  porRecibir: number;
  /** «Vienen en camino»: vienen hacia acá y todavía están dentro del tiempo estimado. */
  vienenEnCamino: number;
  /** Salieron de acá y la otra sede aún no los confirma. No los cuenta ninguna tarjeta de «me toca»,
   *  pero sí el filtro «En camino» — por eso se guarda aparte: para poder explicar la diferencia. */
  salientesEnCamino: number;
  /** «Con diferencia»: pendientes de resolver, los que me tocan y los que esperan a otra persona. */
  conDiferencia: number;
  /** De esos, los que me tocan a mí (soy líder de la sede que los recibió). */
  porRevisar: number;
  /** Recepciones + revisiones que me tocan: franja «Atención hoy», filtro «Acción hoy» y contador del menú. */
  requierenAccion: number;
  /** «Prendas en tránsito»: unidades enviadas de los traslados abiertos — todavía no están en el
   *  stock de ninguna sede (salieron del origen y no han entrado al destino). */
  unidadesEnTransito: number;
  /** Cuántos traslados abiertos hay (en camino o con diferencia). */
  abiertos: number;
  porFiltro: Record<FiltroTraslado, number>;
};

export function resumirTraslados(ts: (TrasladoLeible & { unidadesEnviadas: number })[], ctx: ContextoTraslados): ResumenTraslados {
  const r: ResumenTraslados = {
    porRecibir: 0,
    vienenEnCamino: 0,
    salientesEnCamino: 0,
    conDiferencia: 0,
    porRevisar: 0,
    requierenAccion: 0,
    unidadesEnTransito: 0,
    abiertos: 0,
    porFiltro: { todos: ts.length, accion: 0, en_camino: 0, con_diferencia: 0, cerrados: 0, por_recibir: 0 },
  };
  for (const t of ts) {
    const s = situacionTraslado(t, ctx);
    if (s === "requiere_recepcion") r.porRecibir++;
    if (s === "en_camino_entrante") r.vienenEnCamino++;
    if (s === "en_camino_saliente") r.salientesEnCamino++;
    if (s === "con_diferencia" || s === "requiere_revision") r.conDiferencia++;
    if (s === "requiere_revision") r.porRevisar++;
    if (esAbierto(s)) {
      r.abiertos++;
      r.unidadesEnTransito += t.unidadesEnviadas;
    }
    // Todos los filtros, no solo los chips: `por_recibir` (el atajo de la tarjeta) también se cuenta.
    for (const f of Object.keys(r.porFiltro) as FiltroTraslado[]) if (f !== "todos" && coincideFiltro(s, f)) r.porFiltro[f]++;
  }
  r.requierenAccion = r.porRecibir + r.porRevisar;
  return r;
}

/** El número del contador junto a «Traslados» en el menú. Mismo criterio que la franja de la pantalla
 *  (una sola regla, dos lugares): solo lo que me toca a mí, nunca «todos los traslados que existen». */
export function contarRequierenAccion(ts: TrasladoLeible[], ctx: ContextoTraslados): number {
  return ts.reduce((n, t) => (requiereAccion(situacionTraslado(t, ctx)) ? n + 1 : n), 0);
}

/** La primera fecha que exista, en ms (o Infinity si ninguna). */
function primeraFecha(...isos: (string | null)[]): number {
  for (const iso of isos) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return Infinity;
}

/** Desde cuándo lleva pendiente lo que me toca hacer (ms) — «lo más viejo primero».
 *  Cuenta el tiempo de ESPERA, no la antigüedad del envío: un traslado que salió hace 10 días con hora
 *  estimada de hoy lleva menos esperando que uno que salió ayer y debió llegar hace 36 h. Por eso la
 *  fecha de salida (`creadoEn`) es solo el último recurso, nunca un candidato a «el menor». */
function pendienteDesdeMs(t: TrasladoLeible & { creadoEn: string }, s: SituacionTraslado, ahoraIso: string): number {
  // Diferencia: espera desde que se recibió (se registró la primera línea).
  if (s === "requiere_revision" || s === "con_diferencia") return primeraFecha(t.confirmadoEn, t.fechaEstimadaLlegada, t.creadoEn);
  // Recepción: desde la hora estimada (si ya pasó) o desde que empezó a registrarse, lo que ocurrió antes.
  const vencida = t.fechaEstimadaLlegada && debioLlegar(t.fechaEstimadaLlegada, ahoraIso) ? t.fechaEstimadaLlegada : null;
  const desde = Math.min(primeraFecha(vencida), primeraFecha(t.confirmadoEn));
  return Number.isFinite(desde) ? desde : primeraFecha(t.creadoEn);
}

/** El traslado al que lleva «Revisar ahora»: entre los que me tocan, el que lleva más tiempo esperando. */
export function masUrgente<T extends TrasladoLeible & { creadoEn: string; numero: number }>(ts: T[], ctx: ContextoTraslados): T | null {
  let mejor: T | null = null;
  let mejorClave = Infinity;
  for (const t of ts) {
    const s = situacionTraslado(t, ctx);
    if (!requiereAccion(s)) continue;
    const clave = pendienteDesdeMs(t, s, ctx.ahoraIso);
    if (mejor === null || clave < mejorClave || (clave === mejorClave && t.numero < mejor.numero)) {
      mejor = t;
      mejorClave = clave;
    }
  }
  return mejor;
}

/** El orden con el que se lee la lista: primero lo que me toca (lo que lleva más tiempo esperando
 *  arriba), luego las diferencias que esperan a otra persona, luego lo que viaja (lo que llega
 *  antes, primero) y al final el historial, lo más reciente primero. A igual tiempo, por número. */
export function ordenarTraslados<T extends TrasladoLeible & { creadoEn: string; numero: number }>(ts: T[], ctx: ContextoTraslados): T[] {
  const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : Infinity);
  const clave = (t: T): [number, number, number] => {
    const s = situacionTraslado(t, ctx);
    if (requiereAccion(s)) return [0, pendienteDesdeMs(t, s, ctx.ahoraIso), t.numero];
    if (s === "con_diferencia") return [1, pendienteDesdeMs(t, s, ctx.ahoraIso), t.numero];
    if (s === "cerrado") return [3, -ms(t.creadoEn), -t.numero];
    return [2, ms(t.fechaEstimadaLlegada), t.numero];
  };
  return [...ts].sort((a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
}

/** Qué botón lleva la fila. El fuerte es solo para lo que de verdad pide una intervención. */
export function accionDeTraslado(s: SituacionTraslado): { texto: string; principal: boolean } {
  if (s === "requiere_recepcion") return { texto: "Confirmar recepción", principal: true };
  if (s === "requiere_revision") return { texto: "Revisar diferencia", principal: true };
  return { texto: "Ver detalle", principal: false };
}

export type DireccionTraslado = "entrante" | "saliente";

/** Hacia mi sede (entrante) o desde mi sede (saliente): lo que la columna «Ruta» debe hacer entender al instante. */
export function direccionTraslado(t: Pick<TrasladoLeible, "ubicacionDestinoId">, miUbicacionId: string): DireccionTraslado {
  return t.ubicacionDestinoId === miUbicacionId ? "entrante" : "saliente";
}

/** Filtro de dirección de «Más filtros»: todos, solo lo que llega o solo lo que sale. */
export type FiltroDireccion = "todas" | DireccionTraslado;

export function coincideDireccion(t: Pick<TrasladoLeible, "ubicacionDestinoId">, miUbicacionId: string, filtro: FiltroDireccion): boolean {
  return filtro === "todas" || direccionTraslado(t, miUbicacionId) === filtro;
}

/** La sede del OTRO extremo del traslado (con la que trato), la que ofrece el filtro «Otra sede». */
export function otraSedeDe(
  t: Pick<TrasladoLeible, "ubicacionOrigenId" | "ubicacionDestinoId"> & { ubicacionOrigenNombre: string; ubicacionDestinoNombre: string },
  miUbicacionId: string
): { id: string; nombre: string } {
  return t.ubicacionDestinoId === miUbicacionId
    ? { id: t.ubicacionOrigenId, nombre: t.ubicacionOrigenNombre }
    : { id: t.ubicacionDestinoId, nombre: t.ubicacionDestinoNombre };
}

/** «Blusa Camila + 2 más» — la primera prenda por nombre y cuántas más van. */
export function resumenPrendas(referencias: string[]): string {
  if (referencias.length === 0) return "Sin prendas";
  const [primera, ...resto] = referencias;
  return resto.length > 0 ? `${primera} + ${resto.length} más` : primera;
}

// --- Fechas humanas ---------------------------------------------------------
// Todo en hora de Lima y armado a mano (no con `toLocaleString`): el texto de
// «17/9» o «16:15» no debe depender de qué versión de ICU tenga el servidor o
// el navegador, o el HTML de uno no calzaría con el del otro.

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const PARTES_LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type ParteLima = { anio: number; mes: number; dia: number; hora: string; minuto: string };

function parteLima(iso: string): ParteLima | null {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const p: Record<string, string> = {};
  for (const x of PARTES_LIMA.formatToParts(ms)) p[x.type] = x.value;
  return { anio: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: p.hour.padStart(2, "0"), minuto: p.minute.padStart(2, "0") };
}

/** Días de calendario, en Lima, de `iso` respecto de `ahoraIso`: 0 = hoy, 1 = mañana, -1 = ayer. */
export function diasDeDiferencia(iso: string, ahoraIso: string): number | null {
  const a = parteLima(iso);
  const b = parteLima(ahoraIso);
  if (!a || !b) return null;
  return (Date.UTC(a.anio, a.mes - 1, a.dia) - Date.UTC(b.anio, b.mes - 1, b.dia)) / 86_400_000;
}

/** «13:28» — la hora en Lima, 24 h. */
export function horaLima(iso: string): string {
  const p = parteLima(iso);
  return p ? `${p.hora}:${p.minuto}` : "—";
}

/** «16/9» — día y mes sin ceros de relleno, como ya se ve en el resto de la pantalla. */
export function diaMes(iso: string): string {
  const p = parteLima(iso);
  return p ? `${p.dia}/${p.mes}` : "—";
}

/** «hoy 12:12», «mañana 16:15», «ayer 09:00»; más lejos, «20 sep · 16:15». */
export function diaHora(iso: string, ahoraIso: string): string {
  const p = parteLima(iso);
  const d = diasDeDiferencia(iso, ahoraIso);
  if (!p || d === null) return "—";
  const hora = `${p.hora}:${p.minuto}`;
  if (d === 0) return `hoy ${hora}`;
  if (d === 1) return `mañana ${hora}`;
  if (d === -1) return `ayer ${hora}`;
  return `${p.dia} ${MESES_CORTOS[p.mes - 1]} · ${hora}`;
}

/** «hace 25 min», «hace 1 h», «hace 2 días». */
export function haceTexto(iso: string, ahoraIso: string): string {
  const ms = new Date(ahoraIso).getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 60_000) return "hace un momento";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

/** «en 40 min», «en 2 h 15 min», «en 5 h» — para lo que falta dentro del mismo día. */
export function enTexto(iso: string, ahoraIso: string): string {
  const ms = new Date(iso).getTime() - new Date(ahoraIso).getTime();
  if (Number.isNaN(ms) || ms < 60_000) return "en un momento";
  const total = Math.round(ms / 60_000);
  if (total < 60) return `en ${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h < 24) return h < 3 && m > 0 ? `en ${h} h ${m} min` : `en ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "en 1 día" : `en ${d} días`;
}

export type TonoTiempo = "urgente" | "aviso" | "normal" | "hecho";

export type TextoLlegada = {
  principal: string;
  secundario: string | null;
  /** urgente = me toca y ya pasó la hora · aviso = algo no cuadra pero no depende de mí · normal = viaja bien · hecho = terminó. */
  tono: TonoTiempo;
};

/** El texto de la columna «Llegada estimada». La frase depende de la situación real: un traslado que
 *  ya llegó y quedó con diferencia no debe decir «debía llegar», sino desde cuándo espera revisión. */
export function textoLlegada(
  t: TrasladoLeible & { creadoEn: string; cerradoEn: string | null },
  s: SituacionTraslado,
  ahoraIso: string
): TextoLlegada {
  const eta = t.fechaEstimadaLlegada;

  if (s === "cerrado") {
    return { principal: `Completado ${diaMes(t.cerradoEn ?? t.confirmadoEn ?? t.creadoEn)}`, secundario: null, tono: "hecho" };
  }

  if (s === "con_diferencia" || s === "requiere_revision") {
    const desde = t.confirmadoEn ?? eta ?? t.creadoEn;
    return { principal: `Recibido ${diaHora(desde, ahoraIso)}`, secundario: haceTexto(desde, ahoraIso), tono: "aviso" };
  }

  if (!eta) {
    return {
      principal: "Sin hora estimada",
      secundario: `Enviado ${diaHora(t.creadoEn, ahoraIso)}`,
      tono: s === "requiere_recepcion" ? "urgente" : "normal",
    };
  }

  if (debioLlegar(eta, ahoraIso)) {
    // Si me toca, es un pendiente mío (rojo); si es de otra sede, solo se sigue de cerca (ámbar).
    return { principal: `Debió llegar ${diaHora(eta, ahoraIso)}`, secundario: haceTexto(eta, ahoraIso), tono: s === "requiere_recepcion" ? "urgente" : "aviso" };
  }

  if (s === "requiere_recepcion") {
    // Todavía no pasa la hora estimada, pero alguien ya empezó a registrar lo que llegó.
    const desde = t.confirmadoEn ?? t.creadoEn;
    return { principal: `Recepción iniciada ${diaHora(desde, ahoraIso)}`, secundario: haceTexto(desde, ahoraIso), tono: "urgente" };
  }

  const dias = diasDeDiferencia(eta, ahoraIso) ?? 0;
  const secundario = dias <= 0 ? enTexto(eta, ahoraIso) : dias === 1 ? diaMes(eta) : `en ${dias} días`;
  return { principal: `Llega ${diaHora(eta, ahoraIso)}`, secundario, tono: "normal" };
}

// --- Búsqueda ---------------------------------------------------------------

export type TrasladoBuscable = {
  numero: number;
  ubicacionOrigenNombre: string;
  ubicacionDestinoNombre: string;
  nota: string | null;
  referencias: string[];
  skus: string[];
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Palabras que acompañan a un número sin ser parte de lo que se busca: «traslado 24»,
// «traslado n° 24», «nro. 24». Son las mismas que entiende la búsqueda de Movimientos
// (`fn_movimientos_busqueda`), para que lo que se escribe allí para llegar a un traslado
// valga también acá.
const PALABRAS_DE_RELLENO = new Set(["traslado", "traslados", "#", "n°", "nº", "nro", "nro.", "num", "num.", "numero"]);

/** «Buscar traslado, sede o prenda…»: cada palabra escrita tiene que aparecer en alguna parte del
 *  traslado (sede, nombre de prenda, código, nota). Sin distinguir mayúsculas ni tildes.
 *  Un número corto («2», «#2», «traslado 2», «traslado#2», «n° 2») es el NÚMERO del traslado y solo
 *  ese — si no, «2» traería también el 12 y todo código que lleve un 2. Desde 3 cifras («001») se
 *  busca también dentro de los códigos de prenda. */
export function coincideBusqueda(t: TrasladoBuscable, consulta: string): boolean {
  const palabras = normalizar(consulta)
    // «traslado24», «traslado#24», «n°24», «nro.24» → la palabra y el número por separado.
    .replace(/\b(traslados?|n[°º]|nro\.?|num\.?|numero)(?=[#°º]?\d)/g, "$1 ")
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = normalizar([t.ubicacionOrigenNombre, t.ubicacionDestinoNombre, t.nota ?? "", ...t.referencias, ...t.skus].join(" \n "));
  return palabras.every((p) => {
    if (PALABRAS_DE_RELLENO.has(p)) return true;
    const num = /^#?(\d+)$/.exec(p);
    if (num) return Number(num[1]) === t.numero || (num[1].length >= 3 && pajar.includes(num[1]));
    return pajar.includes(p.replace(/^#/, ""));
  });
}

// ===========================================================================
// Rediseño 2026-09-22 (ADR-0172): traslados vacíos, la insignia de estado, el
// recorrido del detalle y la lectura del conteo. Nada de esto cambia una regla
// de stock: quién confirma, cuándo entra el stock y quién cierra siguen en las
// RPC. Esto solo decide qué se dibuja.
// ===========================================================================

/** Un traslado sin ninguna prenda. La base ya no deja crearlos (`iniciar_traslado` rechaza un traslado
 *  sin ítems), pero en producción quedaron cabeceras vacías de la limpieza de datos de prueba (los
 *  Traslados 1 al 4, 2026-09-22). No se muestran ni se cuentan —nadie tiene que «confirmar» una recepción
 *  de nada—, y tampoco se borran: siguen en la base. */
export function esTrasladoVacio(t: { lineas: number }): boolean {
  return t.lineas === 0;
}

/** Aparta los traslados vacíos y dice cuántos eran, para avisarlo en vez de esconderlos en silencio. */
export function separarVacios<T extends { lineas: number }>(ts: T[]): { conPrendas: T[]; vacios: number } {
  const conPrendas = ts.filter((t) => !esTrasladoVacio(t));
  return { conPrendas, vacios: ts.length - conPrendas.length };
}

export type TonoEstadoTraslado = "rojo" | "ambar" | "pizarra" | "verde" | "neutro";

/** La insignia de estado, en las palabras de quien mira: lo que le TOCA, no el nombre interno.
 *  Rojo solo para lo que ya debió llegar; ámbar para lo que no cuadra; pizarra para lo que viaja
 *  bien; verde para lo terminado. Un cerrado que tuvo diferencia no se pinta de verde: se dice. */
export function estadoTraslado(s: SituacionTraslado, cerradoConDiferencia = false): { texto: string; tono: TonoEstadoTraslado } {
  switch (s) {
    case "requiere_recepcion":
      return { texto: "Por confirmar", tono: "rojo" };
    case "requiere_revision":
      return { texto: "Por revisar", tono: "ambar" };
    case "con_diferencia":
      return { texto: "Con diferencia", tono: "ambar" };
    case "en_camino_entrante":
    case "en_camino_saliente":
      return { texto: "En camino", tono: "pizarra" };
    case "cerrado":
      return cerradoConDiferencia ? { texto: "Cerrado con diferencia", tono: "neutro" } : { texto: "Completado", tono: "verde" };
  }
}

// ---------------------------------------------------------------------------
// La lectura del conteo en el detalle
//
// Quien recibe cuenta línea por línea. Lo que escribe queda como BORRADOR en la
// pantalla hasta que confirma (o cierra, o guarda el recuento): recién ahí se
// llama `registrar_recepcion_traslado` por cada línea cambiada y después la
// RPC final. Antes cada casilla guardaba al salir de ella y el botón de
// confirmar seguía apagado hasta que la persona había pasado por TODAS —
// aunque ya vinieran llenas con lo enviado—; ahora las casillas empiezan
// vacías (se cuenta, no se asume) y un «Coincide» por línea las llena.
// ---------------------------------------------------------------------------

export type LineaConteo = { varianteId: string; cantidadEnviada: number | null; cantidadRecibida: number | null };

/** Lo que la persona escribió y todavía no se guardó, por variante. */
export type Borradores = Record<string, number | undefined>;

export type LecturaLinea = {
  varianteId: string;
  /** Lo que vale la casilla: el borrador si lo hay, si no lo guardado. `null` = sin contar. */
  valor: number | null;
  /** Recibido − enviado (una prenda que no estaba en el envío cuenta desde 0). `null` si no se contó. */
  diferencia: number | null;
};

export type LecturaRecepcion = {
  lineas: Map<string, LecturaLinea>;
  enviado: number;
  recibido: number;
  /** Líneas ENVIADAS que ya tienen cantidad. Las prendas de más no cuentan acá: no hay nada que contarles. */
  contadas: number;
  enviadas: number;
  /** Suma de las diferencias de lo contado: negativo = faltan, positivo = llegó de más. */
  diferencia: number;
  /** Lo que hay que mandar a `registrar_recepcion_traslado` antes de confirmar o cerrar. */
  porGuardar: { varianteId: string; cantidad: number }[];
  /** Toda línea enviada tiene cantidad: se puede confirmar. */
  completa: boolean;
  /** Completa y sin ninguna diferencia: al confirmar, el traslado se cierra solo. */
  coincideTodo: boolean;
};

export function leerRecepcion(lineas: LineaConteo[], borradores: Borradores): LecturaRecepcion {
  const porId = new Map<string, LecturaLinea>();
  const porGuardar: { varianteId: string; cantidad: number }[] = [];
  let enviado = 0;
  let recibido = 0;
  let contadas = 0;
  let enviadas = 0;
  let diferencia = 0;
  let todasCero = true;
  for (const l of lineas) {
    const borrador = borradores[l.varianteId];
    const valor = borrador !== undefined ? borrador : l.cantidadRecibida;
    const dif = valor === null ? null : valor - (l.cantidadEnviada ?? 0);
    porId.set(l.varianteId, { varianteId: l.varianteId, valor, diferencia: dif });
    if (borrador !== undefined && borrador !== l.cantidadRecibida) porGuardar.push({ varianteId: l.varianteId, cantidad: borrador });
    if (l.cantidadEnviada !== null) {
      enviadas++;
      enviado += l.cantidadEnviada;
      if (valor !== null) contadas++;
    }
    if (valor !== null) recibido += valor;
    if (dif !== null) {
      diferencia += dif;
      if (dif !== 0) todasCero = false;
    }
  }
  const completa = contadas === enviadas;
  return { lineas: porId, enviado, recibido, contadas, enviadas, diferencia, porGuardar, completa, coincideTodo: completa && todasCero };
}

/** Una casilla nunca baja de 0: el botón «−» sobre una línea sin contar la deja en 0, no en −1. */
export function ajustarCantidad(actual: number | null, delta: number): number {
  return Math.max(0, (actual ?? 0) + delta);
}

/** Cerrar con diferencia pide decir qué pasó: es lo único que queda para entender, meses después, por qué
 *  faltaron prendas. La RPC acepta la nota vacía; la pantalla no (ver BACKLOG para endurecerlo en la base). */
export const NOTA_CIERRE_MINIMA = 5;
export function notaCierreValida(nota: string): boolean {
  return nota.trim().length >= NOTA_CIERRE_MINIMA;
}

// ---------------------------------------------------------------------------
// El recorrido del detalle: cuatro pasos que SÍ son una secuencia
// (salió → en camino → recibido → cerrado). Cada uno dice cuándo y quién.
// ---------------------------------------------------------------------------

export type EstadoPaso = "hecho" | "actual" | "urgente" | "alerta" | "pendiente";

export type PasoRecorrido = {
  clave: "salio" | "camino" | "recibido" | "cerrado";
  titulo: string;
  lineas: string[];
  estado: EstadoPaso;
};

export type TrasladoConRecorrido = TrasladoLeible & {
  ubicacionOrigenNombre: string;
  ubicacionDestinoNombre: string;
  creadoEn: string;
  cerradoEn: string | null;
  creadoPorNombre: string;
  confirmadoPorNombre: string | null;
  cerradoPorNombre: string | null;
};

export function recorridoTraslado(
  t: TrasladoConRecorrido,
  s: SituacionTraslado,
  conteo: { contadas: number; enviadas: number; huboDiferencia: boolean },
  ahoraIso: string
): PasoRecorrido[] {
  const eta = t.fechaEstimadaLlegada;
  const enTransito = t.estado === "en_transito";
  // «completada» es el modelo anterior (antes del 16-sep): el traslado entraba al instante, sin tramo en camino.
  const instantaneo = t.estado === "completada";
  const conDiferencia = t.estado === "recibido_con_diferencia" || conteo.huboDiferencia;

  const salio: PasoRecorrido = {
    clave: "salio",
    titulo: `Salió de ${t.ubicacionOrigenNombre}`,
    lineas: [diaHora(t.creadoEn, ahoraIso), `Envió ${t.creadoPorNombre}`],
    estado: "hecho",
  };

  let camino: PasoRecorrido;
  if (enTransito && s === "requiere_recepcion") {
    camino = eta
      ? { clave: "camino", titulo: "En camino", lineas: [`Debió llegar ${diaHora(eta, ahoraIso)}`, haceTexto(eta, ahoraIso)], estado: "urgente" }
      : { clave: "camino", titulo: "En camino", lineas: ["Sin hora estimada"], estado: "urgente" };
  } else if (enTransito) {
    camino = eta
      ? { clave: "camino", titulo: "En camino", lineas: [`Llega ${diaHora(eta, ahoraIso)}`, enTexto(eta, ahoraIso)], estado: "actual" }
      : { clave: "camino", titulo: "En camino", lineas: ["Sin hora estimada"], estado: "actual" };
  } else {
    camino = { clave: "camino", titulo: "En camino", lineas: [instantaneo ? "Traslado al instante (modelo anterior)" : eta ? `Estimado ${diaHora(eta, ahoraIso)}` : "Sin hora estimada"], estado: "hecho" };
  }

  const tituloRecibido = `Recibido en ${t.ubicacionDestinoNombre}`;
  let recibido: PasoRecorrido;
  if (enTransito) {
    recibido =
      conteo.contadas > 0
        ? { clave: "recibido", titulo: tituloRecibido, lineas: [`Contando: ${conteo.contadas} de ${conteo.enviadas} variantes`], estado: "actual" }
        : { clave: "recibido", titulo: tituloRecibido, lineas: [s === "en_camino_saliente" ? `Lo confirma ${t.ubicacionDestinoNombre}` : "Falta confirmar"], estado: "pendiente" };
  } else {
    const cuando = t.confirmadoEn ?? t.cerradoEn ?? t.creadoEn;
    const lineas = [diaHora(cuando, ahoraIso)];
    if (t.confirmadoPorNombre) lineas.push(`Contó ${t.confirmadoPorNombre}`);
    if (conDiferencia) lineas.push("Con diferencia");
    recibido = { clave: "recibido", titulo: tituloRecibido, lineas, estado: conDiferencia ? "alerta" : "hecho" };
  }

  let cerrado: PasoRecorrido;
  if (t.estado === "recibido_con_diferencia") {
    cerrado = { clave: "cerrado", titulo: "Cerrado", lineas: [s === "requiere_revision" ? "Te toca cerrarlo" : "Espera a un líder"], estado: "actual" };
  } else if (enTransito) {
    cerrado = { clave: "cerrado", titulo: "Cerrado", lineas: ["Se cierra solo si todo coincide"], estado: "pendiente" };
  } else {
    const lineas = [diaHora(t.cerradoEn ?? t.confirmadoEn ?? t.creadoEn, ahoraIso)];
    lineas.push(t.cerradoPorNombre ? `Cerró ${t.cerradoPorNombre}` : "Stock actualizado");
    cerrado = { clave: "cerrado", titulo: "Cerrado", lineas, estado: "hecho" };
  }

  return [salio, camino, recibido, cerrado];
}
