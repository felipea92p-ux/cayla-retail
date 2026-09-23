import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { aClienta, type Clienta } from "@/lib/clientas-reglas";
import { firmar, type Firma } from "@/lib/responsable-reglas";

// Las escrituras y la búsqueda de /clientas: una función por RPC
// (20260922140000_ficha_de_clienta_v1_backend.sql). Detrás de esta interfaz para que el
// panel no sepa de Supabase (mismo criterio que `colaboradores-acciones.ts`). Las dos RPC
// son `security definer` con RLS de "cualquier colaborador con sesión" — esta capa nunca es
// la única puerta, la base la vuelve a exigir.
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

/** `undefined` si el texto viene vacío tras recortarlo — así la RPC (que espera `smallint`,
 *  no admite `''`) recibe `null`, nunca una cadena vacía. */
function smallintOVacio(texto: string): number | undefined {
  const limpio = texto.trim();
  return limpio === "" ? undefined : Number(limpio);
}

export async function buscarClienta(termino: string): Promise<ResultadoBusqueda> {
  const { data, error } = await createClient().rpc("buscar_clienta", { p_termino: termino });
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
