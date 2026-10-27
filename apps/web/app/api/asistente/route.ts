import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { preseleccionar } from "@/lib/asistente/preseleccion";
import { erroresParecidos, reglasParecidas } from "@/lib/asistente/conocimiento";
import { rutasFueraDelMenu } from "@/lib/asistente/sin-acceso";
import {
  costoEnDolares,
  ESPERA_IA_MS,
  GUIAS_AJENAS_PARA_LA_IA,
  GUIAS_PARA_LA_IA,
  INSTRUCCIONES,
  LARGO_MAXIMO_PREGUNTA,
  mensajeDePregunta,
  MODELO_RESPUESTA,
  RespuestaDeLaIA,
  revisarRespuesta,
  seLlegoAlTope,
  type ResultadoAsistente,
} from "@/lib/asistente/respuesta";
import { frasesDeErrores } from "@/lib/error-escritura";
import { limpiarDatosPersonales, sinConsulta } from "@/lib/errores-reglas";
import { GUIAS } from "@/lib/guias/registro";
import { hojasDe, menuPara, permisosDe } from "@/lib/menu";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";

// POST /api/asistente  { pregunta, ruta }  →  { resultado, preguntaId }
//
// «Pregúntale a CAYLA» (ADR-0529, actividades 2 a 5): la pregunta va a la IA con las pocas guías que la búsqueda local encontró, y vuelve
// un recorrido de 1 a 3 tramos elegidos DE ESA LISTA, cada uno con la dirección para llegar (o «sin acceso», «no existe», «fuera de
// tema»). Cada pregunta queda anotada (`registrar_pregunta_asistente`) y su id vuelve para contestar «¿Te sirvió?».
//
// CONTRATO
//   PROMETE: responder siempre 200 con algo que mostrar. Si la IA no está (falta la clave, ya se gastó el tope del mes, no contesta en
//            8 s, falla, declina o dice algo que no se le puede creer), `resultado.tipo` es «basico» y el cajón muestra la búsqueda
//            sin IA: nunca se cae. Si la base no anota la pregunta, la respuesta llega igual (`preguntaId: null`, sin «¿Te sirvió?»).
//   ASUME:   sesión válida. El menú (qué pantallas puede ofrecer) se arma AQUÍ con los módulos de la cuenta, no con lo que mande el
//            navegador: nadie se entera por la IA de una pantalla que su rol no ve.
//            Lo que vive en un módulo que su rol no tiene solo se nombra («sin_acceso»: a quién pedírselo), nunca se enseña.
//   NO HACE: no lee datos de la tienda. Lo único que escribe es la fila de la pregunta.
//
// POR QUÉ EN EL SERVIDOR: la clave de Anthropic (`ANTHROPIC_API_KEY`) cuesta plata por pregunta; si viajara al navegador, cualquiera
// con la consola abierta la copia. Y lo que viaja a la IA (y lo que se guarda) pasa antes por `limpiarDatosPersonales` (ADR-0424): un
// DNI, un celular o un correo escrito en la pregunta sale como «[número]» o «[correo]».

const Cuerpo = z.object({
  pregunta: z.string().trim().min(2).max(LARGO_MAXIMO_PREGUNTA),
  ruta: z.string().max(300),
});

// Freno de mano contra un bucle (un efecto mal escrito, una tecla pegada): por instancia del servidor, como el del padrón. No es el
// tope del mes (ese lo cuenta la base, `fn_asistente_gasto_del_mes`): es que nadie pregunte 20 veces en un minuto.
const TOPE_POR_MINUTO = 20;
const contador = new Map<string, { desde: number; usos: number }>();

function excedeTope(cuenta: string): boolean {
  const ahora = Date.now();
  const actual = contador.get(cuenta);
  if (!actual || ahora - actual.desde > 60_000) {
    contador.set(cuenta, { desde: ahora, usos: 1 });
    return false;
  }
  actual.usos += 1;
  return actual.usos > TOPE_POR_MINUTO;
}

/** Lo que cuesta y tarda una llamada a la IA, para anotarlo con la pregunta. Sin IA, todo en cero. */
type Gasto = { modelo: string | null; tokensEntrada: number; tokensSalida: number; tokensCache: number; costoUsd: number; ms: number | null };
const SIN_GASTO: Gasto = { modelo: null, tokensEntrada: 0, tokensSalida: 0, tokensCache: 0, costoUsd: 0, ms: null };

export async function POST(request: Request) {
  const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return Response.json({ error: "Escribe una pregunta de 2 a 300 letras." }, { status: 400 });

  const persona = await requirePersonaActualV2();
  const cuenta = persona.personaId ?? `terminal:${persona.ubicacionId}`;
  if (excedeTope(cuenta)) return Response.json({ error: "Son muchas preguntas seguidas: espera un minuto." }, { status: 429 });

  // Las pantallas que esta cuenta ve: el mismo menú del lateral (`AppShell`), armado con sus módulos.
  const rutasDelMenu = menuPara({
    permisos: persona.permisos ?? permisosDe(persona.rol),
    ubicacionTipo: persona.ubicacionTipo,
    terminal: !!persona.terminal,
    modulos: persona.modulos.map((m) => m.clave),
  })
    .riel.flatMap(hojasDe)
    .map((h) => h.href);

  const pregunta = limpiarDatosPersonales(cuerpo.data.pregunta);
  const rutaActual = sinConsulta(cuerpo.data.ruta);
  const sugerencias = preseleccionar({ pregunta, guias: GUIAS, rutasDelMenu, rutaActual, cuantas: GUIAS_PARA_LA_IA });
  // Las pantallas de un módulo que su rol no tiene: la IA solo puede decir que existen y a quién pedírselas (actividad 4).
  const modulos = persona.modulos.map((m) => m.clave);
  const ajenas = preseleccionar({ pregunta, guias: GUIAS, rutasDelMenu: rutasFueraDelMenu({ guias: GUIAS, modulos }), rutaActual: "", cuantas: GUIAS_AJENAS_PARA_LA_IA });
  // Las reglas de tienda APROBADAS y los errores conocidos que más se parecen (actividad 7): la IA elige uno por su id, el texto es el nuestro.
  const conocimiento = { reglas: reglasParecidas(pregunta), errores: erroresParecidos(pregunta, frasesDeErrores()) };

  const supabase = await createClient();
  /** Anota la pregunta y responde. Si la base no la anota (sin la migración, sin respuesta), la respuesta llega igual. */
  const responder = async (resultado: ResultadoAsistente, tema: RespuestaDeLaIA["tema"] | null, gasto: Gasto) => {
    let preguntaId: string | null = null;
    const { data, error } = await supabase.rpc(
      "registrar_pregunta_asistente" as never,
      {
        p_ubicacion_id: persona.vista === "global" ? null : persona.ubicacionId,
        p_ruta: rutaActual.startsWith("/") ? rutaActual.slice(0, 300) : "/",
        p_pregunta: pregunta,
        p_tipo: resultado.tipo,
        p_tema: tema,
        p_motivo: resultado.tipo === "basico" ? resultado.motivo : null,
        p_tramos: resultado.tipo === "guia" ? resultado.tramos : [],
        p_guia_id: resultado.tipo === "sin_acceso" ? resultado.guiaId : resultado.tipo === "guia" ? (resultado.tramos[0]?.guiaId ?? null) : null,
        p_modulo: resultado.tipo === "sin_acceso" ? resultado.modulo : null,
        p_modelo: gasto.modelo,
        p_tokens_entrada: gasto.tokensEntrada,
        p_tokens_salida: gasto.tokensSalida,
        p_tokens_cache: gasto.tokensCache,
        p_costo_usd: Number(gasto.costoUsd.toFixed(6)),
        p_ms: gasto.ms,
        p_referencia: resultado.tipo === "regla" ? resultado.reglaId : resultado.tipo === "error" ? resultado.marca : null,
      } as never,
    );
    if (error) console.error(`[asistente] no se anotó la pregunta: ${error.code ?? "sin código"}`);
    else preguntaId = (data as unknown as string | null) ?? null;
    return Response.json({ resultado, preguntaId });
  };
  const basico = (motivo: Extract<ResultadoAsistente, { tipo: "basico" }>["motivo"], gasto = SIN_GASTO) => responder({ tipo: "basico", motivo }, null, gasto);

  if (!process.env.ANTHROPIC_API_KEY) return basico("sin_clave");

  // El tope del mes (US$30): con el mes ya gastado se sigue sin IA hasta el día 1. Si la base no dice cuánto va, no se corta.
  const { data: gastado, error: errorGasto } = await supabase.rpc("fn_asistente_gasto_del_mes" as never);
  if (errorGasto) console.error(`[asistente] no se pudo leer el gasto del mes: ${errorGasto.code ?? "sin código"}`);
  if (seLlegoAlTope(errorGasto ? null : Number(gastado))) return basico("tope");

  // Sin reintentos: con la persona esperando, un segundo intento haría pasar los 8 s. Si no responde, la búsqueda sin IA ya sirve.
  const cliente = new Anthropic({ timeout: ESPERA_IA_MS, maxRetries: 0 });
  const inicio = Date.now();
  let respuesta;
  try {
    respuesta = await cliente.messages.parse({
      model: MODELO_RESPUESTA,
      max_tokens: 2048,
      // Las instrucciones son siempre las mismas: la API las guarda en su caché y cobra la décima parte al releerlas.
      system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
      // Elegir de una lista corta no pide pensar mucho, y la persona está esperando: el esfuerzo más bajo.
      output_config: { format: zodOutputFormat(RespuestaDeLaIA), effort: "low" },
      messages: [{ role: "user", content: mensajeDePregunta(pregunta, sugerencias, ajenas, conocimiento) }],
    });
  } catch (error) {
    // Lo que se anota lleva el tipo de error y su código, nunca la pregunta (ADR-0424).
    console.error(`[asistente] sin respuesta de la IA: ${error instanceof Anthropic.APIError ? `${error.constructor.name} ${error.status ?? ""}` : error instanceof Error ? error.name : "desconocido"}`);
    return basico("sin_respuesta", { ...SIN_GASTO, modelo: MODELO_RESPUESTA, ms: Date.now() - inicio });
  }

  const u = respuesta.usage;
  const gasto: Gasto = {
    modelo: MODELO_RESPUESTA,
    tokensEntrada: u.input_tokens,
    tokensSalida: u.output_tokens,
    tokensCache: u.cache_read_input_tokens ?? 0,
    costoUsd: costoEnDolares(MODELO_RESPUESTA, u),
    ms: Date.now() - inicio,
  };
  if (process.env.NODE_ENV !== "production") {
    console.info(`[asistente] ${MODELO_RESPUESTA} · ${gasto.ms} ms · entrada ${gasto.tokensEntrada} (caché ${gasto.tokensCache}) · salida ${gasto.tokensSalida} · US$${gasto.costoUsd.toFixed(5)}`);
  }
  // Una respuesta declinada o que no se le puede creer igual costó: se anota con su gasto.
  if (respuesta.stop_reason === "refusal") return basico("rechazo", gasto);
  const cruda = respuesta.parsed_output ?? null;
  return responder(revisarRespuesta(cruda, sugerencias, rutaActual, ajenas, pregunta, conocimiento), cruda?.tema ?? null, gasto);
}
