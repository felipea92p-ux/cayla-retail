import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import {
  aCambio,
  aClienta,
  aDevolucion,
  aSeparacion,
  agruparCompras,
  type Clienta,
  type FichaClienta,
  type FilaCambio,
  type FilaClienta,
  type FilaCompra,
  type FilaDevolucion,
  type FilaSeparacion,
} from "@/lib/clientas-reglas";
import { firmar, type Firma } from "@/lib/responsable-reglas";

// Las escrituras y la búsqueda de /clientas: una función por RPC. Detrás de esta interfaz para
// que el panel no sepa de Supabase (mismo criterio que `colaboradores-acciones.ts`). Todas son
// `security definer` con RLS de "cualquier colaborador con sesión" — esta capa nunca es la única
// puerta, la base la vuelve a exigir.
//
// Paso 2 del acta (docs/datos/DECISIONES-2026-09-26-clientas.md sección H): editar, archivar/
// anonimizar, unir y exportar se suman al alta y la búsqueda que ya existían (D-76/D-77).
// Candado optimista (ADR-0193 reusado): cada acción que edita manda `version`, y si la base
// devuelve PT409, `error-escritura.ts` ya lo traduce sin que esta capa haga nada especial.
export type DatosAlta = {
  dni: string;
  nombre: string;
  telefonoWhatsapp: string;
  aceptaWhatsapp: boolean;
  cumpleDia: string;
  cumpleMes: string;
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
      p_dni: datos.dni.trim() || undefined,
      p_nombre: datos.nombre.trim() || undefined,
      p_telefono_whatsapp: datos.telefonoWhatsapp.trim() || undefined,
      p_acepta_whatsapp: datos.aceptaWhatsapp,
      p_cumple_dia: smallintOVacio(datos.cumpleDia),
      p_cumple_mes: smallintOVacio(datos.cumpleMes),
    }),
    firma,
  );
  return { id: data ?? null, error };
}

export type DatosEdicion = DatosAlta & { tallas: Record<string, string> | null; revocaWhatsapp: boolean };

/** `p_revoca_whatsapp` apaga el consentimiento A PROPÓSITO — a diferencia de `registrarClienta`,
 *  editar SÍ necesita poder quitar un permiso ya dado (la clienta puede pedir que no le escriban
 *  más), y `p_acepta_whatsapp=false` por sí solo nunca lo revoca (mismo criterio que el alta). */
export async function editarClienta(id: string, datos: DatosEdicion, version: number, firma: Firma | null): Promise<ResultadoVersion> {
  const { data, error } = await firmar(
    createClient().rpc("editar_clienta", {
      p_id: id,
      p_dni: datos.dni.trim() || undefined,
      p_nombre: datos.nombre.trim() || undefined,
      p_telefono_whatsapp: datos.telefonoWhatsapp.trim() || undefined,
      p_acepta_whatsapp: datos.aceptaWhatsapp,
      p_revoca_whatsapp: datos.revocaWhatsapp,
      p_cumple_dia: smallintOVacio(datos.cumpleDia),
      p_cumple_mes: smallintOVacio(datos.cumpleMes),
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

/** D-99: junta dos fichas (celular primero, DNI después) en una sola transacción — mueve sus
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
 *  en `/clientas` la primera vez); esta es su gemela del lado del cliente. */
export async function cargarFichaClienta(id: string): Promise<ResultadoFicha> {
  const supabase = createClient();
  const [clienta, compras, cambios, devoluciones, separaciones] = await Promise.all([
    supabase
      .from("clientas")
      .select(
        "id, dni, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, tallas, created_at, version, archivada_en, motivo_archivo, anonimizada, fusionada_en_id"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("fn_clienta_compras", { p_id: id }),
    supabase.rpc("fn_clienta_cambios", { p_id: id }),
    supabase.rpc("fn_clienta_devoluciones", { p_id: id }),
    supabase.rpc("fn_clienta_separaciones", { p_id: id }),
  ]);

  const error = clienta.error ?? compras.error ?? cambios.error ?? devoluciones.error ?? separaciones.error;
  if (error || !clienta.data) return { ficha: null, error: error ?? null };

  return {
    ficha: {
      clienta: aClienta(clienta.data as FilaClienta),
      compras: agruparCompras((compras.data ?? []) as FilaCompra[]),
      cambios: ((cambios.data ?? []) as FilaCambio[]).map(aCambio),
      devoluciones: ((devoluciones.data ?? []) as FilaDevolucion[]).map(aDevolucion),
      separaciones: ((separaciones.data ?? []) as FilaSeparacion[]).map(aSeparacion),
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
