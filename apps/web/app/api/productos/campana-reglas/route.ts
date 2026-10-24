import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { firmaDeEncabezados } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { leerCuerpoOferta, reglaDeFila, type FilaRegla } from "@/lib/campana-reglas";

// POST  /api/productos/campana-reglas → guarda una oferta de una campaña (nueva o editada). «Tres preguntas», Felipe 2026-10-23.
// PATCH /api/productos/campana-reglas → { id, accion: "activar" | "retirar" } sobre una oferta que ya existe.
//
// PROMETE: devolver SIEMPRE la lista fresca de ofertas (`campana_reglas()`), para que la hoja se repinte sin otra consulta.
// ASUME: quien llega es de la web y ve Insignias, Campañas o Campañas de la tienda web; lo demás (quién puede activar, que la campaña
//   exista y esté activa, que las fechas quepan, que la oferta rija algún día) lo decide y lo vuelve a exigir la base
//   (`guardar_campana_regla`, `activar_campana_regla`, `retirar_campana_regla`): esta ruta no es la barrera, es la puerta.
// CAÍDA: si la base no responde, el error vuelve traducido y NO se toca nada (cada función de la base es una sola transacción).
// Quién firma: la pantalla manda `x-responsable-omitido: etiqueta_campana` (ponerle campaña a una etiqueta; las ofertas son parte de
// su configuración): con la cuenta de una persona firma ella; una terminal no registra ofertas (la base no la deja sin autor).

type ErrorRpc = { code?: string; message: string };
type Llamada = { data: unknown; error: ErrorRpc | null };

/** Las funciones nuevas todavía no están en los tipos generados (viven en la migración 20261023232000): se nombran a mano. */
async function llamar(supabase: Awaited<ReturnType<typeof createClient>>, funcion: string, args?: Record<string, unknown>): Promise<Llamada> {
  return (await supabase.rpc(funcion as never, (args ?? {}) as never)) as unknown as Llamada;
}

async function listaFresca(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await llamar(supabase, "campana_reglas");
  if (error) return { error: traducirError(error, "leer las ofertas", { lectura: true }), reglas: [] };
  return { error: null, reglas: ((data as FilaRegla[] | null) ?? []).map(reglaDeFila) };
}

async function exigirPuerta() {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarEtiquetas") && !veModulo(persona, "campanas") && !veModulo(persona, "campanas_web")) {
    return { persona, respuesta: Response.json({ error: "Registrar ofertas necesita el módulo Insignias o Campañas en tu rol." }, { status: 403 }) };
  }
  return { persona, respuesta: null };
}

export async function POST(request: Request) {
  const { respuesta } = await exigirPuerta();
  if (respuesta) return respuesta;

  const leido = leerCuerpoOferta(await request.json().catch(() => null));
  if (!leido.ok) return Response.json({ error: leido.error }, { status: 400 });
  const o = leido.valor;

  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  const { data, error } = await llamar(supabase, "guardar_campana_regla", {
    p_regla_id: o.id,
    p_etiqueta_id: o.etiquetaId,
    p_nombre: o.nombre,
    p_porcentaje: o.porcentaje,
    p_desde: o.desde,
    p_hasta: o.hasta,
    p_dias_semana: o.dias,
    p_categorias_solo: o.categoriasSolo,
    p_categorias_fuera: o.categoriasFuera,
    p_incluye_claure: o.incluyeClaure,
    p_sede_ids: o.sedeIds,
    p_activar: o.activar,
  });
  if (error) return Response.json({ error: traducirError(error, "guardar la oferta") }, { status: 400 });

  const lista = await listaFresca(supabase);
  return Response.json({ id: data as string, reglas: lista.reglas, avisoLectura: lista.error });
}

export async function PATCH(request: Request) {
  const { respuesta } = await exigirPuerta();
  if (respuesta) return respuesta;

  const cuerpo = (await request.json().catch(() => null)) as { id?: unknown; accion?: unknown } | null;
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  if (!id) return Response.json({ error: "Falta la oferta." }, { status: 400 });
  if (cuerpo?.accion !== "activar" && cuerpo?.accion !== "retirar") {
    return Response.json({ error: "Solo se puede activar o retirar una oferta." }, { status: 400 });
  }

  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  const { error } = await llamar(supabase, cuerpo.accion === "activar" ? "activar_campana_regla" : "retirar_campana_regla", { p_regla_id: id });
  if (error) return Response.json({ error: traducirError(error, cuerpo.accion === "activar" ? "activar la oferta" : "retirar la oferta") }, { status: 400 });

  const lista = await listaFresca(supabase);
  return Response.json({ ok: true, reglas: lista.reglas, avisoLectura: lista.error });
}
