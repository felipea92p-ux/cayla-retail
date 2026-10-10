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
export type ParamsLista = { destino?: string; estado?: string; q?: string; cursor?: string; recien?: string };

export type FiltrosLista = {
  /** Lo elegido: `TODAS`, `POR_REPARTIR_LISTA` o el id de una tienda. */
  destino: string;
  estado: EstadoOrdenCompra | null;
  q: string;
  /** La página: las órdenes de número menor a este. */
  antesDe: number | null;
};

export function filtrosDeLista(p: ParamsLista, ctx: { sedeActual: string | null; destinos: readonly string[] }): FiltrosLista {
  const valido = (d: string | undefined) => !!d && (d === TODAS || d === POR_REPARTIR_LISTA || ctx.destinos.includes(d));
  const destino = valido(p.destino) ? p.destino! : ctx.sedeActual && ctx.destinos.includes(ctx.sedeActual) ? ctx.sedeActual : TODAS;
  const antes = p.cursor && /^\d{1,9}$/.test(p.cursor) ? Number(p.cursor) : null;
  return {
    destino,
    estado: ESTADOS.find((e) => e === p.estado) ?? null,
    q: (p.q ?? "").trim().slice(0, 80),
    antesDe: antes && antes > 0 ? antes : null,
  };
}

/** Los argumentos de `fn_ordenes_compra` para estos filtros. Pide UNA de más: si llega, hay otra página (`paginaDeOrdenes`), y el
 *  enlace «Siguiente página» nunca lleva a una página vacía. */
export function argsLista(f: FiltrosLista): { p_destino: string | null; p_estado: string | null; p_busqueda: string | null; p_antes_de: number | null; p_limite: number } {
  return {
    p_destino: f.destino === TODAS ? null : f.destino,
    p_estado: f.estado,
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
  return { destino: f.destino, estado: f.estado ?? undefined, q: f.q || undefined };
}

/** La URL de la lista con estos filtros y los cambios pedidos. Cambiar un filtro vuelve a la primera página. */
export function hrefLista(f: FiltrosLista, cambios: Partial<Pick<FiltrosLista, "destino" | "estado" | "q" | "antesDe">> = {}): string {
  const n = { ...f, antesDe: null, ...cambios };
  const q = new URLSearchParams();
  q.set("destino", n.destino);
  if (n.estado) q.set("estado", n.estado);
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
};

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
      if (posicion == null || !categoriaId || !categoria || !marcaId || !marca || cantidad == null || precioUnitario == null || subtotal == null) return null;
      return {
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
  };
}
