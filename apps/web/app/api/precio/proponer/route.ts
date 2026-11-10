import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { costoEnDolares } from "@/lib/asistente/respuesta";
import {
  costoDelContexto,
  ESPERA_PRECIO_MS,
  INSTRUCCIONES_PRECIO,
  leerRespuestaPrecio,
  mensajePrecio,
  MODELO_PRECIO,
  RespuestaPrecioIA,
  type ContextoPrecio,
  type PropuestaLista,
} from "@/lib/precio-propuesto-ia";
import { seLlegoAlTopePrecios, textoSinPropuesta, type MotivoSinPropuesta } from "@/lib/precio-propuesto-reglas";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";

// POST /api/precio/proponer  →  { propuesta } | { sinPropuesta: { motivo, texto } }
//
// Precio propuesto con IA (ADR-0641, Felipe 2026-11-10): Claude propone el precio de etiqueta de una prenda, mirando su costo y sus
// parecidas; la regla fija (`precio-propuesto-reglas.ts`) lo lleva a .90 y nunca lo deja bajo costo + 30 % de margen.
//
// CONTRATO
//   PROMETE: responder 200 con algo que mostrar. Sin clave, con el tope del mes gastado (US$ 20), sin costo, sin respuesta en 45 s,
//            con un rechazo o con una respuesta que no se le puede creer: `sinPropuesta` con su frase, y la pantalla sigue igual.
//            Cada intento queda anotado (`registrar_precio_propuesta`); si la base no lo anota, la propuesta llega igual.
//   ASUME:   sesión válida y que la cuenta ve Productos (la base lo exige en cada función).
//   NO HACE: no cambia ningún precio. Lo aplica la persona, por la función de siempre (con historial).
//
// POR QUÉ EN EL SERVIDOR: la clave de Anthropic cuesta plata por consulta; en el navegador cualquiera la copiaría.

const Cuerpo = z.object({
  origen: z.enum(["alta", "revision"]),
  categoriaId: z.uuid(),
  tejidoId: z.uuid().nullish(),
  productoId: z.uuid().nullish(),
  referencia: z.string().trim().max(120).nullish(),
  descripcion: z.string().trim().max(300).nullish(),
  costo: z.number().positive().max(5000).nullish(),
});

// Freno de mano contra un bucle (no es el tope del mes, ese lo cuenta la base).
const TOPE_POR_MINUTO = 10;
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

type Gasto = { modelo: string | null; tokensEntrada: number; tokensSalida: number; costoUsd: number; ms: number | null };
const SIN_GASTO: Gasto = { modelo: null, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0, ms: null };

export type RespuestaProponer =
  | { propuesta: PropuestaLista & { id: string | null } }
  | { sinPropuesta: { motivo: MotivoSinPropuesta; texto: string } };

export async function POST(request: Request) {
  const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return Response.json({ error: "Faltan datos de la prenda." }, { status: 400 });
  const d = cuerpo.data;
  if (d.origen === "revision" && !d.productoId) return Response.json({ error: "Falta la prenda que se revisa." }, { status: 400 });

  const persona = await requirePersonaActualV2();
  const cuenta = persona.personaId ?? `terminal:${persona.ubicacionId}`;
  if (excedeTope(cuenta)) return Response.json({ error: "Son muchas propuestas seguidas: espera un minuto." }, { status: 429 });

  const supabase = await createClient();
  const { data: ctxData, error: ctxError } = await supabase.rpc(
    "fn_precio_contexto" as never,
    { p_categoria_id: d.categoriaId, p_tejido_id: d.tejidoId ?? null, p_producto_id: d.productoId ?? null } as never,
  );
  if (ctxError) {
    if (ctxError.code === "42501") return Response.json({ error: "Tu rol no ve Productos." }, { status: 403 });
    console.error(`[precio] no se pudo leer el contexto: ${ctxError.code ?? "sin código"}`);
    return Response.json({ sinPropuesta: { motivo: "sin_respuesta", texto: textoSinPropuesta("sin_respuesta") } } satisfies RespuestaProponer);
  }
  const contexto = ctxData as unknown as ContextoPrecio;
  const costo = costoDelContexto(contexto, d.origen === "alta" ? (d.costo ?? null) : null);
  const precioActual = contexto.producto?.precio ?? null;

  /** Anota el intento y responde. Si la base no lo anota, la respuesta llega igual (con `id: null`). */
  const anotar = async (fila: { propuesta: PropuestaLista | null; motivo: MotivoSinPropuesta | null; gasto: Gasto }) => {
    const { data, error } = await supabase.rpc(
      "registrar_precio_propuesta" as never,
      {
        p_origen: d.origen,
        p_categoria_id: d.categoriaId,
        p_producto_id: d.productoId ?? null,
        p_referencia: d.referencia ?? contexto.producto?.referencia ?? null,
        p_costo: costo?.costo ?? null,
        p_costo_estimado: costo?.estimado ?? false,
        p_precio_actual: precioActual,
        p_piso: fila.propuesta?.piso ?? null,
        p_precio_propuesto: fila.propuesta?.precio ?? null,
        p_subido_al_piso: fila.propuesta?.subidoAlPiso ?? false,
        p_razon: fila.propuesta?.razon ?? null,
        p_parecidas: fila.propuesta?.parecidas ?? [],
        p_motivo: fila.motivo,
        p_modelo: fila.gasto.modelo,
        p_tokens_entrada: fila.gasto.tokensEntrada,
        p_tokens_salida: fila.gasto.tokensSalida,
        p_costo_usd: Number(Math.min(fila.gasto.costoUsd, 0.5).toFixed(6)),
        p_ms: fila.gasto.ms,
      } as never,
    );
    if (error) console.error(`[precio] no se anotó la propuesta: ${error.code ?? "sin código"}`);
    return (data as unknown as string | null) ?? null;
  };
  const sin = async (motivo: MotivoSinPropuesta, gasto = SIN_GASTO) => {
    await anotar({ propuesta: null, motivo, gasto });
    return Response.json({ sinPropuesta: { motivo, texto: textoSinPropuesta(motivo) } } satisfies RespuestaProponer);
  };

  if (!costo) return sin("sin_costo");
  if (!process.env.ANTHROPIC_API_KEY) return sin("sin_clave");

  const { data: gastado, error: errorGasto } = await supabase.rpc("fn_precio_gasto_del_mes" as never);
  if (errorGasto) console.error(`[precio] no se pudo leer el gasto del mes: ${errorGasto.code ?? "sin código"}`);
  if (seLlegoAlTopePrecios(errorGasto ? null : Number(gastado))) return sin("tope");

  let tejido: string | null = null;
  if (d.tejidoId) {
    const { data: t } = await supabase.from("tejidos").select("nombre").eq("id", d.tejidoId).maybeSingle();
    tejido = (t as { nombre?: string } | null)?.nombre ?? null;
  }

  const cliente = new Anthropic({ timeout: ESPERA_PRECIO_MS, maxRetries: 0 });
  const inicio = Date.now();
  let respuesta;
  try {
    respuesta = await cliente.beta.messages.parse({
      model: MODELO_PRECIO,
      max_tokens: 4096,
      // Si el modelo declina (muy raro con precios), la API prueba sola con el modelo de respaldo que corresponda.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: INSTRUCCIONES_PRECIO, cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" },
      output_config: { format: betaZodOutputFormat(RespuestaPrecioIA), effort: "medium" },
      messages: [{ role: "user", content: mensajePrecio({ origen: d.origen, contexto, costo, referencia: d.referencia, descripcion: d.descripcion, tejido }) }],
    });
  } catch (error) {
    console.error(`[precio] sin respuesta de la IA: ${error instanceof Anthropic.APIError ? `${error.constructor.name} ${error.status ?? ""}` : error instanceof Error ? error.name : "desconocido"}`);
    return sin("sin_respuesta", { ...SIN_GASTO, modelo: MODELO_PRECIO, ms: Date.now() - inicio });
  }

  const u = respuesta.usage;
  const gasto: Gasto = {
    modelo: respuesta.model,
    tokensEntrada: u.input_tokens,
    tokensSalida: u.output_tokens,
    costoUsd: costoEnDolares(respuesta.model, u),
    ms: Date.now() - inicio,
  };
  if (process.env.NODE_ENV !== "production") {
    console.info(`[precio] ${respuesta.model} · ${gasto.ms} ms · entrada ${gasto.tokensEntrada} · salida ${gasto.tokensSalida} · US$${gasto.costoUsd.toFixed(4)}`);
  }
  if (respuesta.stop_reason === "refusal") return sin("rechazo", gasto);
  const propuesta = leerRespuestaPrecio(respuesta.parsed_output ?? null, costo, contexto);
  if (!propuesta) return sin("respuesta_invalida", gasto);
  const id = await anotar({ propuesta, motivo: null, gasto });
  return Response.json({ propuesta: { ...propuesta, id } } satisfies RespuestaProponer);
}
