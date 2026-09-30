// «Buscó y no había» y «se la probó y no la llevó»: dos señales de lo que una clienta quería y no se llevó, en UNA tabla
// (`pedidos_no_atendidos.motivo`, ADR-0288 D-6; acta CL-7 y CL-14). Lógica pura: la usan «Anotar que no había» (modal de
// talla y Cambios), la lista de Pedidos no atendidos, Inicio, Análisis y —cuando se integre— Cobrar, al quitar una prenda
// del ticket («¿Se la probó y no la llevó?»).
//
// Lo que manda es la base (`registrar_pedido_no_atendido` y los candados `pedidos_no_atendidos_motivo_valido` y
// `pedidos_no_atendidos_razon_solo_si_se_probo`, migración 20260930240000): aquí están los mismos valores, sus textos y
// cómo se arma la llamada, y ninguna regla que la base no tenga. Si la base cambia la lista, cambia aquí también (lo vigila
// se-probo-reglas.test.ts, que lee la migración).

/** El motivo de la fila. Todo lo anotado antes de la tanda 1d quedó `no_habia_talla`. */
export const MOTIVOS_PEDIDO = ["no_habia_talla", "se_probo_no_llevo"] as const;
export type MotivoPedido = (typeof MOTIVOS_PEDIDO)[number];

/** Por qué no la llevó (opcional; solo con `se_probo_no_llevo`). El informe CL-14 las cuenta: por eso son cuatro fijas. */
export const RAZONES_SE_PROBO = ["no_le_quedo", "precio", "color", "lo_piensa"] as const;
export type RazonSeProbo = (typeof RAZONES_SE_PROBO)[number];

/** Cómo se lee cada motivo en pantalla. */
export const TEXTO_MOTIVO: Record<MotivoPedido, string> = {
  no_habia_talla: "Buscó y no había",
  se_probo_no_llevo: "Se la probó y no la llevó",
};

/** Cómo se lee cada razón en su botón, como en el spike aprobado (club-clientas-spike-2026-09): la asesora toca una. */
export const TEXTO_RAZON: Record<RazonSeProbo, string> = {
  no_le_quedo: "No le quedó",
  precio: "Precio",
  color: "Color",
  lo_piensa: "Lo piensa",
};

/** El toque opcional que aparece en Cobrar al quitar una prenda del ticket (ADR-0288 D-6). */
export const PREGUNTA_SE_PROBO = "¿Se la probó y no la llevó?";

/** Las razones en el orden en que se muestran, listas para chips o un combo. */
export const OPCIONES_RAZON: readonly { valor: RazonSeProbo; texto: string }[] = RAZONES_SE_PROBO.map((valor) => ({
  valor,
  texto: TEXTO_RAZON[valor],
}));

export function esMotivoPedido(valor: unknown): valor is MotivoPedido {
  return typeof valor === "string" && (MOTIVOS_PEDIDO as readonly string[]).includes(valor);
}

export function esRazonSeProbo(valor: unknown): valor is RazonSeProbo {
  return typeof valor === "string" && (RAZONES_SE_PROBO as readonly string[]).includes(valor);
}

/**
 * El motivo de una fila leída de la base. Sin la columna (una base todavía sin la tanda 1d) o con un valor que esta web no
 * conoce, es «buscó y no había»: es lo que toda fila fue hasta hoy, y así la pantalla sigue diciendo lo de siempre.
 */
export function leerMotivo(valor: string | null | undefined): MotivoPedido {
  return esMotivoPedido(valor) ? valor : "no_habia_talla";
}

/** La razón de una fila leída de la base: solo existe con `se_probo_no_llevo` (el esquema lo exige igual). */
export function leerRazon(motivo: MotivoPedido, valor: string | null | undefined): RazonSeProbo | null {
  return motivo === "se_probo_no_llevo" && esRazonSeProbo(valor) ? valor : null;
}

/**
 * ¿Cuenta como un pedido que alguien espera? Solo «buscó y no había». Es la regla del aviso «Llegó tu talla» (paso 3) y de
 * las tarjetas de pedidos pendientes de Inicio y Análisis: «se la probó y no la llevó» es demanda para Compras, no un
 * pedido de ella (ADR-0288 D-6, «SE ROMPE SI»).
 */
export function esPedidoDeTalla(motivo: MotivoPedido): boolean {
  return motivo === "no_habia_talla";
}

/** Una línea para la lista: «Se la probó y no la llevó · no le quedó», o solo el motivo si no dijo por qué. */
export function describirMotivo(motivo: MotivoPedido, razon: RazonSeProbo | null): string {
  const base = TEXTO_MOTIVO[motivo];
  return razon ? `${base} · ${TEXTO_RAZON[razon].toLowerCase()}` : base;
}

/** Qué prenda era, en palabras del catálogo: «Blusa Carlita · Blanco». El color es opcional. */
export function descripcionDePrenda(referencia: string, color?: string | null): string {
  return [referencia.trim(), color?.trim()].filter(Boolean).join(" · ");
}

/**
 * El motivo y su razón, juntos: una razón sin «se la probó» no se puede ni escribir (la base la rechaza con
 * `pedido_razon_sin_se_probo`, y aquí el tipo no la deja armar).
 */
export type MotivoConRazon = { motivo: "no_habia_talla" } | { motivo: "se_probo_no_llevo"; razon: RazonSeProbo | null };

/** Lo que la pantalla sabe al anotar. Con el producto del catálogo o con una descripción (la base exige uno de los dos). */
export type DatosPedidoNoAtendido = MotivoConRazon & {
  ubicacionId: string;
  productoId?: string | null;
  descripcion?: string | null;
  talla?: string | null;
  clientaId?: string | null;
};

/** Los parámetros de `registrar_pedido_no_atendido`: lo vacío no se manda (la RPC espera null, nunca `''`). */
export type ArgsRegistrarPedido = {
  p_ubicacion_id: string;
  p_producto_id?: string;
  p_descripcion_libre?: string;
  p_talla?: string;
  p_clienta_id?: string;
  p_motivo: MotivoPedido;
  p_razon?: RazonSeProbo;
};

const oVacio = (texto: string | null | undefined): string | undefined => {
  const limpio = (texto ?? "").trim();
  return limpio === "" ? undefined : limpio;
};

/**
 * Arma la llamada. Devuelve `null` si no hay nada que anotar (ni producto ni descripción): es lo mismo que la base rechaza
 * con «Anota el modelo del catálogo o describe lo que pidió la clienta», y así el botón puede apagarse antes.
 */
export function argsRegistrarPedido(d: DatosPedidoNoAtendido): ArgsRegistrarPedido | null {
  const productoId = oVacio(d.productoId);
  const descripcion = oVacio(d.descripcion);
  if (!productoId && !descripcion) return null;
  const args: ArgsRegistrarPedido = { p_ubicacion_id: d.ubicacionId, p_motivo: d.motivo };
  if (productoId) args.p_producto_id = productoId;
  if (descripcion) args.p_descripcion_libre = descripcion;
  const talla = oVacio(d.talla);
  if (talla) args.p_talla = talla;
  const clientaId = oVacio(d.clientaId);
  if (clientaId) args.p_clienta_id = clientaId;
  if (d.motivo === "se_probo_no_llevo" && d.razon) args.p_razon = d.razon;
  return args;
}

/**
 * El aviso de éxito al anotar: título y detalle, en las palabras de la asesora. El de «se la probó» es el del spike, con el
 * lugar real donde se ve (el spike decía «Clientas ▸ Resumen», una pantalla que todavía no existe).
 */
export function avisoAnotado(motivo: MotivoPedido, descripcion: string, talla: string | null | undefined): { titulo: string; detalle: string } {
  const que = `${descripcion}${talla ? ` · talla ${talla}` : ""}`;
  return motivo === "se_probo_no_llevo"
    ? { titulo: "Anotado: se la probó y no la llevó", detalle: `${que}. Compras y el Taller lo ven en Pedidos no atendidos.` }
    : { titulo: "Anotado: no había", detalle: `${que}. Compras lo verá en Pedidos no atendidos.` };
}

/* ------------------------------------------------------------------
   «¿Se la probó y no la llevó?» en Cobrar (spike del club, 2026-09-30): al quitar una prenda del ticket aparece, justo bajo
   la clienta, una pregunta opcional con las cuatro razones y «No anotar». Tocar una razón la anota (con o sin clienta, con o
   sin venta después) y la pregunta se va; se va también con «No anotar», al pasar a cobrar, al dejar el ticket en espera o
   al retomar otro. Quitar otra prenda la reemplaza por la nueva.
   ------------------------------------------------------------------ */

/** La prenda que se acaba de quitar del ticket: su nombre, y su color y talla si se saben. */
export type PrendaQuitada = { referencia: string; color: string | null; talla: string | null };

/**
 * De la línea quitada del ticket (y lo que el catálogo de la caja sabe de su variante), la prenda de la pregunta. `null` si
 * no hay nombre que anotar. Una «Prenda sin registrar» (ADR-0179) no tiene variante en el catálogo: va con su descripción,
 * sin color ni talla.
 */
export function prendaQuitadaDeLinea(
  linea: { referencia: string; prendaLibre?: unknown },
  detalle?: { color: string | null; talla: string | null } | null
): PrendaQuitada | null {
  const referencia = linea.referencia.trim();
  if (!referencia) return null;
  if (linea.prendaLibre) return { referencia, color: null, talla: null };
  return { referencia, color: detalle?.color?.trim() || null, talla: detalle?.talla?.trim() || null };
}

/** El texto de la pregunta, después de «¿Se la probó y no la llevó?»: «Quitaste «Blusa Carlita» (M). Anótalo para Compras: es opcional.» */
export function textoPrendaQuitada(p: PrendaQuitada): string {
  return `Quitaste «${p.referencia}»${p.talla ? ` (${p.talla})` : ""}. Anótalo para Compras: es opcional.`;
}

/** Lo que se anota al tocar una razón: «se la probó y no la llevó», con la prenda (nombre · color), su talla y la clienta si hay. */
export function datosSeProbo(p: PrendaQuitada, razon: RazonSeProbo, ubicacionId: string, clientaId: string | null | undefined): DatosPedidoNoAtendido {
  return {
    ubicacionId,
    motivo: "se_probo_no_llevo",
    razon,
    descripcion: descripcionDePrenda(p.referencia, p.color),
    talla: p.talla,
    clientaId: clientaId ?? null,
  };
}
