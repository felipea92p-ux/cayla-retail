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
