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
// Lectura operativa de la pantalla Traslados (rediseño 2026-09-18; «por recibir»
// sin reloj desde ADR-0239, 2026-09-26)
//
// La pantalla no lee un traslado por su estado interno («en_transito») sino por
// lo que le TOCA HACER a quien mira. Todo sale de datos que la base ya guarda
// —estado, las dos sedes, la hora estimada, lo contado—; ninguna regla de stock,
// recepción, cierre o anulación vive acá (esas viven en las RPC).
//
// Hasta el 2026-09-26 un traslado que venía hacia mi sede recién «pedía
// recibirse» cuando pasaba la hora que ESTIMÓ quien lo envió. Con la caja en la
// mano, la tienda leía «Nada requiere tu acción» (docs/pantallas/traslados.md,
// hallazgo 2). Ahora todo lo que viene hacia mí es «por recibir», desde que sale:
// la hora estimada queda como dato de la fila («llega mañana 16:15», «atrasado
// desde ayer»), nunca como candado de lo que se puede hacer.
// ===========================================================================

/** Lo mínimo que estas reglas necesitan de un traslado (`TrasladoResumen` lo cumple de sobra). */
export type TrasladoLeible = {
  estado: string;
  ubicacionOrigenId: string;
  ubicacionDestinoId: string;
  fechaEstimadaLlegada: string | null;
  /** Cuándo alguien apretó «Confirmar recepción» (desde ADR-0239 ya no se llena al contar una casilla). */
  confirmadoEn: string | null;
  /** Cerrado, pero lo contado no coincidió con lo enviado (`conteoDelTraslado`). Sin el dato, `false`. */
  cerradoConDiferencia?: boolean;
  /** Cuántas prendas enviadas ya tienen su conteo guardado: la recepción empezó. Sin el dato, 0. */
  lineasContadas?: number;
  /** Cuándo se anuló (estado `anulada`, ADR-0239 D-132). */
  anuladoEn?: string | null;
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
 *  · requiere_recepcion      — viene hacia acá y no se ha recibido: hay que contarlo cuando llegue. No depende de la
 *                              hora estimada (ADR-0239): la caja puede llegar antes, y quien la tiene en la mano tiene
 *                              que ver que le toca.
 *  · requiere_revision       — quedó con diferencia y soy líder de la sede que lo recibió: me toca cerrarlo.
 *                              (Ojo: la RPC dejaría cerrarlo a CUALQUIER líder, no solo al de esa sede; el aviso se
 *                              dirige al líder de la sede que recibió porque es a quien le concierne el stock.
 *                              Si se decide que cualquier líder debe recibir el aviso, se cambia acá y en
 *                              `getTrasladosPorAtender` — no es un cambio de cableado.)
 *  · en_camino_saliente      — salió de acá y la otra sede aún no lo recibe: no me toca, pero se sigue.
 *  · con_diferencia          — quedó con diferencia y espera a otra persona (no soy líder de esa sede).
 *  · cerrado                 — terminó y todo coincidió (cerrada, o «completada» del modelo anterior).
 *  · cerrado_con_diferencia  — terminó, pero faltó o sobró algo: un líder lo cerró con nota. No se pinta de verde.
 *  · anulado                 — quien envió (o un líder) lo anuló antes de que se empezara a contar: el stock volvió
 *                              al origen (ADR-0239 D-132). Es historial, nunca «en tránsito» ni «por recibir».
 * Un estado que no sea ninguno de los conocidos se lee como cerrado. */
export type SituacionTraslado =
  | "requiere_recepcion"
  | "requiere_revision"
  | "en_camino_saliente"
  | "con_diferencia"
  | "cerrado"
  | "cerrado_con_diferencia"
  | "anulado";

/** ¿Ya pasó la hora estimada? Es un DATO de la fila («atrasado desde ayer»), no decide si algo se puede recibir.
 *  Sin hora estimada no se puede prometer que «viene a tiempo»: se lee como «ya debería estar».
 *  `iniciar_traslado` exige la hora, así que un traslado abierto sin ella no debería existir. */
export function debioLlegar(fechaEstimadaLlegada: string | null, ahoraIso: string): boolean {
  if (!fechaEstimadaLlegada) return true;
  return new Date(ahoraIso).getTime() >= new Date(fechaEstimadaLlegada).getTime();
}

export function situacionTraslado(t: TrasladoLeible, ctx: ContextoTraslados): SituacionTraslado {
  const soyDestino = t.ubicacionDestinoId === ctx.miUbicacionId;
  if (t.estado === "anulada") return "anulado";
  if (t.estado === "recibido_con_diferencia") return soyDestino && ctx.puedeCerrarDiferencia ? "requiere_revision" : "con_diferencia";
  if (t.estado !== "en_transito") return t.cerradoConDiferencia ? "cerrado_con_diferencia" : "cerrado";
  return soyDestino ? "requiere_recepcion" : "en_camino_saliente";
}

/** Lo que exige una acción de quien mira, ahora. Alimenta la franja, el filtro «Acción hoy» y el contador del menú. */
export function requiereAccion(s: SituacionTraslado): boolean {
  return s === "requiere_recepcion" || s === "requiere_revision";
}

/** Historial: ya no le pide nada a nadie ni tiene prendas en camino (cerrado, con o sin diferencia, o anulado). */
export function esTerminado(s: SituacionTraslado): boolean {
  return s === "cerrado" || s === "cerrado_con_diferencia" || s === "anulado";
}

/** Los filtros de la lista. Son predicados: un traslado puede caer en varios (uno con diferencia que
 *  me toca revisar cuenta en «Acción hoy» y en «Con diferencia»).
 *  `por_recibir` NO es un chip de la «Vista rápida»: es el atajo de la tarjeta «Por recibir»,
 *  que cuenta solo recepciones y por eso tiene que filtrar solo recepciones — si filtrara «Acción
 *  hoy», un líder con una diferencia pendiente vería «0» en la tarjeta y una fila al tocarla. */
export type FiltroTraslado = "todos" | "abiertos" | "accion" | "en_camino" | "con_diferencia" | "cerrados" | "por_recibir";

/** Los chips de la fila «Vista rápida», en su orden. Rediseño 2026-09-22 (Felipe, demo
 *  `docs/maquetas/traslados-cifras-filtros-2026-09/`, ADR-0175): las cifras que ya tienen tarjeta
 *  —por recibir, enviados en camino, con diferencia— se filtran tocando su TARJETA; los chips solo separan
 *  lo abierto de lo cerrado, así cada número se dice una vez. «Acción hoy» sigue siendo un filtro
 *  válido (lo usa la franja) aunque ya no tenga chip. */
export const FILTROS_TRASLADO: FiltroTraslado[] = ["abiertos", "cerrados", "todos"];

/** Un estado, un nombre en toda la pantalla (hallazgo 16): «Cerrados» junta Cerrado, Cerrado con diferencia y Anulado;
 *  «Por recibir» es la tarjeta, el chip y el botón «Recibir». */
export const ETIQUETA_FILTRO_TRASLADO: Record<FiltroTraslado, string> = {
  todos: "Todos",
  abiertos: "Abiertos",
  accion: "Acción hoy",
  en_camino: "Enviados en camino",
  con_diferencia: "Con diferencia",
  cerrados: "Cerrados",
  por_recibir: "Por recibir",
};

export function coincideFiltro(s: SituacionTraslado, filtro: FiltroTraslado): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "accion":
      return requiereAccion(s);
    case "en_camino":
      // Lo entrante ya no está «en camino» a secas: es «por recibir» (tiene su tarjeta y su filtro).
      return s === "en_camino_saliente";
    case "con_diferencia":
      // También los ya cerrados con diferencia: si no, al cerrarse la pérdida desaparecía de la pantalla (hallazgo 15).
      return s === "con_diferencia" || s === "requiere_revision" || s === "cerrado_con_diferencia";
    case "cerrados":
      return esTerminado(s);
    case "abiertos":
      return !esTerminado(s);
    case "por_recibir":
      return s === "requiere_recepcion";
  }
}

export type ResumenTraslados = {
  /** «Por recibir»: vienen hacia acá y nadie los ha recibido todavía, lleguen cuando lleguen. */
  porRecibir: number;
  /** De esos, los que ya pasaron su hora estimada (o no tenían): el dato «atrasado», no una condición para recibir. */
  porRecibirAtrasados: number;
  /** «Enviados en camino»: salieron de acá y la otra sede aún no los recibe. */
  salientesEnCamino: number;
  /** «Con diferencia»: todo caso donde lo contado no coincidió — pendiente o ya cerrado. */
  conDiferencia: number;
  /** De esos, los que me tocan a mí (soy líder de la sede que los recibió). */
  porRevisar: number;
  /** De esos, los que ya se cerraron (la pérdida o el sobrante quedó registrado con nota). */
  diferenciasCerradas: number;
  /** Recepciones + revisiones que me tocan: franja «Atención hoy», filtro «Acción hoy» y contador del menú. */
  requierenAccion: number;
  /** «Prendas en tránsito»: unidades de los traslados que siguen en camino (entrantes y salientes) — todavía no están
   *  en el stock de ninguna sede. Un traslado con diferencia NO suma: desde ADR-0239 lo que coincidió ya entró al stock
   *  del destino, y lo que no, espera al líder en el destino, no en el camino. */
  unidadesEnTransito: number;
  /** Cuántos traslados siguen en camino (los de `unidadesEnTransito`). */
  enCamino: number;
  /** Cuántos traslados abiertos hay (en camino o con diferencia pendiente). */
  abiertos: number;
  porFiltro: Record<FiltroTraslado, number>;
};

export function resumirTraslados(ts: (TrasladoLeible & { unidadesEnviadas: number })[], ctx: ContextoTraslados): ResumenTraslados {
  const r: ResumenTraslados = {
    porRecibir: 0,
    porRecibirAtrasados: 0,
    salientesEnCamino: 0,
    conDiferencia: 0,
    porRevisar: 0,
    diferenciasCerradas: 0,
    requierenAccion: 0,
    unidadesEnTransito: 0,
    enCamino: 0,
    abiertos: 0,
    porFiltro: { todos: ts.length, abiertos: 0, accion: 0, en_camino: 0, con_diferencia: 0, cerrados: 0, por_recibir: 0 },
  };
  for (const t of ts) {
    const s = situacionTraslado(t, ctx);
    if (s === "requiere_recepcion") {
      r.porRecibir++;
      if (debioLlegar(t.fechaEstimadaLlegada, ctx.ahoraIso)) r.porRecibirAtrasados++;
    }
    if (s === "en_camino_saliente") r.salientesEnCamino++;
    if (s === "requiere_recepcion" || s === "en_camino_saliente") {
      r.enCamino++;
      r.unidadesEnTransito += t.unidadesEnviadas;
    }
    if (s === "requiere_revision") r.porRevisar++;
    if (s === "cerrado_con_diferencia") r.diferenciasCerradas++;
    if (!esTerminado(s)) r.abiertos++;
    // Todos los filtros, no solo los chips: `por_recibir` (el atajo de la tarjeta) también se cuenta.
    for (const f of Object.keys(r.porFiltro) as FiltroTraslado[]) if (f !== "todos" && coincideFiltro(s, f)) r.porFiltro[f]++;
  }
  // La tarjeta «Con diferencia» cuenta EXACTAMENTE lo que filtra (si dice 2, la lista muestra 2).
  r.conDiferencia = r.porFiltro.con_diferencia;
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
 *  Una recepción se ordena por su hora estimada: la que debió llegar antes va primero, y una que todavía viaja
 *  queda detrás de todas las atrasadas (su hora está en el futuro). La fecha de salida (`creadoEn`) es solo el
 *  último recurso: un traslado que salió hace 10 días con hora estimada de hoy lleva menos esperando que uno que
 *  salió ayer y debió llegar hace 36 h. */
function pendienteDesdeMs(t: TrasladoLeible & { creadoEn: string }, s: SituacionTraslado): number {
  // Diferencia: espera desde que se recibió.
  if (s === "requiere_revision" || s === "con_diferencia") return primeraFecha(t.confirmadoEn, t.fechaEstimadaLlegada, t.creadoEn);
  return primeraFecha(t.fechaEstimadaLlegada, t.creadoEn);
}

/** El traslado al que lleva «Revisar ahora»: entre los que me tocan, el que lleva más tiempo esperando. */
export function masUrgente<T extends TrasladoLeible & { creadoEn: string; numero: number }>(ts: T[], ctx: ContextoTraslados): T | null {
  let mejor: T | null = null;
  let mejorClave = Infinity;
  for (const t of ts) {
    const s = situacionTraslado(t, ctx);
    if (!requiereAccion(s)) continue;
    const clave = pendienteDesdeMs(t, s);
    if (mejor === null || clave < mejorClave || (clave === mejorClave && t.numero < mejor.numero)) {
      mejor = t;
      mejorClave = clave;
    }
  }
  return mejor;
}

/** El orden con el que se lee la lista: primero lo que me toca (lo que lleva más tiempo esperando
 *  arriba), luego las diferencias que esperan a otra persona, luego lo que salió de acá (lo que llega
 *  antes, primero) y al final el historial, lo más reciente primero. A igual tiempo, por número. */
export function ordenarTraslados<T extends TrasladoLeible & { creadoEn: string; numero: number }>(ts: T[], ctx: ContextoTraslados): T[] {
  const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : Infinity);
  const clave = (t: T): [number, number, number] => {
    const s = situacionTraslado(t, ctx);
    if (requiereAccion(s)) return [0, pendienteDesdeMs(t, s), t.numero];
    if (s === "con_diferencia") return [1, pendienteDesdeMs(t, s), t.numero];
    if (esTerminado(s)) return [3, -ms(t.creadoEn), -t.numero];
    return [2, ms(t.fechaEstimadaLlegada), t.numero];
  };
  return [...ts].sort((a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
}

/** Qué botón lleva la fila. El fuerte es solo para lo que de verdad pide una intervención; los dos llevan al detalle,
 *  que es donde se cuenta y donde se cierra. */
export function accionDeTraslado(s: SituacionTraslado): { texto: string; principal: boolean } {
  if (s === "requiere_recepcion") return { texto: "Recibir", principal: true };
  if (s === "requiere_revision") return { texto: "Revisar", principal: true };
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

/** Lo que la lista sabe del conteo de un traslado sin abrirlo: cuántas prendas enviadas ya tienen su conteo guardado
 *  y si alguna no coincide con lo enviado. Una prenda que llegó sin estar en el envío cuenta como diferencia (se
 *  compara contra 0), igual que en el detalle. Sale de la MISMA consulta de la lista (`transferencia_recepciones`
 *  embebida): sin una consulta por fila. */
export function conteoDelTraslado(
  enviados: { varianteId: string; cantidad: number }[],
  recibidos: { varianteId: string; cantidadRecibida: number }[]
): { contadas: number; huboDiferencia: boolean } {
  const enviado = new Map<string, number>();
  for (const e of enviados) enviado.set(e.varianteId, (enviado.get(e.varianteId) ?? 0) + e.cantidad);
  let contadas = 0;
  let huboDiferencia = false;
  for (const r of recibidos) {
    if (enviado.has(r.varianteId)) contadas++;
    if (r.cantidadRecibida !== (enviado.get(r.varianteId) ?? 0)) huboDiferencia = true;
  }
  return { contadas, huboDiferencia };
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
 *  ya llegó y quedó con diferencia no debe decir «atrasado», sino desde cuándo espera revisión; uno que viene
 *  hacia acá dice cuándo llega o desde cuándo está atrasado, pero se puede recibir igual (ADR-0239). */
export function textoLlegada(
  t: TrasladoLeible & { creadoEn: string; cerradoEn: string | null },
  s: SituacionTraslado,
  ahoraIso: string
): TextoLlegada {
  const eta = t.fechaEstimadaLlegada;

  if (s === "anulado") {
    return { principal: `Anulado ${diaMes(t.anuladoEn ?? t.cerradoEn ?? t.creadoEn)}`, secundario: null, tono: "normal" };
  }
  if (s === "cerrado" || s === "cerrado_con_diferencia") {
    // Con diferencia no lleva el visto verde: la insignia ya dice qué pasó y un «✓» lo contradiría.
    return { principal: `Cerrado ${diaMes(t.cerradoEn ?? t.confirmadoEn ?? t.creadoEn)}`, secundario: null, tono: s === "cerrado" ? "hecho" : "normal" };
  }

  if (s === "con_diferencia" || s === "requiere_revision") {
    const desde = t.confirmadoEn ?? eta ?? t.creadoEn;
    return { principal: `Recibido ${diaHora(desde, ahoraIso)}`, secundario: haceTexto(desde, ahoraIso), tono: "aviso" };
  }

  const atrasado = debioLlegar(eta, ahoraIso);
  // Me toca y ya pasó la hora: rojo. De otra sede: solo se sigue de cerca (ámbar). A tiempo: sin drama.
  const tonoAtrasado: TonoTiempo = s === "requiere_recepcion" ? "urgente" : "aviso";

  if (s === "requiere_recepcion" && (t.lineasContadas ?? 0) > 0) {
    // Alguien ya guardó conteos: la caja llegó, aunque la hora estimada diga otra cosa. Falta terminar.
    return {
      principal: "Conteo empezado",
      secundario: !eta ? null : atrasado ? `Atrasado desde ${diaHora(eta, ahoraIso)}` : `Llegaba ${diaHora(eta, ahoraIso)}`,
      tono: "urgente",
    };
  }

  if (!eta) {
    return { principal: "Sin hora estimada", secundario: `Enviado ${diaHora(t.creadoEn, ahoraIso)}`, tono: tonoAtrasado };
  }

  if (atrasado) {
    return { principal: `Atrasado desde ${diaHora(eta, ahoraIso)}`, secundario: haceTexto(eta, ahoraIso), tono: tonoAtrasado };
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
// Rediseño 2026-09-22 (ADR-0173): traslados vacíos, la insignia de estado, el
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

export type TonoEstadoTraslado = "rojo" | "ambar" | "pizarra" | "verde" | "neutro" | "apagado";

/** La insignia de estado, en las palabras de quien mira: lo que le TOCA, no el nombre interno.
 *  Rojo para lo que tengo que recibir; ámbar para lo que no cuadra; pizarra para lo que viaja hacia otra sede;
 *  verde para lo terminado sin problemas. Un cerrado que tuvo diferencia no se pinta de verde: se dice. Y un anulado va
 *  «apagado» y tachado, como toda anulación del ERP (`Chip`, Comprobantes).
 *  Un estado, un nombre en toda la pantalla (hallazgo 16): «Por recibir» (tarjeta, chip, botón «Recibir»), «Cerrado»
 *  (nunca «Completado») y «Anulado»; el filtro «Cerrados» junta los tres terminados.
 *  `cerradoConDiferencia` se mantiene para quien todavía pase «cerrado» con el dato aparte (el título del detalle);
 *  lo nuevo pasa la situación `cerrado_con_diferencia` y dice lo mismo. */
export function estadoTraslado(s: SituacionTraslado, cerradoConDiferencia = false): { texto: string; tono: TonoEstadoTraslado } {
  switch (s) {
    case "requiere_recepcion":
      return { texto: "Por recibir", tono: "rojo" };
    case "requiere_revision":
      return { texto: "Por revisar", tono: "ambar" };
    case "con_diferencia":
      return { texto: "Con diferencia", tono: "ambar" };
    case "en_camino_saliente":
      return { texto: "En camino", tono: "pizarra" };
    case "anulado":
      return { texto: "Anulado", tono: "apagado" };
    case "cerrado_con_diferencia":
      return { texto: "Cerrado con diferencia", tono: "neutro" };
    case "cerrado":
      return cerradoConDiferencia ? { texto: "Cerrado con diferencia", tono: "neutro" } : { texto: "Cerrado", tono: "verde" };
  }
}
