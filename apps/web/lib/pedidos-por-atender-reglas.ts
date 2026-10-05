// Pedidos entre sedes que esperan respuesta (ADR-0328, actividad 17; Felipe 2026-10-04): «"Te piden" lleva número en el
// menú desde que llega el pedido y, a las 48 h sin respuesta, aviso a los líderes de las dos tiendas».
//
// La base da una fila por pedido para un cliente y una por grupo de reposición, solo los que siguen «pedido»
// (`fn_pedidos_por_atender`, migración 20261005100100). Aquí, sin React ni Supabase (se prueba en
// `pedidos-por-atender-reglas.test.ts`), se decide:
//   · cuántos le piden a la sede (el número del menú: `numeroDelMenuTraslados`, sumado a los traslados por recibir);
//   · cuáles llevan 48 h o más sin respuesta, de los dos lados (el Inicio de los líderes de las dos sedes y el Observatorio);
//   · a quién le avisa el Inicio (decisión del 2026-10-04): a los líderes cuya sede es una de las dos del pedido.
// «Sin respuesta» = la sede a la que le pidieron todavía no lo envió ni dijo «No la tengo»: mientras sigue «pedido».

export type DireccionPorAtender = "pedi" | "me_piden";

export type FilaPorAtender = {
  /** El pedido (para un cliente) o su grupo (reposición). */
  id: string;
  direccion: DireccionPorAtender;
  conCliente: boolean;
  /** Cuándo se pidió (el más antiguo del grupo). */
  creadoEn: string;
  /** La otra sede: a la que pedí (pedi) o la que me pide (me_piden). */
  otraSede: string;
  otraSedeId: string;
  prendas: number;
};

/** Las horas que se esperan antes de avisar a los líderes de las dos tiendas (Felipe, 2026-10-04). */
export const HORAS_SIN_RESPUESTA = 48;

const HORA_MS = 3_600_000;

/** Una fila de `fn_pedidos_por_atender` → la que usan las reglas. Una fila rota (sin id o sin hora) no se cuenta. */
export function filaPorAtenderDeFila(f: Record<string, unknown>): FilaPorAtender | null {
  const id = typeof f.id === "string" ? f.id : "";
  const creadoEn = typeof f.created_at === "string" ? f.created_at : "";
  if (!id || Number.isNaN(Date.parse(creadoEn))) return null;
  return {
    id,
    direccion: f.direccion === "me_piden" ? "me_piden" : "pedi",
    conCliente: f.con_cliente === true,
    creadoEn,
    otraSede: String(f.otra_sede ?? ""),
    otraSedeId: String(f.otra_sede_id ?? ""),
    prendas: Math.max(0, Number(f.prendas ?? 0)),
  };
}

/** El número de «Te piden» en el menú: lo que OTRAS sedes le pidieron a esta y todavía no sale. */
export function contarTePiden(filas: readonly FilaPorAtender[]): number {
  return filas.filter((f) => f.direccion === "me_piden").length;
}

/**
 * El número junto a «Traslados» en el menú y en el aviso «Traslados» del Inicio: lo que llega por recibir más lo que otras
 * sedes le piden a esta («Te piden»: un pedido para un cliente o un grupo de reposición valen 1 cada uno).
 * PROMETE: `null` solo si no se pudo leer lo que llega (sin eso no hay número honesto); si falla la lectura de los pedidos,
 * sale solo con lo que llega. ASUME: `porRecibir` es `getTrasladosPorAtender` (solo el destino). Conteo («recíbelos
 * primero») y Caja («traslados por recibir») usan ese número SOLO: un pedido que hay que ENVIAR no se «recibe primero».
 */
export function numeroDelMenuTraslados(porRecibir: number | null, pedidos: readonly FilaPorAtender[] | null): number | null {
  if (porRecibir === null) return null;
  return porRecibir + (pedidos ? contarTePiden(pedidos) : 0);
}

/** Horas enteras desde que se pidió (nunca negativas: un reloj adelantado no da «hace −1 h»). */
export function horasEsperando(creadoEn: string, ahoraIso: string): number {
  return Math.max(0, Math.floor((Date.parse(ahoraIso) - Date.parse(creadoEn)) / HORA_MS));
}

export type SinRespuesta = {
  /** Lo que me pidieron hace 48 h o más y todavía no envié ni respondí. */
  tePiden: FilaPorAtender[];
  /** Lo que pedí hace 48 h o más y la otra sede todavía no responde. */
  pediste: FilaPorAtender[];
  /** Horas del más antiguo de los dos lados; null si no hay ninguno. */
  horasMasAntiguo: number | null;
};

/**
 * ¿El Inicio de esta cuenta lleva el aviso de 48 h de la sede que está mirando? (Decisión del 2026-10-04: «a los líderes de
 * las DOS sedes, los que tienen esa sede, y al Observatorio del Admin».) Solo un líder, y solo en el Inicio de SU sede (la
 * de partida): el de Trujillo y el de Arequipa ven el pedido Trujillo ↔ Arequipa; el de Lima no, aunque se pare en Trujillo
 * con el selector (ese aviso ya les llega a los de Trujillo). En CAYLA Global la sede mirada sigue siendo la propia. El
 * Admin los ve todos, de toda la red, en el Observatorio (`sinRespuestaEnLaRed`).
 */
export function leAvisaSinRespuesta(cuenta: { esLider: boolean; sedePropiaId: string | null }, sedeMirada: string): boolean {
  return cuenta.esLider && !!cuenta.sedePropiaId && cuenta.sedePropiaId === sedeMirada;
}

/** Los pedidos que llevan `horas` (48) o más sin respuesta, de los dos lados, el más antiguo primero. */
export function pedidosSinRespuesta(filas: readonly FilaPorAtender[], ahoraIso: string, horas = HORAS_SIN_RESPUESTA): SinRespuesta {
  const viejos = filas
    .filter((f) => horasEsperando(f.creadoEn, ahoraIso) >= horas)
    .sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn));
  return {
    tePiden: viejos.filter((f) => f.direccion === "me_piden"),
    pediste: viejos.filter((f) => f.direccion === "pedi"),
    horasMasAntiguo: viejos.length ? horasEsperando(viejos[0].creadoEn, ahoraIso) : null,
  };
}

/** «hace 50 h» hasta 72 h; después, en días («hace 4 días»). Nunca «hace 0 h». */
export function textoEspera(horas: number): string {
  if (horas < 1) return "hace un momento";
  if (horas < 72) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} días`;
}

/** Lo que dice la fila de un pedido que sigue esperando: «Espera hace 5 h», o, pasadas las 48 h, «Sin respuesta hace 50 h»
 *  (ese es el que avisa a los líderes). */
export function esperaVisible(creadoEn: string, ahoraIso: string): { texto: string; tarde: boolean } {
  const h = horasEsperando(creadoEn, ahoraIso);
  const tarde = h >= HORAS_SIN_RESPUESTA;
  return { texto: `${tarde ? "Sin respuesta" : "Espera"} ${textoEspera(h)}`, tarde };
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * El detalle del aviso del Inicio: primero lo que esta sede debe (le pidieron y no respondió), después lo que espera.
 * Ej.: «Arequipa te pidió hace 50 h y nadie respondió · Tu pedido a Lima lleva 3 días sin respuesta».
 */
export function textoSinRespuesta(s: SinRespuesta, ahoraIso: string): string {
  const partes: string[] = [];
  if (s.tePiden.length === 1) {
    const f = s.tePiden[0];
    partes.push(`${f.otraSede} te pidió ${textoEspera(horasEsperando(f.creadoEn, ahoraIso))}${f.conCliente ? " para un cliente" : ""} y nadie respondió`);
  } else if (s.tePiden.length > 1) {
    partes.push(`${s.tePiden.length} pedidos que te hicieron siguen sin respuesta`);
  }
  if (s.pediste.length === 1) {
    const f = s.pediste[0];
    partes.push(`Tu pedido a ${f.otraSede} lleva ${textoEspera(horasEsperando(f.creadoEn, ahoraIso)).replace(/^hace /, "")} sin respuesta`);
  } else if (s.pediste.length > 1) {
    partes.push(`${s.pediste.length} pedidos tuyos siguen sin respuesta`);
  }
  return partes.length ? `${partes.join(" · ")}.` : `Ningún pedido entre sedes lleva ${HORAS_SIN_RESPUESTA} h sin respuesta.`;
}

/** La frase de «Sigue ahora»: lo que toca hacer, en una línea. Vacía si no hay nada. */
export function ahoraSinRespuesta(s: SinRespuesta): string {
  const n = s.tePiden.length + s.pediste.length;
  if (n === 0) return "";
  if (s.tePiden.length > 0) return `Responde ${s.tePiden.length} ${plural(s.tePiden.length, "pedido de otra sede", "pedidos de otras sedes")}`;
  return `Pregunta por ${n} ${plural(n, "pedido", "pedidos")} que no responden`;
}

/**
 * La misma cuenta para TODA la empresa (Observatorio del Admin), a partir de lo que leyó cada tienda. Cada pedido aparece
 * dos veces (una por sede); se cuenta UNA vez, desde la sede a la que le pidieron («me_piden»), y en el reparto por tienda
 * suma a las DOS sedes: a las dos les toca.
 */
export function sinRespuestaEnLaRed(
  porTienda: readonly { tiendaId: string; filas: readonly FilaPorAtender[] }[],
  ahoraIso: string,
  horas = HORAS_SIN_RESPUESTA,
): { pedidos: (FilaPorAtender & { origenId: string; horas: number })[]; porTienda: Record<string, number> } {
  const vistos = new Set<string>();
  const pedidos: (FilaPorAtender & { origenId: string; horas: number })[] = [];
  for (const t of porTienda) {
    for (const f of t.filas) {
      if (f.direccion !== "me_piden" || vistos.has(f.id)) continue;
      const h = horasEsperando(f.creadoEn, ahoraIso);
      if (h < horas) continue;
      vistos.add(f.id);
      pedidos.push({ ...f, origenId: t.tiendaId, horas: h });
    }
  }
  pedidos.sort((a, b) => b.horas - a.horas);
  const reparto: Record<string, number> = {};
  for (const p of pedidos) {
    for (const id of [p.origenId, p.otraSedeId]) if (id) reparto[id] = (reparto[id] ?? 0) + 1;
  }
  return { pedidos, porTienda: reparto };
}
