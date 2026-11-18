import { createClient } from "@/lib/supabase/server";
import {
  PHOTOROOM_MAX_BYTES,
  PHOTOROOM_TOPE_MS,
  PHOTOROOM_URL_EDITAR,
  camposDelPerfil,
  esPerfilPhotoroom,
  mensajeDeErrorPhotoroom,
  type PerfilPhotoroom,
} from "@/lib/photoroom-reglas";
import { OPENAI_TOPE_MS, OPENAI_URL_EDITAR, camposOpenAI, costoDeUso, imagenDeRespuesta, mensajeDeErrorOpenAI, pedidoDeCatalogo } from "@/lib/openai-imagen-reglas";
import { esAcabado, fichaParaIA, type FichaParaIA } from "@/lib/ficha-foto-ia";
import { laboratorioAbierto, llaveDe, proveedoresDelLaboratorio } from "@/lib/laboratorio-fotos";

// POST /api/fotos/laboratorio — el laboratorio de fotos (2026-11-13; `docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md`).
//
// CONTRATO
//   PROMETE: manda UNA foto al proveedor del perfil pedido y devuelve la imagen tal cual:
//            `sin-fondo` y `maniqui` → Photoroom (`lib/photoroom-reglas.ts`); `openai` → la edición de catálogo de OpenAI
//            (`lib/openai-imagen-reglas.ts`), con lo que costó en `x-costo-usd` (OpenAI no publica precio por foto). Con `molde` (la foto
//            de catálogo de otro color de la misma prenda), OpenAI copia su estructura y toma de la foto solo el color y el estampado.
//            Desde el 2026-11-16 arma el MISMO pedido que producción (`pedidoDeCatalogo`): con la ficha de la prenda (`prefijo`, `tipo`, `tejido`,
//            `patron`), la foto de cerca de la tela (`detalle`) y el `acabado` de la tela, para comparar las tres versiones (`ACABADOS`). Sin
//            ficha ni detalle, el pedido es el medido de siempre.
//   ASUME:   sesión válida (el proxy ya responde 401 sin ella; aquí se vuelve a mirar).
//   NO HACE: no guarda nada: ni en el almacén de fotos ni en la base. Es para MIRAR.
//
// POR QUÉ PASA POR EL SERVIDOR: las llaves gastan saldo. Si viajaran al navegador, cualquiera con la consola abierta las copia (el mismo
// criterio que el padrón, `app/api/padron/route.ts`). Y solo existe fuera de producción (`laboratorioAbierto`).
export const dynamic = "force-dynamic";

type Perfil = PerfilPhotoroom | "openai";

async function hayPersona(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

function error(texto: string, status: number) {
  return Response.json({ error: texto }, { status });
}

export async function POST(request: Request) {
  if (!laboratorioAbierto()) return error("El laboratorio de fotos no está abierto aquí.", 404);
  if (!(await hayPersona())) return error("No autorizado", 401);

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return error("No llegó la foto.", 400);
  }
  const foto = formulario.get("foto");
  const perfil = formulario.get("perfil");
  if (!(foto instanceof File) || foto.size === 0) return error("No llegó la foto.", 400);
  if (foto.size > PHOTOROOM_MAX_BYTES) return error("La foto pesa más de 5 MB.", 400);
  if (perfil !== "openai" && !esPerfilPhotoroom(perfil)) return error("Perfil desconocido.", 400);

  const proveedores = proveedoresDelLaboratorio();
  if (perfil === "openai") {
    if (!proveedores.openai) return error("Falta OPENAI_API_KEY en apps/web/.env.local.", 404);
    const archivo = (campo: string) => {
      const f = formulario.get(campo);
      return f instanceof File && f.size > 0 ? f : null;
    };
    const molde = archivo("molde");
    const detalle = archivo("detalle");
    if ((molde && molde.size > PHOTOROOM_MAX_BYTES) || (detalle && detalle.size > PHOTOROOM_MAX_BYTES)) return error("Una de las fotos pesa más de 5 MB.", 400);
    const texto = (campo: string) => {
      const v = formulario.get(campo);
      return typeof v === "string" ? v : null;
    };
    const acabado = formulario.get("acabado");
    const ficha = fichaParaIA(
      { prefijo: texto("prefijo"), tipo: texto("tipo"), tejido: texto("tejido"), patron: texto("patron") },
      { acabado: esAcabado(acabado) ? acabado : undefined },
    );
    return conOpenAI({ frente: foto, detalle, molde }, proveedores.modeloOpenAI, ficha);
  }
  if (!proveedores.photoroom) return error("Falta PHOTOROOM_API_KEY en apps/web/.env.local.", 404);
  return conPhotoroom(foto, perfil as Perfil & PerfilPhotoroom);
}

async function conPhotoroom(foto: File, perfil: PerfilPhotoroom): Promise<Response> {
  const envio = new FormData();
  envio.set("imageFile", foto, foto.name || "foto");
  for (const [clave, valor] of Object.entries(camposDelPerfil(perfil))) envio.set(clave, valor);

  let respuesta: Response;
  try {
    respuesta = await fetch(PHOTOROOM_URL_EDITAR, {
      method: "POST",
      headers: { "x-api-key": llaveDe("photoroom") },
      body: envio,
      signal: AbortSignal.timeout(PHOTOROOM_TOPE_MS),
      cache: "no-store",
    });
  } catch (e) {
    const tiempo = e instanceof Error && e.name === "TimeoutError";
    return error(tiempo ? "Photoroom tardó demasiado. Prueba de nuevo." : "No se pudo llegar a Photoroom.", 504);
  }
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    // Sin la foto ni la llave: el estado y el texto del proveedor bastan para saber qué pasó.
    console.warn("[laboratorio-fotos] Photoroom respondió", respuesta.status, JSON.stringify(cuerpo)?.slice(0, 300));
    return error(mensajeDeErrorPhotoroom(respuesta.status, cuerpo), 502);
  }
  return new Response(await respuesta.arrayBuffer(), {
    status: 200,
    headers: { "Content-Type": respuesta.headers.get("content-type") ?? "image/png", "Cache-Control": "no-store" },
  });
}

async function conOpenAI(fotos: { frente: File; detalle: File | null; molde: File | null }, modelo: string, ficha: FichaParaIA | null): Promise<Response> {
  // El mismo pedido que producción (`app/api/fotos/catalogo/route.ts`): sin ficha ni detalle es exactamente el medido.
  const pedido = pedidoDeCatalogo({ detalle: Boolean(fotos.detalle), molde: Boolean(fotos.molde) }, ficha);
  const envio = new FormData();
  // El orden importa: el pedido nombra cada foto por su número (IMAGEN 1 es el frente; el molde, la última).
  if (pedido.orden.length === 1) envio.set("image", fotos.frente, fotos.frente.name || "foto");
  else
    for (const angulo of pedido.orden) {
      const f = angulo === "frente" ? fotos.frente : angulo === "detalle" ? fotos.detalle : fotos.molde;
      if (f) envio.append("image[]", f, `${angulo}.${angulo === "molde" ? "png" : "jpg"}`);
    }
  for (const [clave, valor] of Object.entries(camposOpenAI(modelo, { prompt: pedido.prompt }))) envio.set(clave, valor);

  let respuesta: Response;
  try {
    respuesta = await fetch(OPENAI_URL_EDITAR, {
      method: "POST",
      headers: { Authorization: `Bearer ${llaveDe("openai")}` },
      body: envio,
      signal: AbortSignal.timeout(OPENAI_TOPE_MS),
      cache: "no-store",
    });
  } catch (e) {
    const tiempo = e instanceof Error && e.name === "TimeoutError";
    return error(tiempo ? "OpenAI tardó demasiado. Prueba de nuevo." : "No se pudo llegar a OpenAI.", 504);
  }
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    console.warn("[laboratorio-fotos] OpenAI respondió", respuesta.status, JSON.stringify(cuerpo)?.slice(0, 300));
    return error(mensajeDeErrorOpenAI(respuesta.status, cuerpo), 502);
  }
  const b64 = imagenDeRespuesta(cuerpo);
  if (!b64) return error("OpenAI respondió sin imagen.", 502);

  const cabeceras = new Headers({ "Content-Type": "image/png", "Cache-Control": "no-store" });
  const costo = costoDeUso(cuerpo);
  if (costo !== null) cabeceras.set("x-costo-usd", costo.toFixed(4));
  return new Response(Buffer.from(b64, "base64"), { status: 200, headers: cabeceras });
}
