/**
 * El combo «Responsable» (ADR-0161, ADR-0162) — la parte pura, sin React ni red, para probarla sola.
 *
 * EL PROBLEMA. Una cuenta compartida (la terminal de TRU, o la sesión de un líder abierta en el mostrador) dice
 * QUÉ TIENDA hizo algo, no QUÉ PERSONA. Si falta plata en la caja o alguien ajusta stock a mano, «Terminal Ventas
 * TRU» no ayuda a reconstruir nada. Por eso toda acción que GUARDA en la operación de tienda pide elegir quién la
 * hace, y la base valida que esa persona esté presente ahora en la tienda (`fn_actor_persona_id`).
 *
 * LAS REGLAS (Felipe, 2026-09-22 — no se cambian aquí):
 *  · Solo se elige entre quienes están `presente` en la sede activa según `fn_asesoras_de_turno`. En pausa se
 *    muestra deshabilitada; `salio` y `programada` no aparecen.
 *  · Solo el nombre, sin PIN.
 *  · Qué trae elegido al abrir (Felipe, 2026-09-22, segunda vuelta — `responsableInicial`):
 *      – sesión de una PERSONA: ya viene elegida ella misma, si está presente en la sede (si no marcó entrada, vacío);
 *      – sesión de una TERMINAL: vacío siempre — el aparato no es nadie;
 *      – Punto de venta: vacío siempre, también para una persona — quien atiende a la clienta puede no ser quien abrió
 *        la sesión en el mostrador.
 *  · Si no hay nadie presente, la operación se bloquea — sin «Otra persona» —, también para un líder.
 *  · Después de guardar vuelve a como vino al abrir (elegida la persona de la sesión, o vacío).
 *
 * CÓMO VIAJA. En encabezados de la petición (`x-responsable`, `x-ubicacion` y, en la venta sin conexión,
 * `x-momento`), no como un parámetro nuevo en ~40 funciones (ADR-0161 §2: cambiar firmas deja sobrecargas vivas,
 * ADR-0026). La base los lee con `current_setting('request.headers')`.
 */

/** Una fila de `fn_asesoras_de_turno`: la asistencia de hoy según Dynamic. */
export type FilaDeTurno = {
  persona_id: string;
  nombre_corto: string;
  estado_ahora: string; // 'presente' | 'en_pausa' | 'salio' | 'programada'
  es_de_esta_sede: boolean;
};

/** Alguien que se muestra en el combo. `personaId` y `nombre` calzan con `Vendedora` (el papel del ticket). */
export type PersonaDeTurno = { personaId: string; nombre: string; enPausa: boolean; deOtraSede: boolean };

export type ListaResponsable = {
  /** Las que se pueden elegir: presentes ahora. */
  elegibles: PersonaDeTurno[];
  /** Marcaron salida a almuerzo o trámite: se ven, deshabilitadas (spike, pantalla 2). */
  enPausa: PersonaDeTurno[];
  /** Cuántas ya marcaron su salida del día: no aparecen, solo se cuentan. */
  salieron: number;
};

export const LISTA_VACIA: ListaResponsable = { elegibles: [], enPausa: [], salieron: 0 };

function aPersona(f: FilaDeTurno): PersonaDeTurno {
  return { personaId: f.persona_id, nombre: f.nombre_corto, enPausa: f.estado_ahora === "en_pausa", deOtraSede: !f.es_de_esta_sede };
}

/**
 * Quién sale en el combo. A diferencia de la fila «Atendió» del ADR-0163, aquí NO hay respaldo de «si nadie marcó,
 * salen todas las de la sede»: la regla del ADR-0161 (A4) es bloquear. Tampoco se ofrece a quien está en pausa
 * (decidido 2026-09-22: en pausa no firma) ni a quien solo está `programada` (todavía no marcó entrada).
 */
export function listaResponsable(filas: readonly FilaDeTurno[]): ListaResponsable {
  return {
    elegibles: filas.filter((f) => f.estado_ahora === "presente").map(aPersona),
    enPausa: filas.filter((f) => f.estado_ahora === "en_pausa").map(aPersona),
    salieron: filas.filter((f) => f.estado_ahora === "salio").length,
  };
}

/**
 * El elegido, solo si sigue siendo elegible. La lista se relee cada minuto: si la persona elegida marcó pausa o
 * salida con el formulario abierto, deja de contar y hay que volver a elegir (nunca se firma con alguien ausente).
 */
export function responsableVigente(lista: ListaResponsable, elegidoId: string | null): string | null {
  if (!elegidoId) return null;
  return lista.elegibles.some((p) => p.personaId === elegidoId) ? elegidoId : null;
}

/**
 * A quién se toma como elegido: lo que la persona tocó en el combo o, si todavía no tocó nada (`undefined`), el
 * propuesto — quien inició sesión, o `null` en una terminal y en el Punto de venta. Luego `responsableVigente` lo
 * descarta si no está presente: nunca se propone a alguien que no marcó entrada.
 */
export function responsableInicial(tocado: string | null | undefined, propuesto: string | null): string | null {
  return tocado === undefined ? propuesto : tocado;
}

/**
 * En qué punto está el combo:
 *  · `cargando`   — todavía no llegó la primera lectura.
 *  · `sin_lectura`— la lectura falló y no hay una lista buena anterior: no se puede elegir a nadie.
 *  · `nadie`      — se leyó y no hay nadie presente: la operación se bloquea (A4, A5, A9).
 *  · `falta`      — hay a quién elegir y todavía no se eligió.
 *  · `listo`      — hay un responsable vigente.
 */
export type EstadoCombo = "cargando" | "sin_lectura" | "nadie" | "falta" | "listo";

export function estadoCombo(v: { cargo: boolean; fallo: boolean; lista: ListaResponsable; elegidoId: string | null }): EstadoCombo {
  if (!v.cargo) return v.fallo ? "sin_lectura" : "cargando";
  if (v.lista.elegibles.length === 0) return "nadie";
  return responsableVigente(v.lista, v.elegidoId) ? "listo" : "falta";
}

/**
 * La frase corta que explica por qué el botón de guardar está apagado (debajo del botón, o en su `title`).
 * `null` cuando el responsable ya no bloquea nada.
 */
export function motivoSinResponsable(estado: EstadoCombo, sede: string): string | null {
  switch (estado) {
    case "listo":
      return null;
    case "falta":
      return "Elige quién está atendiendo.";
    case "nadie":
      return `Nadie de turno en ${sede}: marca tu entrada en el kiosco para poder guardar.`;
    case "sin_lectura":
      return "No se pudo leer quién está de turno. Toca «Actualizar lista».";
    case "cargando":
      return "Leyendo quién está de turno…";
  }
}

// ---- Encabezados ------------------------------------------------------------------------------------------------

export const ENCABEZADO_RESPONSABLE = "x-responsable";
export const ENCABEZADO_UBICACION = "x-ubicacion";
export const ENCABEZADO_MOMENTO = "x-momento";

/** Quién firma, en qué tienda y (solo la venta sin conexión) a qué hora pasó. */
export type Firma = { responsableId: string; ubicacionId: string; momento?: string | null };

/** Los encabezados que lee `fn_actor_persona_id`. `x-momento` solo si hay momento (ISO 8601). */
export function encabezadosResponsable(f: Firma): Record<string, string> {
  const enc: Record<string, string> = {
    [ENCABEZADO_RESPONSABLE]: f.responsableId,
    [ENCABEZADO_UBICACION]: f.ubicacionId,
  };
  if (f.momento) enc[ENCABEZADO_MOMENTO] = f.momento;
  return enc;
}

/**
 * Pone la firma en una consulta de supabase-js (`.rpc(...)`, `.from(...).insert(...)`): el único lugar que sabe
 * cómo se mandan los encabezados. Sin firma, la consulta sale igual que antes — la base decide si la acepta (hoy,
 * `fn_exige_responsable()` es falso para personas y verdadero siempre para terminales).
 */
export function firmar<C extends { setHeader(nombre: string, valor: string): C }>(consulta: C, firma: Firma | null): C {
  if (!firma) return consulta;
  let c = consulta;
  for (const [nombre, valor] of Object.entries(encabezadosResponsable(firma))) c = c.setHeader(nombre, valor);
  return c;
}

/**
 * Del lado del servidor (una ruta `/api/*` que recibe el `fetch` del navegador): la firma que mandó la pantalla,
 * para reenviarla a la base. `null` si no vino — la ruta sigue funcionando como antes.
 */
export function firmaDeEncabezados(encabezados: { get(nombre: string): string | null }): Firma | null {
  const responsableId = encabezados.get(ENCABEZADO_RESPONSABLE)?.trim();
  const ubicacionId = encabezados.get(ENCABEZADO_UBICACION)?.trim();
  if (!responsableId || !ubicacionId) return null;
  const momento = encabezados.get(ENCABEZADO_MOMENTO)?.trim() || null;
  return { responsableId, ubicacionId, momento };
}

// ---- Errores de la base ------------------------------------------------------------------------------------------

/** La forma del error de supabase-js, sin acoplarnos a su tipo (misma que `ErrorEscritura`). */
type ErrorBase = { message?: string | null; code?: string | null; hint?: string | null } | null | undefined;

/** Los `hint` con que `fn_actor_persona_id` (20260923010000) explica un 42501. Son el contrato estable. */
export const HINTS_RESPONSABLE = ["responsable_requerido", "responsable_no_presente", "responsable_sin_acceso", "ubicacion_requerida"] as const;
export type HintResponsable = (typeof HINTS_RESPONSABLE)[number];

function hintDe(error: ErrorBase): HintResponsable | null {
  if (!error || error.code !== "42501" || !error.hint) return null;
  return (HINTS_RESPONSABLE as readonly string[]).includes(error.hint) ? (error.hint as HintResponsable) : null;
}

/** ¿La base rechazó la operación por el responsable (o por la hora de la venta sin conexión)? */
export function esErrorDeResponsable(error: ErrorBase): boolean {
  return mensajeErrorResponsable(error) !== null;
}

/**
 * El rechazo de la base, dicho para quien está en el mostrador: qué pasó y qué hacer. `null` si el error no es del
 * responsable (entonces lo traduce el resto de `traducirError`).
 */
export function mensajeErrorResponsable(error: ErrorBase): string | null {
  switch (hintDe(error)) {
    case "responsable_requerido":
      return "Falta elegir quién está atendiendo. Elígelo en «Responsable» y vuelve a intentar.";
    case "responsable_no_presente":
      return "Esa persona ya no figura de turno en esta tienda (marcó su salida o salió a una pausa). Actualiza la lista y elige a quien está presente.";
    case "responsable_sin_acceso":
      return "Esa persona no tiene acceso a retail. Elige a otra, o pídele a un líder que la agregue en Colaboradores.";
    case "ubicacion_requerida":
      return "No se pudo confirmar la tienda de esta operación. Recarga la pantalla y vuelve a intentar.";
    case null:
      break;
  }
  if (!error) return null;
  // `x-momento` fuera de la ventana de 7 días (o con formato roto): solo lo manda la venta sin conexión.
  if (error.code === "22007" && /hora de la operaci[oó]n/i.test(error.message ?? "")) {
    return "Esta venta sin conexión tiene una hora que la base no acepta (más de 7 días atrás, o en el futuro). Anótala a mano y avisa a un líder.";
  }
  if (error.code === "22P02" && /responsable enviado/i.test(error.message ?? "")) {
    return "El responsable elegido no es válido. Vuelve a elegirlo y guarda otra vez.";
  }
  return null;
}
