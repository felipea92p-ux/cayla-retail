// Forma y mapeo de una clienta — sin `supabase/server` ni `supabase/client`: lo importan
// tanto la lectura del servidor (`clientas.ts`) como las escrituras del navegador
// (`clientas-acciones.ts`) y el panel cliente, sin arrastrar el lado equivocado de Supabase
// al otro (mismo criterio que separa `ventas-historial.ts` de `ventas-historial-reglas.ts`).
//
// Clientas, paso 2 del acta (docs/datos/DECISIONES-2026-09-26-clientas.md, sección H): además del
// alta (D-76/D-77), la ficha ahora se edita, se archiva/anonimiza y se une con otra (D-99). Las
// columnas nuevas de `retail.clientas` — `version` (ADR-0193 reusado), `archivada_en`,
// `archivada_por`, `motivo_archivo`, `anonimizada`, `fusionada_en_id` — entran acá.
import { tipoDocumentoDe, type TipoDocumentoClienta } from "./documento-clienta-reglas";

export type Clienta = {
  id: string;
  /** ADR-0288 D-2: el documento tiene tipo (DNI por defecto, carné de extranjería o pasaporte). Antes, `dni`. */
  documentoTipo: TipoDocumentoClienta;
  documentoNumero: string | null;
  nombre: string | null;
  telefonoWhatsapp: string | null;
  /** true si la clienta tiene el permiso de PUBLICIDAD por WhatsApp (lo dio escribiendo ella primero, ADR-0288 D-4).
   *  Desde la tanda 1b sale de `publicidad_desde`, no de `whatsapp_consentimiento_en`. */
  tienePermisoWhatsapp: boolean;
  /** ADR-0288 tanda 1b: socia desde (su «sí» al club), con publicidad desde, y su código («C-0142»). */
  clubDesde: string | null;
  publicidadDesde: string | null;
  codigoClub: string | null;
  cumpleAnio: number | null;
  cumpleDia: number | null;
  cumpleMes: number | null;
  tallas: Record<string, string> | null;
  createdAt: string;
  /** ADR-0193 reusado: candado optimista. Toda edición manda la que se leyó al abrir. */
  version: number;
  archivadaEn: string | null;
  motivoArchivo: string | null;
  /** true = además de archivada, sin ningún dato personal (Ley 29733 o fusión, D-99). */
  anonimizada: boolean;
  /** Si esta ficha perdió una fusión, la ficha que quedó (retail.clientas_fusiones tiene el detalle). */
  fusionadaEnId: string | null;
};

// `tallas` es jsonb libre sin forma fija (comentario de la columna en la migración): se acepta
// como `unknown` en la fila cruda (así calza con el `Json` que genera Supabase para cualquier
// columna jsonb, sin acoplar este archivo a ese tipo) y se valida al mapear a `Clienta`.
export type FilaClienta = {
  id: string;
  documento_tipo: string;
  documento_numero: string | null;
  nombre: string | null;
  telefono_whatsapp: string | null;
  whatsapp_consentimiento_en: string | null;
  club_desde: string | null;
  publicidad_desde: string | null;
  codigo_club: string | null;
  cumple_anio: number | null;
  cumple_dia: number | null;
  cumple_mes: number | null;
  tallas: unknown;
  created_at: string;
  version: number;
  archivada_en: string | null;
  motivo_archivo: string | null;
  anonimizada: boolean;
  fusionada_en_id: string | null;
};

/** Las columnas de `clientas` que arman una `FilaClienta`: la MISMA lista para la lectura del servidor (`clientas.ts`) y la
 *  del navegador (`clientas-acciones.ts`). Antes cada una escribía la suya, y la tanda 1b (ADR-0288) habría tenido que
 *  acordarse de sumar las del club en tres lugares. */
export const COLUMNAS_CLIENTA =
  "id, documento_tipo, documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en, club_desde, publicidad_desde, codigo_club, cumple_anio, cumple_dia, cumple_mes, tallas, created_at, version, archivada_en, motivo_archivo, anonimizada, fusionada_en_id";

function comoTallas(valor: unknown): Record<string, string> | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  return valor as Record<string, string>;
}

export function aClienta(fila: FilaClienta): Clienta {
  return {
    id: fila.id,
    documentoTipo: tipoDocumentoDe(fila.documento_tipo),
    documentoNumero: fila.documento_numero,
    nombre: fila.nombre,
    telefonoWhatsapp: fila.telefono_whatsapp,
    tienePermisoWhatsapp: fila.publicidad_desde !== null,
    clubDesde: fila.club_desde,
    publicidadDesde: fila.publicidad_desde,
    codigoClub: fila.codigo_club,
    cumpleAnio: fila.cumple_anio,
    cumpleDia: fila.cumple_dia,
    cumpleMes: fila.cumple_mes,
    tallas: comoTallas(fila.tallas),
    createdAt: fila.created_at,
    version: fila.version,
    archivadaEn: fila.archivada_en,
    motivoArchivo: fila.motivo_archivo,
    anonimizada: fila.anonimizada,
    fusionadaEnId: fila.fusionada_en_id,
  };
}

export function estaActiva(c: Pick<Clienta, "archivadaEn">): boolean {
  return c.archivadaEn === null;
}

/* ------------------------------------------------------------------
   Su actividad — leída de ventas/cambios/devoluciones/separaciones (fn_clienta_*, nunca una
   tabla copia): la ficha muestra hechos, no un resumen guardado a mano.
   ------------------------------------------------------------------ */

export type FilaCompra = {
  venta_id: string;
  fecha: string;
  ubicacion: string;
  categoria: string | null;
  talla: string | null;
  cantidad: number;
  subtotal: number;
};

export type Compra = {
  ventaId: string;
  fecha: string;
  ubicacion: string;
  total: number;
  items: { categoria: string | null; talla: string | null; cantidad: number }[];
};

export type Cambio = { id: string; fecha: string; ubicacion: string; motivo: string | null; diferencia: number };
export type FilaCambio = { cambio_id: string; fecha: string; ubicacion: string; motivo: string | null; diferencia: number };

export type Devolucion = { id: string; fecha: string; estado: string; motivo: string | null; reembolsoMonto: number | null };
export type FilaDevolucion = {
  devolucion_id: string;
  fecha: string;
  estado: string;
  motivo: string | null;
  reembolso_monto: number | null;
};

export type Separacion = { id: string; codigo: string; fecha: string; estado: string; total: number; venceEl: string };
export type FilaSeparacion = {
  separacion_id: string;
  codigo: string;
  fecha: string;
  estado: string;
  total: number;
  vence_el: string;
};

/** Agrupa las filas planas de `fn_clienta_compras` (una por prenda) en una compra por venta —
 *  las filas llegan ordenadas por fecha desc, así que las de una misma venta quedan juntas. */
export function agruparCompras(filas: readonly FilaCompra[]): Compra[] {
  const porVenta = new Map<string, Compra>();
  for (const f of filas) {
    let c = porVenta.get(f.venta_id);
    if (!c) {
      c = { ventaId: f.venta_id, fecha: f.fecha, ubicacion: f.ubicacion, total: 0, items: [] };
      porVenta.set(f.venta_id, c);
    }
    c.total += f.subtotal;
    c.items.push({ categoria: f.categoria, talla: f.talla, cantidad: f.cantidad });
  }
  return [...porVenta.values()];
}

export function aCambio(f: FilaCambio): Cambio {
  return { id: f.cambio_id, fecha: f.fecha, ubicacion: f.ubicacion, motivo: f.motivo, diferencia: f.diferencia };
}

export function aDevolucion(f: FilaDevolucion): Devolucion {
  return { id: f.devolucion_id, fecha: f.fecha, estado: f.estado, motivo: f.motivo, reembolsoMonto: f.reembolso_monto };
}

export function aSeparacion(f: FilaSeparacion): Separacion {
  return { id: f.separacion_id, codigo: f.codigo, fecha: f.fecha, estado: f.estado, total: f.total, venceEl: f.vence_el };
}

/** La ficha completa: la clienta más su actividad. Vive acá (no en `clientas.ts`) porque tanto la
 *  carga inicial (server, `getFichaClienta`) como el refresco tras editar (cliente,
 *  `cargarFichaClienta` en `clientas-acciones.ts`) arman la misma forma. */
export type FichaClienta = { clienta: Clienta; compras: Compra[]; cambios: Cambio[]; devoluciones: Devolucion[]; separaciones: Separacion[] };
