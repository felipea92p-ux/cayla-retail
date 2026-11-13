import { createClient } from "@/lib/supabase/server";
import { capturarError } from "@/lib/errores";
import { contarPedido, MAX_BYTES_POR_FOTO_IA } from "@/lib/foto-catalogo-reglas";
import { fotoCatalogoDisponible, llaveOpenAI, modeloOpenAI } from "@/lib/foto-catalogo";
import {
  OPENAI_TOPE_MS,
  OPENAI_URL_EDITAR,
  camposOpenAI,
  costoDeUso,
  imagenDeRespuesta,
  mensajeParaTienda,
  pedidoDeCatalogo,
  type AnguloDeFoto,
} from "@/lib/openai-imagen-reglas";

// POST /api/fotos/catalogo — «Catálogo con IA» de Editar y Nuevo producto (2026-11-13; investigación y medidas:
// docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md).
//
// CONTRATO
//   PROMETE: con la foto de frente de UN color (y, si vienen, su espalda, un detalle de la tela y el MOLDE —la foto de catálogo de otro color de
//            la misma prenda—), devuelve el PNG transparente de la foto de catálogo: la prenda en un maniquí invisible, de frente, y con molde, la
//            misma estructura que el molde (99 % de la silueta, medido). Lo que costó va en `x-costo-usd`.
//   ASUME:   sesión válida (el proxy ya responde 401 sin ella) y que la cuenta ve el módulo Productos: es quien sube fotos.
//   NO HACE: no guarda nada. Quien llama sube la imagen y la original (`lib/producto-fotos.ts`) y la anota al guardar la ficha.
//
// POR QUÉ EN EL SERVIDOR: la llave de OpenAI gasta saldo de CAYLA. En el navegador cualquiera con la consola abierta la copia (el mismo criterio que
// el padrón, `app/api/padron/route.ts`). Sin llave (o si OpenAI no responde) responde un error dicho para la tienda y la foto real queda igual:
// el ERP nunca depende de la IA (principio 9).
export const dynamic = "force-dynamic";
/** Una edición tarda ~25 s; con margen para un pico de OpenAI. Más allá, `OPENAI_TOPE_MS` corta y la tienda ve «Prueba en un rato». */
export const maxDuration = 150;

// El freno por persona (`contarPedido`). Es por instancia del servidor: un tope razonable contra un bucle desbocado, no un candado.
const ventanas = new Map<string, { desde: number; usos: number }>();

function error(texto: string, status: number) {
  return Response.json({ error: texto }, { status });
}

/**
 * GET: lo que esta cuenta puede hacer con las fotos de una prenda nueva fuera de Productos (Recibir ▸ «Crear la prenda que llegó»): `fotos`, si
 * puede guardarlas (la misma regla que `producto_fotos`: `fn_puede_editar_catalogo`), e `ia`, si además puede pedir la de catálogo (la llave
 * está puesta y ve Productos, como el POST). No gasta nada. Sin sesión o sin respuesta de la base: las dos en falso.
 */
export async function GET() {
  const nada = Response.json({ fotos: false, ia: false });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return nada;
  const [catalogo, productos] = await Promise.all([
    supabase.rpc("fn_puede_editar_catalogo" as never),
    supabase.rpc("fn_ve_modulo", { p_clave: "productos" }),
  ]);
  if (catalogo.error) {
    capturarError("fotos/catalogo: no se pudo revisar el permiso de fotos", catalogo.error);
    return nada;
  }
  const fotos = catalogo.data === true;
  return Response.json({ fotos, ia: fotos && fotoCatalogoDisponible() && productos.data === true });
}

export async function POST(request: Request) {
  if (!fotoCatalogoDisponible()) return error("La foto de catálogo no está disponible ahora. Avísale a tu líder.", 503);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("Tu sesión se cerró. Vuelve a entrar.", 401);

  const { data: veProductos, error: errModulo } = await supabase.rpc("fn_ve_modulo", { p_clave: "productos" });
  if (errModulo) {
    capturarError("fotos/catalogo: no se pudo revisar el permiso", errModulo);
    return error("No se pudo revisar tu permiso. Prueba de nuevo.", 503);
  }
  if (!veProductos) return error("No tienes acceso a Productos.", 403);

  const cuenta = contarPedido(ventanas.get(user.id), Date.now());
  ventanas.set(user.id, cuenta.ventana);
  if (cuenta.excede) return error("Muchas fotos seguidas. Prueba en un minuto.", 429);

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return error("No llegó la foto. Prueba de nuevo.", 400);
  }
  const fotos: Partial<Record<AnguloDeFoto, File>> = {};
  for (const angulo of ["frente", "espalda", "detalle", "molde"] as const) {
    const f = formulario.get(angulo);
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_BYTES_POR_FOTO_IA) return error("Una de las fotos pesa demasiado. Prueba de nuevo.", 400);
    fotos[angulo] = f;
  }
  if (!fotos.frente) return error("Falta la foto de frente.", 400);

  const pedido = pedidoDeCatalogo({ espalda: Boolean(fotos.espalda), detalle: Boolean(fotos.detalle), molde: Boolean(fotos.molde) });
  const envio = new FormData();
  // El orden importa: el pedido nombra cada foto por su número (IMAGEN 1 es el frente; el molde, la última).
  if (pedido.orden.length === 1) envio.set("image", fotos.frente, "frente.jpg");
  else for (const angulo of pedido.orden) envio.append("image[]", fotos[angulo]!, `${angulo}.${angulo === "molde" ? "webp" : "jpg"}`);
  for (const [clave, valor] of Object.entries(camposOpenAI(modeloOpenAI(), { prompt: pedido.prompt }))) envio.set(clave, valor);

  let respuesta: Response;
  try {
    respuesta = await fetch(OPENAI_URL_EDITAR, {
      method: "POST",
      headers: { Authorization: `Bearer ${llaveOpenAI()}` },
      body: envio,
      signal: AbortSignal.timeout(OPENAI_TOPE_MS),
      cache: "no-store",
    });
  } catch (e) {
    const tiempo = e instanceof Error && e.name === "TimeoutError";
    capturarError("fotos/catalogo: OpenAI no respondió", e, { tiempo });
    return error("La IA no responde ahora. Prueba en un rato.", 504);
  }

  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    // Al registro, el estado y el texto de OpenAI (sin fotos, sin la llave): sirven para saber si es saldo, verificación o un pico.
    capturarError("fotos/catalogo: OpenAI rechazó el pedido", new Error(`OpenAI ${respuesta.status}`), {
      estado: respuesta.status,
      detalle: JSON.stringify(cuerpo)?.slice(0, 300),
    });
    return error(mensajeParaTienda(respuesta.status, cuerpo), 502);
  }
  const b64 = imagenDeRespuesta(cuerpo);
  if (!b64) {
    capturarError("fotos/catalogo: OpenAI respondió sin imagen", new Error("sin imagen"));
    return error("La IA no responde ahora. Prueba en un rato.", 502);
  }

  const cabeceras = new Headers({ "Content-Type": "image/png", "Cache-Control": "no-store" });
  const costo = costoDeUso(cuerpo);
  if (costo !== null) cabeceras.set("x-costo-usd", costo.toFixed(4));
  return new Response(Buffer.from(b64, "base64"), { status: 200, headers: cabeceras });
}
