import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";
import { llaveOpenAI } from "@/lib/foto-catalogo";
import {
  MODELO_MEDIDA_IA_POR_DEFECTO,
  RECORTES_POR_CORRIDA,
  TOPE_MEDIDA_IA_MS,
  medidaDeRespuesta,
  pedidoDeMedida,
  urlPublicaDelRecorte,
} from "@/lib/medida-ia-reglas";

// GET /api/fotos/medir-recortes — el trabajo programado de Vercel (`vercel.json` → `crons`), cada 10 minutos (ADR-0705).
// Toma los recortes cuya medida de la IA falta (`retail.recortes_sin_medida_ia`, los listos primero), le pregunta a la IA qué prenda es, si va
// holgada o metida y a qué altura están sus axilas, y lo guarda (`retail.anotar_medida_ia`). La tienda usa la axila para dimensionar cada
// blusa por su pecho y no por su borde de abajo (una blusa con nudo salía agrandada 35 %). Nadie del equipo hace nada: un recorte nuevo
// queda medido en la siguiente corrida.
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa clave no pasa nadie. Entra con la llave de servicio: las dos funciones son solo
// del servidor. La foto va a OpenAI por su URL pública (la misma que ya ve cualquiera en la tienda): no viaja ningún dato de clientes.
//
// SE DEGRADA ASÍ: sin OPENAI_API_KEY, no mide nada (200, `sinLlave`). Si la IA no responde a tiempo, ese recorte queda sin medir y se reintenta
// en la siguiente corrida; si responde algo que no calza, se anota como fallo y no se reintenta (la prenda se dibuja como siempre). Si la base
// no responde, 500 y `capturarError`. En ningún caso cambia lo que ya se ve en la tienda.

export const maxDuration = 60;
const A_LA_VEZ = 3;

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const llave = llaveOpenAI();
  if (!llave) return Response.json({ sinLlave: true, medidos: 0 });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("fotos/medir-recortes (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // Las funciones son nuevas y los tipos generados todavía no las traen: se llaman por nombre.
  const { data, error } = await supabase.rpc("recortes_sin_medida_ia" as never, { p_limite: RECORTES_POR_CORRIDA } as never);
  if (error) {
    capturarError("fotos/medir-recortes (cron): recortes_sin_medida_ia falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  const pendientes = ((data as { foto: string; recorte: string }[] | null) ?? []).filter((r) => r.foto && r.recorte);
  const modelo = process.env.OPENAI_MEDIDA_MODELO?.trim() || MODELO_MEDIDA_IA_POR_DEFECTO;

  const cuenta = { medidos: 0, fallos: 0, sinRespuesta: 0, cambiados: 0 };
  async function medirUno(r: { foto: string; recorte: string }) {
    let respuesta: Response;
    try {
      respuesta = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
        body: JSON.stringify(pedidoDeMedida(urlPublicaDelRecorte(supabaseUrl, r.recorte), modelo)),
        signal: AbortSignal.timeout(TOPE_MEDIDA_IA_MS),
      });
    } catch (e) {
      // Sin respuesta (tope de espera o red): no se anota nada, se reintenta en la siguiente corrida.
      cuenta.sinRespuesta++;
      capturarError(`fotos/medir-recortes (cron): OpenAI no respondió (foto ${r.foto})`, e);
      return;
    }
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (respuesta.status === 429 || respuesta.status >= 500) {
      // OpenAI ocupado o caído: se reintenta después, sin marcar el recorte.
      cuenta.sinRespuesta++;
      capturarError(`fotos/medir-recortes (cron): OpenAI respondió ${respuesta.status} (foto ${r.foto})`, new Error(String(respuesta.status)));
      return;
    }
    const medida = respuesta.ok ? medidaDeRespuesta(cuerpo, modelo) : null;
    if (!medida) cuenta.fallos++;
    const { data: guardado, error: errorAlGuardar } = await supabase.rpc(
      "anotar_medida_ia" as never,
      { p_foto: r.foto, p_recorte: r.recorte, p_medida: medida ?? { fallo: true, modelo, estado: respuesta.status } } as never,
    );
    if (errorAlGuardar) {
      capturarError(`fotos/medir-recortes (cron): anotar_medida_ia falló (foto ${r.foto})`, errorAlGuardar);
      return;
    }
    if (guardado === false) cuenta.cambiados++;
    else if (medida) cuenta.medidos++;
  }

  for (let i = 0; i < pendientes.length; i += A_LA_VEZ) {
    await Promise.all(pendientes.slice(i, i + A_LA_VEZ).map(medirUno));
  }
  return Response.json({ pendientes: pendientes.length, ...cuenta });
}
