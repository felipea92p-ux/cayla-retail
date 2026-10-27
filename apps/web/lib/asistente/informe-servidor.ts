import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claseDe, nombreDeGuia, nombreDeModulo, queRespondio } from "@/lib/asistente/equipo";
import {
  ESPERA_INFORME_MS,
  INSTRUCCIONES_INFORME,
  InformeDeLaIA,
  leerDatosInforme,
  leerInformes,
  mensajeDelInforme,
  MODELO_INFORME,
  revisarInforme,
  semanaDelInforme,
} from "@/lib/asistente/informe";
import { costoEnDolares, seLlegoAlTope } from "@/lib/asistente/respuesta";

// Arma el informe del lunes (ADR-0536, actividad 10). Lo llaman el trabajo programado (con la llave de servicio) y el botón del líder (con
// su sesión): el permiso lo decide la base (`fn_asistente_ve_informe`). Pasos: ¿la semana ya tiene informe? → ¿queda tope en el mes? →
// las cifras y las preguntas de SQL → la IA agrupa y redacta → `revisarInforme` → `guardar_informe_asistente` (que vuelve a mirar las
// citas). Nunca lanza: devuelve qué pasó, y la ruta decide qué contestar.

type Cliente = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> };

export type ResultadoInforme =
  | { estado: "listo"; id: string; mejoras: number }
  | { estado: "ya_estaba"; id: string }
  | { estado: "sin_preguntas"; id: string }
  | { estado: "tope" | "sin_clave" }
  | { estado: "fallo"; motivo: string };

export async function armarInforme(supabase: Cliente, ahora: number = Date.now()): Promise<ResultadoInforme> {
  const { semana, desde, hasta } = semanaDelInforme(ahora);

  const previos = await supabase.rpc("fn_asistente_informes", { p_limite: 12 });
  if (previos.error) return { estado: "fallo", motivo: `no se pudieron leer los informes (${previos.error.code ?? "sin código"})` };
  const yaEstaba = leerInformes(previos.data).find((i) => i.semana === semana);
  if (yaEstaba) return { estado: "ya_estaba", id: yaEstaba.id };

  const leidos = await supabase.rpc("fn_asistente_datos_informe", { p_desde: desde, p_hasta: hasta });
  if (leidos.error) return { estado: "fallo", motivo: `no se pudieron leer las preguntas (${leidos.error.code ?? "sin código"})` };
  const datos = leerDatosInforme(leidos.data);
  if (!datos) return { estado: "fallo", motivo: "la base devolvió algo que no se entiende" };

  const guardar = async (mejoras: unknown[], gasto: { modelo: string | null; entrada: number; salida: number; costo: number }) => {
    const { data, error } = await supabase.rpc("guardar_informe_asistente", {
      p_semana: semana,
      p_desde: desde,
      p_hasta: hasta,
      p_cifras: datos.cifras,
      p_mejoras: mejoras,
      p_modelo: gasto.modelo,
      p_tokens_entrada: gasto.entrada,
      p_tokens_salida: gasto.salida,
      p_costo_usd: Number(gasto.costo.toFixed(6)),
    });
    return error ? null : (data as string | null);
  };

  // Una semana sin preguntas también se anota (la pantalla dice «nadie preguntó», no «falta el informe»), sin llamar a la IA.
  if (datos.preguntas.length === 0) {
    const id = await guardar([], { modelo: null, entrada: 0, salida: 0, costo: 0 });
    return id ? { estado: "sin_preguntas", id } : { estado: "fallo", motivo: "no se pudo guardar el informe vacío" };
  }

  if (!process.env.ANTHROPIC_API_KEY) return { estado: "sin_clave" };
  const { data: gastado, error: errorGasto } = await supabase.rpc("fn_asistente_gasto_del_mes");
  if (seLlegoAlTope(errorGasto ? null : Number(gastado))) return { estado: "tope" };

  const { mensaje, refs } = mensajeDelInforme(datos.preguntas, {
    // La IA lee la caja de la respuesta como la ve el líder: «Resuelta · La llevó a la pantalla», «Sin respuesta · Regla sin escribir»…
    respuesta: (p) => `${claseDe(p.tipo) === "resuelta" ? "Resuelta" : "No resuelta"}: ${queRespondio({ tipo: p.tipo, tema: p.tema, motivo: null })}`,
    guia: nombreDeGuia,
    modulo: nombreDeModulo,
  });

  const cliente = new Anthropic({ timeout: ESPERA_INFORME_MS, maxRetries: 1 });
  let respuesta;
  try {
    respuesta = await cliente.messages.parse({
      model: MODELO_INFORME,
      max_tokens: 4096,
      system: INSTRUCCIONES_INFORME,
      output_config: { format: zodOutputFormat(InformeDeLaIA) },
      messages: [{ role: "user", content: mensaje }],
    });
  } catch (error) {
    // Lo que se anota lleva el tipo de error, nunca las preguntas (ADR-0424).
    return { estado: "fallo", motivo: `sin respuesta de la IA: ${error instanceof Anthropic.APIError ? `${error.constructor.name} ${error.status ?? ""}` : error instanceof Error ? error.name : "desconocido"}` };
  }
  if (respuesta.stop_reason === "refusal") return { estado: "fallo", motivo: "la IA declinó el informe" };

  const mejoras = revisarInforme(respuesta.parsed_output ?? null, refs);
  const u = respuesta.usage;
  const id = await guardar(mejoras, { modelo: MODELO_INFORME, entrada: u.input_tokens, salida: u.output_tokens, costo: costoEnDolares(MODELO_INFORME, u) });
  return id ? { estado: "listo", id, mejoras: mejoras.length } : { estado: "fallo", motivo: "la base no aceptó el informe" };
}
