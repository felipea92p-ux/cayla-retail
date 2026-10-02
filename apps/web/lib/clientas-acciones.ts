import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import {
  aCambio,
  aClienta,
  aDevolucion,
  aSeparacion,
  agruparCompras,
  COLUMNAS_CLIENTA,
  type Clienta,
  type FichaClienta,
  type FilaCambio,
  type FilaClienta,
  type FilaCompra,
  type FilaDevolucion,
  type FilaSeparacion,
} from "@/lib/clientas-reglas";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { normalizarNumeroDocumento, type TipoDocumentoClienta } from "@/lib/documento-clienta-reglas";
import { aResumenCompras, type FilaResumenCompras } from "@/lib/clientas-lista-reglas";

// Las escrituras y la búsqueda de /clientas: una función por RPC. Detrás de esta interfaz para
// que el panel no sepa de Supabase (mismo criterio que `colaboradores-acciones.ts`). Todas son
// `security definer` y empiezan por preguntar si la cuenta ve el módulo «Clientas» (42501
// `clientas_sin_modulo`, ADR-0249 act. 2026-09-28); la lectura directa de `clientas` también
// (política `clientas_select`). Esta capa nunca es la única puerta: la base la vuelve a exigir.
//
// Paso 2 del acta (docs/datos/DECISIONES-2026-09-26-clientas.md sección H): editar, archivar/
// anonimizar, unir y exportar se suman al alta y la búsqueda que ya existían (D-76/D-77).
// Candado optimista (ADR-0193 reusado): cada acción que edita manda `version`, y si la base
// devuelve PT409, `error-escritura.ts` ya lo traduce sin que esta capa haga nada especial.
//
// ADR-0288 tanda 1b (D-4 reescrita): el alta y la edición YA NO marcan ningún permiso de WhatsApp; por eso `DatosAlta`
// perdió `aceptaWhatsapp` y `DatosEdicion` perdió `revocaWhatsapp`. El cumpleaños ganó su año (opcional, CL-3). Desde la
// tanda 1g (G-2), ser socia y la publicidad nacen de ella, en la página del cartel: el alta de la caja y de /clientas manda
// solo el documento (y el nombre), y «Editar» de la ficha sigue corrigiendo el celular y el cumpleaños.
export type DatosAlta = {
  /** ADR-0288 D-2: DNI por defecto, carné de extranjería o pasaporte. */
  documentoTipo: TipoDocumentoClienta;
  documentoNumero: string;
  nombre: string;
  telefonoWhatsapp: string;
  cumpleDia: string;
  cumpleMes: string;
  /** Opcional (CL-3): vacío = no lo dijo. */
  cumpleAnio: string;
};

export type ResultadoBusqueda = { clientas: Clienta[]; error: ErrorEscritura };
export type ResultadoAlta = { id: string | null; error: ErrorEscritura };
export type ResultadoVersion = { version: number | null; error: ErrorEscritura };
export type ResultadoUnion = { clienta: Clienta | null; error: ErrorEscritura };

/** `undefined` si el texto viene vacío tras recortarlo — así la RPC (que espera `smallint`,
 *  no admite `''`) recibe `null`, nunca una cadena vacía. */
function smallintOVacio(texto: string): number | undefined {
  const limpio = texto.trim();
  return limpio === "" ? undefined : Number(limpio);
}

export async function buscarClienta(termino: string, incluirArchivadas = false): Promise<ResultadoBusqueda> {
  const { data, error } = await createClient().rpc("buscar_clienta", { p_termino: termino, p_incluir_archivadas: incluirArchivadas });
  return { clientas: (data ?? []).map(aClienta), error };
}

/**
 * `firma` es la del combo «Responsable» de la pantalla que llama (`responsable.firma()`, ADR-0161): registrar una
 * clienta es operación de tienda y la base la firma con quien eligió el combo, no con la cuenta.
 */
export async function registrarClienta(datos: DatosAlta, firma: Firma | null): Promise<ResultadoAlta> {
  const { data, error } = await firmar(
    createClient().rpc("registrar_clienta", {
      p_documento_tipo: datos.documentoTipo,
      p_documento_numero: normalizarNumeroDocumento(datos.documentoNumero) || undefined,
      p_nombre: datos.nombre.trim() || undefined,
      p_telefono_whatsapp: datos.telefonoWhatsapp.trim() || undefined,
      p_cumple_dia: smallintOVacio(datos.cumpleDia),
      p_cumple_mes: smallintOVacio(datos.cumpleMes),
      p_cumple_anio: smallintOVacio(datos.cumpleAnio),
    }),
    firma,
  );
  return { id: data ?? null, error };
}

export type DatosEdicion = DatosAlta & { tallas: Record<string, string> | null };

/** Editar ya no toca el club ni la publicidad (ADR-0288 D-4): su «BAJA» es `registrarBajaWhatsapp`. A una socia la base
 *  no le deja borrar el celular (hint `socia_sin_celular`). */
export async function editarClienta(id: string, datos: DatosEdicion, version: number, firma: Firma | null): Promise<ResultadoVersion> {
  const { data, error } = await firmar(
    createClient().rpc("editar_clienta", {
      p_id: id,
      p_documento_tipo: datos.documentoTipo,
      p_documento_numero: normalizarNumeroDocumento(datos.documentoNumero) || undefined,
      p_nombre: datos.nombre.trim() || undefined,
      p_telefono_whatsapp: datos.telefonoWhatsapp.trim() || undefined,
      p_cumple_dia: smallintOVacio(datos.cumpleDia),
      p_cumple_mes: smallintOVacio(datos.cumpleMes),
      p_cumple_anio: smallintOVacio(datos.cumpleAnio),
      p_tallas: datos.tallas ?? undefined,
      p_version_esperada: version,
    }),
    firma,
  );
  return { version: data ?? null, error };
}

/** `anonimizar=true`: además de archivar, le quita todo dato personal (Ley 29733). */
export async function archivarClienta(
  id: string,
  motivo: string,
  anonimizar: boolean,
  version: number,
  firma: Firma | null,
): Promise<ResultadoVersion> {
  const { data, error } = await firmar(
    createClient().rpc("archivar_clienta", { p_id: id, p_motivo: motivo, p_anonimizar: anonimizar, p_version_esperada: version }),
    firma,
  );
  return { version: data ?? null, error };
}

export async function reactivarClienta(id: string, version: number, firma: Firma | null): Promise<ResultadoVersion> {
  const { data, error } = await firmar(createClient().rpc("reactivar_clienta", { p_id: id, p_version_esperada: version }), firma);
  return { version: data ?? null, error };
}

/** D-99: junta dos fichas (celular primero, documento después) en una sola transacción — mueve sus
 *  ventas/separaciones/pedidos y anonimiza a la perdedora. No hay deshacer: el rastro completo
 *  queda en `retail.clientas_fusiones`. */
export async function unirClientas(
  mantenerId: string,
  fusionarId: string,
  versionMantener: number,
  versionFusionar: number,
  firma: Firma | null,
): Promise<ResultadoUnion> {
  const { data, error } = await firmar(
    createClient().rpc("unir_clientas", {
      p_mantener_id: mantenerId,
      p_fusionar_id: fusionarId,
      p_version_mantener_esperada: versionMantener,
      p_version_fusionar_esperada: versionFusionar,
    }),
    firma,
  );
  return { clienta: data ? aClienta(data) : null, error };
}

export type ResultadoFicha = { ficha: FichaClienta | null; error: ErrorEscritura };

/** La ficha completa (clienta + su actividad), leída DESDE EL NAVEGADOR — para abrirla al hacer
 *  clic en una fila y para refrescarla tras editar/archivar/unir, sin depender de un Server
 *  Component. Mismas cinco lecturas que `lib/clientas.ts` (`getFichaClienta`, usada al aterrizar
 *  en `/clientas` la primera vez); esta es su gemela del lado del cliente.
 *  Tanda 1f (ADR-0288): más su sede y frecuente con compra neta (`fn_clienta_su_sede`, la regla de la lista). Esa sexta
 *  lectura no tumba la ficha si falla (la base sin la migración 20260930210000): llega `null` y la ficha sigue. */
export async function cargarFichaClienta(id: string): Promise<ResultadoFicha> {
  const supabase = createClient();
  const [clienta, compras, cambios, devoluciones, separaciones, resumen] = await Promise.all([
    supabase
      .from("clientas")
      .select(COLUMNAS_CLIENTA)
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("fn_clienta_compras", { p_id: id }),
    supabase.rpc("fn_clienta_cambios", { p_id: id }),
    supabase.rpc("fn_clienta_devoluciones", { p_id: id }),
    supabase.rpc("fn_clienta_separaciones", { p_id: id }),
    supabase.rpc("fn_clienta_su_sede", { p_clienta_id: id }),
  ]);

  const error = clienta.error ?? compras.error ?? cambios.error ?? devoluciones.error ?? separaciones.error;
  const filaResumen = resumen.error ? null : ((resumen.data ?? [])[0] as FilaResumenCompras | undefined);
  if (error || !clienta.data) return { ficha: null, error: error ?? null };

  return {
    ficha: {
      clienta: aClienta(clienta.data as FilaClienta),
      compras: agruparCompras((compras.data ?? []) as FilaCompra[]),
      cambios: ((cambios.data ?? []) as FilaCambio[]).map(aCambio),
      devoluciones: ((devoluciones.data ?? []) as FilaDevolucion[]).map(aDevolucion),
      separaciones: ((separaciones.data ?? []) as FilaSeparacion[]).map(aSeparacion),
      resumenCompras: filaResumen ? aResumenCompras(filaResumen) : null,
    },
    error: null,
  };
}

export type ResultadoExportar = { clientas: Clienta[]; error: ErrorEscritura };

/** D-109/G.4: solo un Admin puede exportar la lista completa — la base lo exige de nuevo y deja
 *  rastro en `retail.actividad` de quién exportó y cuándo. */
export async function exportarClientas(): Promise<ResultadoExportar> {
  const { data, error } = await createClient().rpc("exportar_clientas");
  return { clientas: (data ?? []).map(aClienta), error };
}
