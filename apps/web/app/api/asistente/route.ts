import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { preseleccionar } from "@/lib/asistente/preseleccion";
import {
  costoEnDolares,
  ESPERA_IA_MS,
  GUIAS_PARA_LA_IA,
  INSTRUCCIONES,
  LARGO_MAXIMO_PREGUNTA,
  mensajeDePregunta,
  MODELO_RESPUESTA,
  RespuestaDeLaIA,
  revisarRespuesta,
  type ResultadoAsistente,
} from "@/lib/asistente/respuesta";
import { limpiarDatosPersonales, sinConsulta } from "@/lib/errores-reglas";
import { GUIAS } from "@/lib/guias/registro";
import { hojasDe, menuPara, permisosDe } from "@/lib/menu";
import { requirePersonaActualV2 } from "@/lib/persona-actual";

// POST /api/asistente  { pregunta, ruta }  →  { resultado }
//
// «Pregúntale a CAYLA» (ADR-0529, actividades 2 y 3): la pregunta va a la IA con las pocas guías que la búsqueda local encontró, y vuelve
// un recorrido de 1 a 3 tramos elegidos DE ESA LISTA, cada uno con la dirección para llegar (o «no existe» / «fuera de tema»).
//
// CONTRATO
//   PROMETE: responder siempre 200 con algo que mostrar. Si la IA no está (falta la clave, no contesta en 8 s, falla, declina o dice
//            algo que no se le puede creer), `resultado.tipo` es «basico» y el cajón muestra la búsqueda sin IA: nunca se cae.
//   ASUME:   sesión válida. El menú (qué pantallas puede ofrecer) se arma AQUÍ con los módulos de la cuenta, no con lo que mande el
//            navegador: nadie se entera por la IA de una pantalla que su rol no ve.
//   NO HACE: no guarda nada todavía (la pregunta se guarda desde la actividad 5) y no lee datos de la tienda.
//
// POR QUÉ EN EL SERVIDOR: la clave de Anthropic (`ANTHROPIC_API_KEY`) cuesta plata por pregunta; si viajara al navegador, cualquiera
// con la consola abierta la copia. Y lo que viaja a la IA pasa antes por `limpiarDatosPersonales` (ADR-0424): un DNI, un celular o un
// correo escrito en la pregunta sale como «[número]» o «[correo]».

const Cuerpo = z.object({
  pregunta: z.string().trim().min(2).max(LARGO_MAXIMO_PREGUNTA),
  ruta: z.string().max(300),
});

// Freno de mano contra un bucle (un efecto mal escrito, una tecla pegada): por instancia del servidor, como el del padrón. No es el
// tope del mes (ese llega con la actividad 5, contado en la base): es que nadie pregunte 20 veces en un minuto.
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

/** La IA no estuvo: el cajón muestra la búsqueda sin ella (ADR-0529, «Modo básico»). */
const basico = (motivo: Extract<ResultadoAsistente, { tipo: "basico" }>["motivo"]) => Response.json({ resultado: { tipo: "basico", motivo } });

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

  if (!process.env.ANTHROPIC_API_KEY) return basico("sin_clave");

  // Sin reintentos: con la persona esperando, un segundo intento haría pasar los 8 s. Si no responde, la búsqueda sin IA ya sirve.
  const cliente = new Anthropic({ timeout: ESPERA_IA_MS, maxRetries: 0 });
  const inicio = Date.now();
  try {
    const respuesta = await cliente.messages.parse({
      model: MODELO_RESPUESTA,
      max_tokens: 2048,
      // Las instrucciones son siempre las mismas: la API las guarda en su caché y cobra la décima parte al releerlas.
      system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
      // Elegir de una lista corta no pide pensar mucho, y la persona está esperando: el esfuerzo más bajo.
      output_config: { format: zodOutputFormat(RespuestaDeLaIA), effort: "low" },
      messages: [{ role: "user", content: mensajeDePregunta(pregunta, sugerencias) }],
    });

    if (process.env.NODE_ENV !== "production") {
      const u = respuesta.usage;
      console.info(
        `[asistente] ${MODELO_RESPUESTA} · ${Date.now() - inicio} ms · entrada ${u.input_tokens} (caché ${u.cache_read_input_tokens ?? 0}) · salida ${u.output_tokens} · US$${costoEnDolares(MODELO_RESPUESTA, u).toFixed(5)}`,
      );
    }
    if (respuesta.stop_reason === "refusal") return basico("rechazo");

    return Response.json({ resultado: revisarRespuesta(respuesta.parsed_output ?? null, sugerencias, rutaActual) });
  } catch (error) {
    // Lo que se anota lleva el tipo de error y su código, nunca la pregunta (ADR-0424).
    console.error(`[asistente] sin respuesta de la IA: ${error instanceof Anthropic.APIError ? `${error.constructor.name} ${error.status ?? ""}` : error instanceof Error ? error.name : "desconocido"}`);
    return basico("sin_respuesta");
  }
}
