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
import { OPENAI_TOPE_MS, OPENAI_URL_EDITAR, camposOpenAI, costoDeUso, imagenDeRespuesta, mensajeDeErrorOpenAI } from "@/lib/openai-imagen-reglas";
import { laboratorioAbierto, llaveDe, proveedoresDelLaboratorio } from "@/lib/laboratorio-fotos";

// POST /api/fotos/laboratorio — el laboratorio de fotos (2026-11-13; `docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md`).
//
// CONTRATO
//   PROMETE: manda UNA foto al proveedor del perfil pedido y devuelve la imagen tal cual:
//            `sin-fondo` y `maniqui` → Photoroom (`lib/photoroom-reglas.ts`); `openai` → la edición de catálogo de OpenAI
//            (`lib/openai-imagen-reglas.ts`), con lo que costó en `x-costo-usd` (OpenAI no publica precio por foto). Con `molde` (la foto
//            de catálogo de otro color de la misma prenda), OpenAI copia su estructura y toma de la foto solo el color y el estampado.
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
    const molde = formulario.get("molde");
    return conOpenAI(foto, proveedores.modeloOpenAI, molde instanceof File && molde.size > 0 ? molde : null);
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

async function conOpenAI(foto: File, modelo: string, molde: File | null): Promise<Response> {
  const envio = new FormData();
  if (molde) {
    // El orden importa: el pedido llama IMAGEN 1 a la foto del color nuevo e IMAGEN 2 al molde.
    envio.append("image[]", foto, foto.name || "foto");
    envio.append("image[]", molde, "molde.png");
  } else envio.set("image", foto, foto.name || "foto");
  for (const [clave, valor] of Object.entries(camposOpenAI(modelo, { conMolde: Boolean(molde) }))) envio.set(clave, valor);

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
