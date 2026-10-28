// Tienda web ▸ Vitrina: la única llamada que muestra u oculta modelos en la web (`vitrina_mostrar`), con su firma y sus errores dichos como los
// dice la pantalla. La usan la hoja de lote y el interruptor de un modelo (que aplica sin hoja cuando ya hay responsable, ADR-0161).
//
// PROMETE: firma con el responsable que se le pasa (ADR-0162), traduce el rechazo a una frase de tienda y le avisa al control del responsable
// qué pasó (`despues`). ASUME: que `vitrina_mostrar` es todo o nada e idempotente (el que ya está como se pide no cambia), por eso volver a
// llamarla con lo contrario deshace lo hecho.
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import { errorDeVitrina } from "@/lib/vitrina-reglas";

export type ResultadoMostrar = { ok: true } | { ok: false; titulo: string; detalle?: string };

export async function mostrarModelos(responsable: ControlResponsable, ids: string[], publicar: boolean): Promise<ResultadoMostrar> {
  const { error } = await firmar(createClient().rpc("vitrina_mostrar", { p_producto_ids: ids, p_publicado: publicar }), responsable.firma());
  responsable.despues(error);
  if (!error) return { ok: true };
  const propio = errorDeVitrina(`${error.message ?? ""} ${error.hint ?? ""}`);
  if (propio) return { ok: false, titulo: propio.titulo, detalle: propio.detalle };
  return { ok: false, titulo: traducirError(error, publicar ? "mostrar los modelos" : "ocultar los modelos") };
}
