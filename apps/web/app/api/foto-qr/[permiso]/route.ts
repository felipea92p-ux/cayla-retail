import { createHash, randomUUID } from "node:crypto";
import { capturarError } from "@/lib/errores";
import { esPermiso, fotoAceptada, mensajeDelQr, rutaDeFotoQr } from "@/lib/foto-por-qr-reglas";
import { crearClienteAdmin } from "@/lib/supabase-admin";

// POST /api/foto-qr/<permiso> — el celular sube la foto de un modelo, SIN sesión (ADR-0699, Felipe 2026-11-24 eligió «sin sesión»).
//
// CONTRATO
//   PROMETE: con un permiso vigente y con lugar, guarda la foto en el almacén privado `retail-fotos-por-qr` y la anota para la computadora
//            que pidió el QR; responde `{ ok: true, quedan }`. Si no, `{ ok: false, error }` con una frase para quien tiene el celular,
//            y no deja nada guardado.
//   ASUME:   que la base solo guarda la huella del permiso, y que `usar_foto_por_qr` bloquea la fila (dos fotos a la vez no pasan el tope).
//   NO HACE: no deja leer nada del ERP: lo único que dice es si subió y cuántas quedan.
//
// POR QUÉ CON LA LLAVE DE SERVICIO Y NO CON `anon`: así no hay ninguna política del almacén ni de la base abierta a internet. La única
// puerta es esta ruta, que primero mira la forma del permiso (sin tocar la base), después el permiso, después que el archivo sea una foto de
// verdad (su firma, no su nombre), y recién ahí guarda.
//
// SI ALGO NO RESPONDE: sin la llave o con la base caída, el celular ve «No se pudo subir la foto» y la computadora sigue esperando; nada
// queda a medias, porque una foto guardada que la base no anotó se borra en el acto.

export async function POST(req: Request, { params }: { params: Promise<{ permiso: string }> }) {
  const { permiso } = await params;
  if (!esPermiso(permiso)) return Response.json({ ok: false, error: mensajeDelQr("qr_no_existe") }, { status: 404 });

  let archivo: File | null = null;
  try {
    const datos = await req.formData();
    const f = datos.get("foto");
    archivo = f instanceof File ? f : null;
  } catch {
    archivo = null;
  }
  if (!archivo) return Response.json({ ok: false, error: "No llegó ninguna foto. Tómala otra vez." }, { status: 400 });

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const aceptada = fotoAceptada(bytes.slice(0, 16), bytes.byteLength);
  if ("motivo" in aceptada) return Response.json({ ok: false, error: aceptada.motivo }, { status: 400 });

  const huella = createHash("sha256").update(permiso).digest("hex");
  let admin: ReturnType<typeof crearClienteAdmin>;
  try {
    admin = crearClienteAdmin();
  } catch (e) {
    capturarError("foto-qr.sin-llave", e);
    return Response.json({ ok: false, error: mensajeDelQr(null) }, { status: 503 });
  }

  type Info = { id: string; nombre: string; vigente: boolean; quedan: number };
  const { data: info, error: errInfo } = (await admin.rpc("fn_foto_por_qr_info" as never, { p_token_hash: huella } as never)) as unknown as { data: Info[] | null; error: unknown };
  const fila = Array.isArray(info) ? (info[0] ?? null) : null;
  if (errInfo) {
    capturarError("foto-qr.info", errInfo);
    return Response.json({ ok: false, error: mensajeDelQr(null) }, { status: 503 });
  }
  if (!fila) return Response.json({ ok: false, error: mensajeDelQr("qr_no_existe") }, { status: 404 });
  if (!fila.vigente) return Response.json({ ok: false, error: mensajeDelQr(fila.quedan > 0 ? "qr_vencido" : "qr_lleno") }, { status: 410 });

  const ruta = rutaDeFotoQr(fila.id, randomUUID(), aceptada.ext);
  const almacen = admin.storage.from("retail-fotos-por-qr");
  const subida = await almacen.upload(ruta, bytes, { contentType: aceptada.tipo, upsert: false });
  if (subida.error) {
    capturarError("foto-qr.subir", subida.error, { qr: fila.id });
    return Response.json({ ok: false, error: mensajeDelQr(null) }, { status: 503 });
  }

  const { data: quedan, error: errUsar } = (await admin.rpc("usar_foto_por_qr" as never, { p_token_hash: huella, p_ruta: ruta } as never)) as unknown as {
    data: unknown;
    error: { hint?: string } | null;
  };
  if (errUsar) {
    // La base no la anotó (venció o se llenó mientras subía): la foto guardada se borra, para que no quede nada sin dueño.
    await almacen.remove([ruta]);
    return Response.json({ ok: false, error: mensajeDelQr(errUsar.hint) }, { status: 410 });
  }
  return Response.json({ ok: true, quedan: typeof quedan === "number" ? quedan : 0 });
}
