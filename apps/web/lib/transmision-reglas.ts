// Reglas puras de la ruta que transmite un comprobante a SUNAT (`app/api/lucode/emitir/route.ts`): sin
// Supabase ni Lucode, para poder probarlas sin levantar nada. Lo que se transmite no se deshace, así
// que todo lo que pueda frenarlo se decide ANTES de llamar a Lucode, acá.

export type ComprobanteParaTransmitir = {
  /** `nota_venta` nunca se transmite (ADR-0164). Ausente = se decide solo por el estado. */
  tipo?: string;
  estado: string;
  /** La venta de la que salió; `null` en un comprobante manual o una nota (no nacen de una venta). */
  venta_id: string | null;
  /** Lo que se pudo leer de esa venta; `null` si no se pudo leer (RLS o un fallo). */
  venta: { estado: string } | null;
  /** Separaciones (ADR-0166): el comprobante es el ANTICIPO de una separación… */
  es_anticipo?: boolean;
  /** …o el final que DEDUCE un anticipo (monto > 0). PostgREST puede mandar el numeric como texto. */
  anticipo_deducido?: number | string | null;
};

export type NoSePuedeTransmitir = { error: string; status: 409 | 503 };

/** Por qué un comprobante NO se puede transmitir ahora, o `null` si sí. Solo se transmiten los
 *  `pendiente` (nunca salieron), los `pendiente_reintento` (Lucode no respondió y esperan en la cola,
 *  D-60) y los `rechazado` (su único camino es reintentar, ADR-0093). Y nunca el
 *  de una venta ANULADA: se le devolvió el dinero a la clienta y sus prendas volvieron al stock, así que
 *  declararla a SUNAT sería declarar una venta que no existe. `anular_venta` ya libera el pendiente de
 *  la venta que anula (`20260921121500`); esto cubre el que sigue vivo (un `rechazado`) y cualquier
 *  base que aún no tenga esa migración. Si la venta existe pero no se pudo leer —o llegó sin `estado`:
 *  el `select` perdió el embebido, o PostgREST cambió su forma—, se niega y se pide reintentar: ante la
 *  duda no se declara nada (falla cerrada; `undefined` o un arreglo no pasan por «venta viva»). */
export function motivoParaNoTransmitir(c: ComprobanteParaTransmitir): NoSePuedeTransmitir | null {
  // La nota de venta es un documento interno: la base ya la hace nacer «interna» (nunca pendiente), y esto
  // la frena otra vez por tipo por si algún día cambia su estado.
  if (c.tipo === "nota_venta") {
    return { error: "Una nota de venta es un documento interno: no se transmite a SUNAT.", status: 409 };
  }
  // Un anticipo y el comprobante que lo deduce llevan campos propios en SUNAT (tipo de operación y la
  // deducción con referencia al anticipo) que `lib/lucode.ts` todavía no arma: mandados como una boleta
  // común, el final llegaría con líneas que suman el total y un importe que es solo el saldo. Se frenan
  // hasta probarlos en el sandbox de Lucode (ADR-0166). La venta y la boleta ya quedaron registradas.
  if (c.es_anticipo === true || Number(c.anticipo_deducido ?? 0) > 0) {
    return {
      error: "Este comprobante es de una separación (anticipo): su envío a SUNAT se activa cuando se pruebe con Lucode. Queda registrado y pendiente.",
      status: 409,
    };
  }
  if (c.estado !== "pendiente" && c.estado !== "pendiente_reintento" && c.estado !== "rechazado") {
    return { error: `Este comprobante ya está en estado "${c.estado}" — no se vuelve a transmitir.`, status: 409 };
  }
  if (c.venta_id !== null && typeof c.venta?.estado !== "string") {
    return { error: "No se pudo comprobar si la venta de este comprobante sigue vigente. Reintenta.", status: 503 };
  }
  if (c.venta?.estado === "anulada") {
    return { error: "La venta de este comprobante está anulada: no se transmite a SUNAT una venta que ya se devolvió.", status: 409 };
  }
  return null;
}

/** Si un fallo de Lucode (red, proveedor, credenciales: nunca un rechazo de SUNAT) debe mandar el
 *  comprobante a la cola de reintento. Solo lo que aún no salió: un `rechazado` ya tiene respuesta de
 *  SUNAT y `fn_marcar_reintento_transmision` lo niega. */
export function vaALaColaDeReintento(estado: string): boolean {
  return estado === "pendiente" || estado === "pendiente_reintento";
}

export type ItemLucode = { descripcion: string; cantidad: number; precio_unitario: number };

const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Los `variante_id` que hay que nombrar para transmitir: los ítems de una venta no traen descripción. */
export function variantesPorNombrar(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((it) => (typeof it?.descripcion !== "string" && typeof it?.variante_id === "string" ? [it.variante_id] : []));
}

/** Los ítems de `comprobantes.items` en la forma que Lucode espera, o `null` si alguno no sirve.
 *  Llegan de dos formas: el comprobante manual trae `{descripcion, cantidad, precio_unitario}` con el
 *  precio YA sin IGV (ADR-0009); el de una venta (`registrar_venta`) trae
 *  `{variante_id, cantidad, precio_unitario, descuento_unitario}` con el precio de etiqueta CON IGV y el
 *  descuento aparte. Para ese, la descripción sale de `nombres` y el valor unitario es
 *  (precio − descuento) / 1,18 con 6 decimales: así Σ valor × 1,18 × cantidad vuelve al total cobrado,
 *  que es el que `registrar_venta` calculó y el que se declara. Sin nombre para una variante → `null`:
 *  no se declara a SUNAT una línea que no se sabe qué es. */
export function itemsParaLucode(raw: unknown, nombres: ReadonlyMap<string, string>): ItemLucode[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: ItemLucode[] = [];
  for (const it of raw) {
    if (typeof it !== "object" || it === null || !esNumero(it.cantidad) || !esNumero(it.precio_unitario)) return null;
    if (typeof it.descripcion === "string") {
      items.push({ descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: it.precio_unitario });
      continue;
    }
    const nombre = typeof it.variante_id === "string" ? nombres.get(it.variante_id) : undefined;
    const descuento = it.descuento_unitario === undefined ? 0 : it.descuento_unitario;
    if (!nombre || !esNumero(descuento)) return null;
    items.push({ descripcion: nombre, cantidad: it.cantidad, precio_unitario: Math.round(((it.precio_unitario - descuento) / 1.18) * 1e6) / 1e6 });
  }
  return items;
}

const ERROR_LEGIBLE: Record<string, string> = {
  sin_respuesta: "Lucode no respondió (sin internet o el servicio está caído).",
  sin_credenciales: "Falta configurar la conexión con Lucode en el servidor.",
  credenciales_invalidas: "Lucode rechazó la clave de conexión: hay que renovarla.",
  rechazado_por_lucode: "Lucode no aceptó el envío",
};

/** El último error de la cola en palabras de tienda. En la base queda crudo (`motivo: detalle`, lo que
 *  escribe `transmitirComprobante`) para diagnosticar; en pantalla, qué pasó y a quién le toca. Un
 *  motivo desconocido se muestra tal cual: mejor el texto técnico que ninguno. */
export function errorDeColaLegible(crudo: string | null): string | null {
  if (!crudo) return null;
  const [motivo, ...resto] = crudo.split(": ");
  const legible = ERROR_LEGIBLE[motivo];
  if (!legible) return crudo;
  return motivo === "rechazado_por_lucode" && resto.length > 0 ? `${legible}: ${resto.join(": ")}` : legible;
}
