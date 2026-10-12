// Órdenes de compra (ADR-0362, fase 1): las reglas puras de la lista. Se importa desde el servidor y desde el cliente.
//
//   PROMETE: cómo se escribe el número de una orden («OC-000012»), qué dice cada estado y leer la respuesta de `fn_ordenes_compra`
//   sin confiar en su forma (la web puede publicarse antes que la migración: una fila rara se descarta, no tumba la pantalla).
//   NO HACE: no habla con la base (eso es `ordenes-compra.ts`) ni decide permisos (los decide la función, con el módulo).

import type { TonoChip } from "@/components/ui/Chip";
import type { MarcaOpcion, ProveedorOpcion, Vinculo } from "./marcas";

export const RPC_LISTA_ORDENES = "fn_ordenes_compra";
/** Vista previa del número de la próxima orden (no lo gasta). Empieza con `fn_`: lectura, no abre el loader (`espera-reglas.ts`). */
export const RPC_SIGUIENTE_ORDEN = "fn_ordenes_compra_siguiente";
export const RPC_CREAR_ORDEN = "crear_orden_compra";
export const RPC_EDITAR_ORDEN = "editar_orden_compra";
export const RPC_ANULAR_ORDEN = "anular_orden_compra";
/** Registrar el comprobante (la factura, boleta o nota de venta) de una orden generada (fase 2, actividad 3). */
export const RPC_REGISTRAR_COMPROBANTE = "registrar_comprobante_orden";
/** Anular el comprobante de una orden es anular la compra: la misma función que usa Facturas de proveedor. */
export const RPC_ANULAR_COMPROBANTE = "anular_compra";
/** Enviar lo de una orden a una sede (una guía, una sede) y anular un envío que sigue en camino (fase 3, `20261012225000_compras_envios`). */
export const RPC_CREAR_ENVIO = "crear_envio";
export const RPC_ANULAR_ENVIO = "anular_envio";
/** Un envío tal como lo ve la sede y quien lo anula: cabecera y líneas. Empieza con `fn_`: lectura, no abre el loader (`espera-reglas.ts`). */
export const RPC_DETALLE_ENVIO = "fn_envio_detalle";
/** Las órdenes generadas con algo por enviar: el número y el filtro «Por enviar» de la lista. Empieza con `fn_`: lectura, no abre el loader. */
export const RPC_ORDENES_POR_ENVIAR = "fn_ordenes_compra_por_enviar";

/** Hasta cuántas letras lleva el motivo de una anulación (el mismo tope que `anular_orden_compra`). */
export const MAX_MOTIVO_ANULACION = 300;

/** Lo que le falta al motivo de una anulación, o null si está bien (las reglas de `anular_orden_compra`). */
export function problemaDeMotivo(motivo: string): string | null {
  const limpio = motivo.trim();
  if (!limpio) return "Escribe por qué se anula la orden.";
  if (limpio.length > MAX_MOTIVO_ANULACION) return `El motivo va hasta ${MAX_MOTIVO_ANULACION} letras.`;
  return null;
}

/** La base reconoció el mismo id con OTRO pedido: la orden ya se había guardado con lo de antes (`crear_orden_compra`, Formidable
 *  2026-10-10). La pantalla ofrece ir a corregirla. */
export const HINT_YA_GUARDADA = "orden_compra_ya_guardada";

/** Qué decir cuando se corta la señal al guardar (Formidable, 2026-10-10). El pedido pudo llegar a la base y perderse solo la
 *  respuesta: decir «no se guardó nada» invitaba a corregir algo y reintentar creyendo que no existía. El reintento es seguro —la base
 *  reconoce el mismo pedido y no repite nada—, así que se dice eso, y que se reintente SIN cambiar nada. */
export function avisoDeCorte(accion: "crear" | "editar" | "anular"): string {
  switch (accion) {
    case "crear":
      return "Se cortó la conexión y no sabemos si la orden llegó a guardarse. Vuelve a pulsar «Guardar orden» sin cambiar nada: si ya se guardó, no se crea otra.";
    case "editar":
      return "Se cortó la conexión y no sabemos si tu cambio llegó a guardarse. Vuelve a pulsar «Guardar cambios» sin cambiar nada: si ya se guardó, no se repite.";
    case "anular":
      return "Se cortó la conexión y no sabemos si la orden llegó a anularse. Vuelve a pulsar «Anular orden» con el mismo motivo: si ya se anuló, no se repite.";
  }
}
export const RPC_DETALLE_ORDEN = "fn_orden_compra_detalle";
export const RPC_RESUMEN_ORDENES = "fn_ordenes_compra_resumen";

/** De a cuántas órdenes trae la lista (`fn_ordenes_compra` acepta hasta 100). */
export const TAMANO_PAGINA_ORDENES = 50;

/** Lo que «Nueva orden de compra» lee de la base (`getDatosNuevaOrden`). */
export type DatosNuevaOrden = {
  proveedores: (ProveedorOpcion & { ruc: string | null })[];
  marcas: MarcaOpcion[];
  vinculos: Vinculo[];
  categorias: { id: string; nombre: string; prefijo: string | null; familia: string | null }[];
  destinos: { id: string; nombre: string }[];
  /** El número que le tocaría; null si la vista previa no respondió (se numera igual al guardar). */
  siguiente: number | null;
  falla: string | null;
};

export type EstadoOrdenCompra = "generada" | "anulada";

export type OrdenCompraFila = {
  id: string;
  numero: number;
  estado: EstadoOrdenCompra;
  proveedorId: string;
  proveedorNombre: string;
  /** La tienda a la que llega directo; `null` = «por repartir» (llega a Lima y se reparte después). */
  destinoId: string | null;
  destinoNombre: string | null;
  fechaEmision: string;
  fechaEntregaEstimada: string | null;
  lineas: number;
  unidades: number;
  total: number;
  creadaPorNombre: string | null;
  creadaEn: string;
};

/** El número como se dice y se imprime: «OC-000012». El prefijo es presentación; la base guarda solo el número (decisión 2). */
export function numeroOrdenCompra(numero: number): string {
  return `OC-${String(Math.max(0, Math.trunc(numero))).padStart(6, "0")}`;
}

/** «Tienda Trujillo» o «Por repartir»: a dónde llega la mercadería (decisiones 10, 19 y 22). Para una columna «Llega a». */
export function textoDestino(destinoNombre: string | null): string {
  return destinoNombre ?? "Por repartir";
}

/** Lo mismo dicho como frase, para cuando no hay columna que lo rotule: «Llega a Tienda Trujillo» o «Por repartir desde Lima». */
export function fraseDestino(destinoNombre: string | null): string {
  return destinoNombre ? `Llega a ${destinoNombre}` : "Por repartir desde Lima";
}

/** El valor de un rótulo «Llega a» en la orden abierta y en el papel: «Tienda Trujillo» o «Lima, para repartir» (el lugar, no la
 *  frase: «Destino: Llega a Tienda Trujillo» lo decía dos veces, Formidable 2026-10-10). */
export function lugarDeLlegada(destinoNombre: string | null): string {
  return destinoNombre ?? "Lima, para repartir";
}

export const ESTADO_ORDEN: Record<EstadoOrdenCompra, { texto: string; tono: TonoChip }> = {
  // Pedida al proveedor y todavía sin comprobante: informativo, no es un semáforo (ADR-0169).
  generada: { texto: "Generada", tono: "pizarra" },
  anulada: { texto: "Anulada", tono: "apagado" },
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const ESTADOS: readonly EstadoOrdenCompra[] = ["generada", "anulada"];

/** Lee una fila de `fn_ordenes_compra`; `null` si le falta algo que la lista necesita (se descarta, no se inventa). */
export function leerFilaOrden(f: unknown): OrdenCompraFila | null {
  if (!f || typeof f !== "object") return null;
  const r = f as Record<string, unknown>;
  const id = texto(r.id);
  const numero = cifra(r.numero);
  const estado = ESTADOS.find((e) => e === r.estado);
  const proveedorId = texto(r.proveedor_id);
  const proveedorNombre = texto(r.proveedor_nombre);
  const fechaEmision = texto(r.fecha_emision);
  const creadaEn = texto(r.creada_en);
  if (!id || numero == null || !estado || !proveedorId || !proveedorNombre || !fechaEmision || !creadaEn) return null;
  return {
    id,
    numero,
    estado,
    proveedorId,
    proveedorNombre,
    destinoId: texto(r.ubicacion_destino_id),
    destinoNombre: texto(r.destino_nombre),
    fechaEmision,
    fechaEntregaEstimada: texto(r.fecha_entrega_estimada),
    lineas: cifra(r.lineas) ?? 0,
    unidades: cifra(r.unidades) ?? 0,
    total: cifra(r.total) ?? 0,
    creadaPorNombre: texto(r.creada_por_nombre),
    creadaEn,
  };
}

export function leerFilasOrdenes(data: unknown): OrdenCompraFila[] {
  return Array.isArray(data) ? data.map(leerFilaOrden).filter((f): f is OrdenCompraFila => f !== null) : [];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La lista: qué se está mirando (decisión 37: arranca en la sede donde se trabaja y puede pasar a «Todas»)
// ---------------------------------------------------------------------------------------------------------------------------------

/** El destino «todas» de las píldoras (en la base, `p_destino` NULL). */
export const TODAS = "todas";
export const POR_REPARTIR_LISTA = "por_repartir";

/** Lo que dice la URL de la lista. Sin `destino`, la sede donde se trabaja (si es una tienda o un almacén). `cursor` es la página: el
 *  número de la última orden de la página anterior (la paginación del sistema, `PaginacionCursor`, lo pone con ese nombre). */
export type ParamsLista = { destino?: string; estado?: string; q?: string; cursor?: string; recien?: string; enviar?: string };

export type FiltrosLista = {
  /** Lo elegido: `TODAS`, `POR_REPARTIR_LISTA` o el id de una tienda. */
  destino: string;
  estado: EstadoOrdenCompra | null;
  q: string;
  /** La página: las órdenes de número menor a este. */
  antesDe: number | null;
  /** «Por enviar» (fase 3): las órdenes generadas que todavía tienen algo por enviar a una sede. Es una vista de TODAS las sedes: la
   *  cifra de su píldora cuenta todas, así que elegir una sede o un estado la apaga (`hrefLista`). La base no filtra por esto: lo
   *  hace `listarOrdenesCompra` con `fn_ordenes_compra_por_enviar`. */
  porEnviar: boolean;
};

export function filtrosDeLista(p: ParamsLista, ctx: { sedeActual: string | null; destinos: readonly string[] }): FiltrosLista {
  const valido = (d: string | undefined) => !!d && (d === TODAS || d === POR_REPARTIR_LISTA || ctx.destinos.includes(d));
  const porEnviar = p.enviar === "1";
  // «Por enviar» mira todas las sedes y solo las generadas (una anulada no se envía): la sede y el estado de la URL no cuentan.
  const destino = porEnviar ? TODAS : valido(p.destino) ? p.destino! : ctx.sedeActual && ctx.destinos.includes(ctx.sedeActual) ? ctx.sedeActual : TODAS;
  const antes = p.cursor && /^\d{1,9}$/.test(p.cursor) ? Number(p.cursor) : null;
  return {
    destino,
    estado: porEnviar ? null : (ESTADOS.find((e) => e === p.estado) ?? null),
    q: (p.q ?? "").trim().slice(0, 80),
    antesDe: antes && antes > 0 ? antes : null,
    porEnviar,
  };
}

/** Los argumentos de `fn_ordenes_compra` para estos filtros. Pide UNA de más: si llega, hay otra página (`paginaDeOrdenes`), y el
 *  enlace «Siguiente página» nunca lleva a una página vacía. */
export function argsLista(f: FiltrosLista): { p_destino: string | null; p_estado: string | null; p_busqueda: string | null; p_antes_de: number | null; p_limite: number } {
  return {
    p_destino: f.destino === TODAS ? null : f.destino,
    // «Por enviar» solo mira las generadas: la base se las da y aquí se queda con las que tienen algo por enviar.
    p_estado: f.porEnviar ? "generada" : f.estado,
    p_busqueda: f.q || null,
    p_antes_de: f.antesDe,
    p_limite: TAMANO_PAGINA_ORDENES + 1,
  };
}

/** Lo que se muestra de lo que trajo la base: las primeras `TAMANO_PAGINA_ORDENES` y, si vino una más, desde dónde sigue (el número
 *  de la última mostrada: la página siguiente pide las de número menor). */
export function paginaDeOrdenes<T extends { numero: number }>(filas: readonly T[]): { filas: T[]; cursorSiguiente: string | null } {
  const mostradas = filas.slice(0, TAMANO_PAGINA_ORDENES);
  const ultima = mostradas[mostradas.length - 1];
  return { filas: mostradas, cursorSiguiente: filas.length > TAMANO_PAGINA_ORDENES && ultima ? String(ultima.numero) : null };
}

/** Los filtros puestos como parámetros de la URL, sin la página (la paginación les suma su `cursor`). */
export function paramsDeLista(f: FiltrosLista): Record<string, string | undefined> {
  return { destino: f.destino, estado: f.estado ?? undefined, q: f.q || undefined, enviar: f.porEnviar ? "1" : undefined };
}

/** La URL de la lista con estos filtros y los cambios pedidos. Cambiar un filtro vuelve a la primera página. Elegir una sede o un estado
 *  saca de «Por enviar» (es una vista de todas las sedes); buscar o pasar de página, no. */
export function hrefLista(f: FiltrosLista, cambios: Partial<Pick<FiltrosLista, "destino" | "estado" | "q" | "antesDe" | "porEnviar">> = {}): string {
  const saleDePorEnviar = cambios.destino !== undefined || cambios.estado !== undefined;
  const n = { ...f, antesDe: null, porEnviar: saleDePorEnviar ? false : f.porEnviar, ...cambios };
  const q = new URLSearchParams();
  q.set("destino", n.porEnviar ? TODAS : n.destino);
  if (n.porEnviar) q.set("enviar", "1");
  else if (n.estado) q.set("estado", n.estado);
  if (n.q) q.set("q", n.q);
  if (n.antesDe) q.set("cursor", String(n.antesDe));
  return `/compras/ordenes?${q.toString()}`;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A dónde vuelve la pantalla después de guardar una orden (Formidable, 2026-10-10): a la lista filtrada en el destino de ESA orden
 *  (`null` = por repartir), con ella marcada. Antes volvía a la sede de quien trabaja, y una orden para otra tienda no se veía: las dos
 *  pruebas ciegas dudaron si se había guardado. */
export function hrefOrdenGuardada(destinoId: string | null, id: string): string {
  const q = new URLSearchParams();
  q.set("destino", destinoId ?? POR_REPARTIR_LISTA);
  if (ES_UUID.test(id)) q.set("recien", id);
  return `/compras/ordenes?${q.toString()}`;
}

/** La orden recién guardada que la lista marca, si la URL trae una válida. */
export function recienDe(p: ParamsLista): string | null {
  return p.recien && ES_UUID.test(p.recien) ? p.recien.toLowerCase() : null;
}

/** Por destino, lo que resume `fn_ordenes_compra_resumen`. `destinoId` null = por repartir. */
export type ResumenDestino = { destinoId: string | null; destinoNombre: string | null; generadas: number; montoGeneradas: number; anuladas: number };

export function leerResumen(data: unknown): ResumenDestino[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      destinoId: texto(r.ubicacion_destino_id),
      destinoNombre: texto(r.destino_nombre),
      generadas: cifra(r.generadas) ?? 0,
      montoGeneradas: cifra(r.monto_generadas) ?? 0,
      anuladas: cifra(r.anuladas) ?? 0,
    }));
}

/** Cuántas órdenes muestra una píldora de destino con el estado elegido. `TODAS` suma todos los destinos. */
export function conteoDeDestino(resumen: readonly ResumenDestino[], destino: string, estado: EstadoOrdenCompra | null): number {
  const filas =
    destino === TODAS ? resumen : resumen.filter((r) => (destino === POR_REPARTIR_LISTA ? r.destinoId === null : r.destinoId === destino));
  return filas.reduce((acc, r) => acc + (estado === "generada" ? r.generadas : estado === "anulada" ? r.anuladas : r.generadas + r.anuladas), 0);
}

/** Las órdenes generadas y su monto de un destino (o de todos). */
export function generadasDe(resumen: readonly ResumenDestino[], destino: string): { cantidad: number; monto: number } {
  const filas =
    destino === TODAS ? resumen : resumen.filter((r) => (destino === POR_REPARTIR_LISTA ? r.destinoId === null : r.destinoId === destino));
  return { cantidad: filas.reduce((a, r) => a + r.generadas, 0), monto: filas.reduce((a, r) => a + r.montoGeneradas, 0) };
}

/** Una píldora del filtro «Llega a». `conteo` null: el resumen no respondió (la píldora se toca igual, sin número). */
export type PildoraDestino = { valor: string; texto: string; conteo: number | null };

/** Las píldoras de «Llega a», siempre en el mismo orden para todos (así una encargada le puede decir a otra «toca Arequipa»): «Todas las sedes»,
 *  cada tienda o almacén por su nombre COMPLETO, y «Por repartir». «Tienda Lima» y no «Lima»: «Lima» a secas se confundía con lo que
 *  llega a Lima para repartir (Formidable, 2026-10-10). Una sede que ya no está activa pero tiene órdenes también sale: sin ella, esas
 *  órdenes solo se encontrarían en «Todas». */
export function pildorasDeDestino(
  destinos: readonly { id: string; nombre: string }[],
  resumen: readonly ResumenDestino[] | null,
  estado: EstadoOrdenCompra | null,
): PildoraDestino[] {
  const conteo = (valor: string) => (resumen ? conteoDeDestino(resumen, valor, estado) : null);
  const conocidos = new Set(destinos.map((d) => d.id));
  const extra = (resumen ?? [])
    .filter((r): r is ResumenDestino & { destinoId: string } => r.destinoId !== null && !conocidos.has(r.destinoId))
    .map((r) => ({ id: r.destinoId, nombre: r.destinoNombre ?? "Sede sin nombre" }));
  return [
    { valor: TODAS, texto: "Todas las sedes", conteo: conteo(TODAS) },
    ...[...destinos, ...extra].map((d) => ({ valor: d.id, texto: d.nombre, conteo: conteo(d.id) })),
    { valor: POR_REPARTIR_LISTA, texto: "Por repartir", conteo: conteo(POR_REPARTIR_LISTA) },
  ];
}

/** Lo que dice la lista cuando con estos filtros no queda ninguna orden: qué pasó, en palabras de tienda, y qué filtros se pueden
 *  quitar (cada uno con la URL sin él). La búsqueda no va entre los filtros: se borra con su propio botón. */
export function vacioDeLista(
  f: FiltrosLista,
  nombreDestino: string | null,
): { titulo: string; frase: string; filtros: { texto: string; href: string }[] } {
  if (f.porEnviar) {
    // Lo normal es que esté vacía: todo lo que llegó ya salió. No es un problema, y se dice así.
    return {
      titulo: f.q ? `Ninguna orden por enviar coincide con «${f.q}»` : "No hay nada por enviar",
      frase: f.q ? "Busca por el número de la orden o por el nombre del proveedor." : "Todo lo que se pidió ya salió hacia su sede.",
      filtros: [{ texto: "Por enviar", href: hrefLista(f, { porEnviar: false }) }],
    };
  }
  const donde = f.destino === TODAS ? null : f.destino === POR_REPARTIR_LISTA ? "por repartir" : `que llegue a ${nombreDestino ?? "esa sede"}`;
  const filtros = [
    ...(f.destino !== TODAS ? [{ texto: f.destino === POR_REPARTIR_LISTA ? "Por repartir" : (nombreDestino ?? "Esa sede"), href: hrefLista(f, { destino: TODAS }) }] : []),
    ...(f.estado ? [{ texto: f.estado === "generada" ? "Generadas" : "Anuladas", href: hrefLista(f, { estado: null }) }] : []),
  ];
  if (f.q) {
    return {
      titulo: `Ninguna orden coincide con «${f.q}»`,
      frase: "Busca por el número de la orden o por el nombre del proveedor.",
      filtros,
    };
  }
  const que = f.estado === "anulada" ? "anulada" : f.estado === "generada" ? "generada" : null;
  const titulo = ["No hay ninguna orden", que, donde].filter(Boolean).join(" ");
  return { titulo, frase: f.destino === TODAS ? "Quita el filtro para ver todas." : "Mira las de todas las sedes, o crea una nueva.", filtros };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Una orden (la ventana de detalle)
// ---------------------------------------------------------------------------------------------------------------------------------

export type LineaDetalle = {
  /** El id de la línea pedida: lo que un comprobante nombra para decir «esto es de aquella línea». `null` si la base no lo trae. */
  id: string | null;
  posicion: number;
  categoriaId: string;
  categoria: string;
  marcaId: string;
  marca: string;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  descuentoPct: number | null;
  subtotal: number;
  /** Unidades que ya llegaron en papel (comprobantes vigentes). `null` = la base todavía no lo dice (no se muestra). */
  facturado: number | null;
  /** Lo que falta por llegar en papel, nunca menos de cero. `null` = la base todavía no lo dice. */
  pendiente: number | null;
  /** Unidades que ya salieron en envíos vivos (en camino, abiertos o cerrados; los anulados no cuentan). `null` = la base todavía no sabe de envíos. */
  enviado: number | null;
  /** Lo que le queda por enviar: lo pedido o lo facturado, lo que sea mayor, menos lo enviado; nunca menos de cero. `null` = la base todavía
   *  no lo dice. */
  porEnviar: number | null;
};

/** Cuánto papel tiene la orden: ninguno, el de una parte de lo pedido, o todo lo pedido. */
export type PapelDeLaOrden = "sin_comprobante" | "en_parte" | "completa";
const PAPELES: readonly PapelDeLaOrden[] = ["sin_comprobante", "en_parte", "completa"];

/** Un comprobante de la orden, vigente o anulado (el más reciente primero). */
export type ComprobanteDeOrden = {
  id: string;
  /** Serie y número, «B001-123». */
  documento: string;
  /** `boleta`, `nota_venta` o `factura`. */
  tipo: string;
  /** `credito` o `contado`. */
  condicion: string;
  fechaEmision: string | null;
  total: number;
  /** Lo que queda por pagar. */
  saldo: number;
  /** `vigente` o `anulada`. */
  estado: string;
  /** `pendiente`, `parcial`, `pagada` o `anulada`; `null` si la base no lo dice. */
  estadoPago: string | null;
};

export type DetalleOrden = {
  id: string;
  numero: number;
  estado: EstadoOrdenCompra;
  proveedor: { id: string; nombre: string; ruc: string | null };
  destino: { id: string; nombre: string } | null;
  fechaEmision: string;
  fechaEntregaEstimada: string | null;
  nota: string | null;
  creadaPor: string | null;
  creadaEn: string;
  actualizadaPor: string | null;
  actualizadaEn: string | null;
  version: number;
  anuladaPor: string | null;
  anuladaEn: string | null;
  motivoAnulacion: string | null;
  lineas: LineaDetalle[];
  unidades: number;
  total: number;
  /** Los comprobantes de la orden; vacío si no tiene (o si la base todavía no los cuenta). */
  comprobantes: ComprobanteDeOrden[];
  /** `null` = la base todavía no sabe de comprobantes de orden: la pantalla funciona sin esas partes y no ofrece registrarlos. */
  papel: PapelDeLaOrden | null;
  /** Los envíos de la orden, del más reciente al más antiguo; vacío si no tiene. `null` = la base todavía no sabe de envíos: la pantalla
   *  funciona sin esas partes y no ofrece enviar. */
  envios: EnvioDeOrden[] | null;
  /** De qué sede queda la deuda de un comprobante de esta orden (decisión 46 de ADR-0362: la sede de QUIEN HIZO LA ORDEN; si no, «Llega
   *  a»; si no, la de quien registra). `null` = la base no lo dice (vieja) o no hay a quién cargarla. */
  deudaDe: { id: string; nombre: string } | null;
};

/** Una sede `{ id, nombre }` del detalle, o null si no viene completa. */
function leerSede(v: unknown): { id: string; nombre: string } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const id = texto(r.id);
  const nombre = texto(r.nombre);
  return id && nombre ? { id, nombre } : null;
}

/** Lee `fn_orden_compra_detalle`; null si no llegó una orden (no existe, o la respuesta no se entiende). Una línea rara se descarta. */
export function leerDetalleOrden(data: unknown): DetalleOrden | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const id = texto(d.id);
  const numero = cifra(d.numero);
  const estado = ESTADOS.find((e) => e === d.estado);
  const proveedor = d.proveedor && typeof d.proveedor === "object" ? (d.proveedor as Record<string, unknown>) : null;
  const proveedorId = proveedor ? texto(proveedor.id) : null;
  const proveedorNombre = proveedor ? texto(proveedor.nombre) : null;
  const fechaEmision = texto(d.fecha_emision);
  const creadaEn = texto(d.creada_en);
  if (!id || numero == null || !estado || !proveedorId || !proveedorNombre || !fechaEmision || !creadaEn) return null;
  const destino = d.destino && typeof d.destino === "object" ? (d.destino as Record<string, unknown>) : null;
  const destinoId = destino ? texto(destino.id) : null;
  const destinoNombre = destino ? texto(destino.nombre) : null;
  const lineas = (Array.isArray(d.lineas) ? d.lineas : [])
    .map((l): LineaDetalle | null => {
      if (!l || typeof l !== "object") return null;
      const r = l as Record<string, unknown>;
      const posicion = cifra(r.posicion);
      const categoriaId = texto(r.categoria_id);
      const categoria = texto(r.categoria);
      const marcaId = texto(r.marca_id);
      const marca = texto(r.marca);
      const cantidad = cifra(r.cantidad);
      const precioUnitario = cifra(r.precio_unitario);
      const subtotal = cifra(r.subtotal);
      const pendiente = cifra(r.pendiente);
      const porEnviar = cifra(r.por_enviar);
      if (posicion == null || !categoriaId || !categoria || !marcaId || !marca || cantidad == null || precioUnitario == null || subtotal == null) return null;
      return {
        id: texto(r.id),
        posicion,
        categoriaId,
        categoria,
        marcaId,
        marca,
        descripcion: texto(r.descripcion),
        cantidad,
        precioUnitario,
        descuento: cifra(r.descuento) ?? 0,
        descuentoPct: cifra(r.descuento_pct),
        subtotal,
        facturado: cifra(r.facturado),
        pendiente: pendiente == null ? null : Math.max(0, pendiente),
        enviado: cifra(r.enviado),
        porEnviar: porEnviar == null ? null : Math.max(0, porEnviar),
      };
    })
    .filter((l): l is LineaDetalle => l !== null);
  return {
    id,
    numero,
    estado,
    proveedor: { id: proveedorId, nombre: proveedorNombre, ruc: proveedor ? texto(proveedor.ruc) : null },
    destino: destinoId && destinoNombre ? { id: destinoId, nombre: destinoNombre } : null,
    fechaEmision,
    fechaEntregaEstimada: texto(d.fecha_entrega_estimada),
    nota: texto(d.nota),
    creadaPor: texto(d.creada_por),
    creadaEn,
    actualizadaPor: texto(d.actualizada_por),
    actualizadaEn: texto(d.actualizada_en),
    version: cifra(d.version) ?? 1,
    anuladaPor: texto(d.anulada_por),
    anuladaEn: texto(d.anulada_en),
    motivoAnulacion: texto(d.motivo_anulacion),
    lineas,
    unidades: cifra(d.unidades) ?? 0,
    total: cifra(d.total) ?? 0,
    comprobantes: leerComprobantes(d.comprobantes),
    papel: PAPELES.find((p) => p === d.papel) ?? null,
    // Una base que sabe de envíos dice `por_enviar` en cada línea, aunque no traiga la lista: sin envíos todavía, es la lista vacía.
    envios: leerEnvios(d.envios) ?? (lineas.some((l) => l.porEnviar !== null) ? [] : null),
    deudaDe: leerSede(d.deuda_de),
  };
}

/** Lee la lista `comprobantes` del detalle. Una fila sin id o sin documento se descarta; lo demás que falte toma un valor neutro
 *  (la lista nunca debe tumbar la orden abierta). */
export function leerComprobantes(data: unknown): ComprobanteDeOrden[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((c): ComprobanteDeOrden | null => {
      if (!c || typeof c !== "object") return null;
      const r = c as Record<string, unknown>;
      const id = texto(r.id);
      const documento = texto(r.documento);
      if (!id || !documento) return null;
      return {
        id,
        documento,
        tipo: texto(r.tipo) ?? "",
        condicion: texto(r.condicion) ?? "",
        fechaEmision: texto(r.fecha_emision),
        total: cifra(r.total) ?? 0,
        saldo: cifra(r.saldo) ?? 0,
        estado: texto(r.estado) ?? "vigente",
        estadoPago: texto(r.estado_pago),
      };
    })
    .filter((c): c is ComprobanteDeOrden => c !== null);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Fase 3: los envíos de la orden. Una guía lleva lo de una o varias órdenes a UNA sede; nace «en camino», la sede la abre y la cierra al
// recibirla (fase 4) y solo se anula mientras va en camino. Todo llega con tolerancia: una base que todavía no los cuenta no rompe la orden.
// ---------------------------------------------------------------------------------------------------------------------------------

export type EstadoEnvio = "en_camino" | "abierto" | "cerrado" | "anulado";
const ESTADOS_ENVIO: readonly EstadoEnvio[] = ["en_camino", "abierto", "cerrado", "anulado"];

/** Cómo se dice cada estado de un envío. `en_camino` es informativo (pizarra), `abierto` está a medias (ámbar: la sede lo está contando),
 *  `cerrado` ya se recibió y `anulado` ya no cuenta. */
export const ESTADO_ENVIO: Record<EstadoEnvio, { texto: string; tono: TonoChip }> = {
  en_camino: { texto: "En camino", tono: "pizarra" },
  abierto: { texto: "Abierto", tono: "ambar" },
  cerrado: { texto: "Cerrado", tono: "verde" },
  anulado: { texto: "Anulado", tono: "apagado" },
};

/** Un envío de la orden (la guía), vivo o anulado. */
export type EnvioDeOrden = {
  id: string;
  /** Como se dice y se escribe en la guía: «ENV-000012». */
  numero: string;
  /** La sede a la que va, por su nombre. */
  sede: string;
  numeroGuia: string | null;
  estado: EstadoEnvio;
  despachadoEn: string | null;
  /** Unidades que lleva (de esta orden). */
  unidades: number;
  /** La versión que vio la pantalla: la base rechaza anular si otra persona lo cambió antes. `null` = la base no la dice en la orden. */
  version: number | null;
};

/** «ENV-000012»: el número como se dice y se imprime. La base lo manda ya escrito; si llegara solo la cifra, se arma igual que «OC-». */
export function numeroEnvio(numero: unknown): string | null {
  if (typeof numero === "string" && /^env-/i.test(numero.trim())) return numero.trim().toUpperCase();
  const n = cifra(numero);
  return n == null ? null : `ENV-${String(Math.max(0, Math.trunc(n))).padStart(6, "0")}`;
}

/** Lee la lista `envios` del detalle: `null` si no es una lista (la base todavía no cuenta envíos). Una fila sin id, sin número o con un
 *  estado que no se conoce se descarta; lo demás que falte toma un valor neutro (la lista nunca debe tumbar la orden abierta). */
export function leerEnvios(data: unknown): EnvioDeOrden[] | null {
  if (!Array.isArray(data)) return null;
  return data
    .map((e): EnvioDeOrden | null => {
      if (!e || typeof e !== "object") return null;
      const r = e as Record<string, unknown>;
      const id = texto(r.id);
      const numero = numeroEnvio(r.numero);
      const estado = ESTADOS_ENVIO.find((x) => x === r.estado);
      if (!id || !numero || !estado) return null;
      const sede = r.sede && typeof r.sede === "object" ? texto((r.sede as Record<string, unknown>).nombre) : texto(r.sede);
      return {
        id,
        numero,
        sede: sede ?? "Sede sin nombre",
        numeroGuia: texto(r.numero_guia),
        estado,
        despachadoEn: texto(r.despachado_en),
        unidades: cifra(r.unidades) ?? 0,
        version: cifra(r.version),
      };
    })
    .filter((e): e is EnvioDeOrden => e !== null);
}

/** Lee `fn_ordenes_compra_por_enviar`: por cada orden generada, cuántas unidades le quedan por enviar. Solo quedan las que tienen algo
 *  por enviar (una con cero no se manda). `null` si la respuesta no es una lista: la base todavía no tiene esa función. */
export function leerPorEnviar(data: unknown): Map<string, number> | null {
  if (!Array.isArray(data)) return null;
  const salida = new Map<string, number>();
  for (const f of data) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    const id = texto(r.orden_compra_id) ?? texto(r.orden_id) ?? texto(r.id);
    const unidades = cifra(r.unidades_por_enviar);
    if (id && unidades != null && unidades > 0) salida.set(id, unidades);
  }
  return salida;
}

/** ¿Tiene algún envío, vigente o anulado? Desde entonces la orden no se edita: la guía cuelga de sus líneas, y editar las reemplaza (aun
 *  anulado, el envío sigue apuntando a ellas). */
export const tieneEnvio = (d: Partial<Pick<DetalleOrden, "envios">>): boolean => (d.envios ?? []).length > 0;

/** ¿Tiene un envío vivo (en camino, abierto o cerrado)? Mientras lo tenga, la orden no se anula: primero se anula el envío. Uno anulado no cuenta. */
export const tieneEnvioVivo = (d: Partial<Pick<DetalleOrden, "envios">>): boolean => (d.envios ?? []).some((e) => e.estado !== "anulado");

/** Cuánto de una línea salió en envíos, dicho como se lee: «8 de 10». `null` si la base no dice cuánto. El total es lo que se llegó a
 *  pedir o a facturar (lo mayor): si el papel trajo más de lo pedido, lo que sobra también se envía. */
export function textoEnvioDeLinea(l: Pick<LineaDetalle, "cantidad" | "enviado" | "porEnviar">): string | null {
  if (l.enviado == null) return null;
  const total = l.porEnviar == null ? l.cantidad : l.enviado + l.porEnviar;
  return `${l.enviado.toLocaleString("es-PE")} de ${total.toLocaleString("es-PE")}`;
}

/** Cuánto se ha enviado de la orden: nada, una parte o todo. `null` si la base todavía no sabe de envíos. */
export function estadoDeEnvioDeOrden(d: Pick<DetalleOrden, "lineas" | "envios">): "ninguno" | "en_parte" | "completo" | null {
  if (d.envios === null) return null;
  if (!d.lineas.some((l) => (l.enviado ?? 0) > 0)) return "ninguno";
  return d.lineas.every((l) => (l.porEnviar ?? 0) === 0) ? "completo" : "en_parte";
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué se puede hacer con una orden que ya tiene (o no) papel (fase 2): las mismas reglas que la base, dichas para esconder el botón
// que ella rechazaría. El candado real sigue en `editar_orden_compra`, `anular_orden_compra` y `registrar_comprobante_orden`.
// ---------------------------------------------------------------------------------------------------------------------------------

type ConPapel = Pick<DetalleOrden, "estado" | "comprobantes"> & Partial<Pick<DetalleOrden, "envios">>;

/** ¿Tiene algún comprobante, vigente o anulado? Desde entonces la orden no se edita: si el papel está mal, se anula y se registra de nuevo. */
export const tieneComprobante = (d: Pick<DetalleOrden, "comprobantes">): boolean => d.comprobantes.length > 0;

/** ¿Tiene un comprobante vigente? Mientras lo tenga, la orden no se anula: primero se anula el comprobante. */
export const tieneComprobanteVigente = (d: Pick<DetalleOrden, "comprobantes">): boolean => d.comprobantes.some((c) => c.estado === "vigente");

/** «Editar»: solo una generada que todavía no tiene ningún comprobante ni ningún envío (aun anulado: la guía cuelga de las líneas). */
export const puedeEditarOrden = (d: ConPapel): boolean => d.estado === "generada" && !tieneComprobante(d) && !tieneEnvio(d);

/** «Anular orden»: solo una generada sin comprobante vigente ni envío vivo (primero se anula el envío). */
export const puedeAnularOrden = (d: ConPapel): boolean => d.estado === "generada" && !tieneComprobanteVigente(d) && !tieneEnvioVivo(d);

/**
 * «Enviar a una sede»: una orden generada con algo por enviar, cuya base ya sabe de envíos (`por_enviar` viene en cada línea y la
 * lista `envios` en la orden). El comprobante NO bloquea (decisión 9): se envía con o sin papel. Sin las líneas con su id la pantalla no
 * puede decir de cuál es cada cantidad.
 */
export function puedeEnviarOrden(d: Pick<DetalleOrden, "estado" | "envios" | "lineas">): boolean {
  return (
    d.estado === "generada" &&
    d.envios !== null &&
    d.lineas.length > 0 &&
    d.lineas.every((l) => l.id !== null && l.porEnviar !== null) &&
    d.lineas.some((l) => (l.porEnviar ?? 0) > 0)
  );
}

/**
 * «Registrar comprobante»: una orden generada cuya base ya sabe de comprobantes de orden (`papel` viene en el detalle). Desde la fase 3
 * (decisión 46 de ADR-0362) también una «Por repartir», si la base ya dice de qué sede queda la deuda (`deudaDe`): una base de la fase 2
 * todavía la rechaza. Con `papel = completa` también se ofrece: lo de más se acepta y la hoja lo avisa. Sin las líneas con su id la
 * pantalla no puede decir de cuál es cada renglón del papel.
 */
export function puedeRegistrarComprobante(d: Pick<DetalleOrden, "estado" | "destino" | "papel" | "lineas" | "deudaDe">): boolean {
  return (
    d.estado === "generada" &&
    (d.destino !== null || d.deudaDe !== null) &&
    d.papel !== null &&
    d.lineas.length > 0 &&
    d.lineas.every((l) => l.id !== null)
  );
}

/** Cuánto de una línea llegó en papel, dicho como se lee: «8 de 10» o «12 de 10 · 2 de más». `null` si la base no dice cuánto. */
export function textoPapelDeLinea(l: Pick<LineaDetalle, "cantidad" | "facturado">): string | null {
  if (l.facturado == null) return null;
  const base = `${l.facturado.toLocaleString("es-PE")} de ${l.cantidad.toLocaleString("es-PE")}`;
  return l.facturado > l.cantidad ? `${base} · ${(l.facturado - l.cantidad).toLocaleString("es-PE")} de más` : base;
}
