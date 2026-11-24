import { capturarError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase-admin";

// GET /api/recibir/foto-qr/<archivo> — la computadora recoge una foto que subió el celular por el QR (ADR-0699). CON sesión.
//
// CONTRATO
//   PROMETE: a la cuenta que pidió el QR, y a nadie más, le entrega los bytes de la foto UNA vez y la borra del almacén.
//   ASUME:   que `marcar_foto_por_qr_recogida` dice de quién es (compara con la cuenta, `auth.uid()`) y la marca antes de entregarla.
//   NO HACE: no la sube al catálogo: llega a la pantalla como si se hubiera tomado ahí, y sigue el camino de siempre.
//
// SI ALGO NO RESPONDE: la pantalla vuelve a preguntar en el próximo turno; si la marca quedó puesta y la entrega falló, esa foto se pierde
// y la persona saca otra (no hay dinero ni stock en juego).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await params;
  if (!UUID.test(archivo)) return Response.json({ error: "No existe" }, { status: 404 });

  const supabase = await createClient();
  const { data: ruta, error } = (await supabase.rpc("marcar_foto_por_qr_recogida" as never, { p_archivo_id: archivo } as never)) as unknown as { data: unknown; error: unknown };
  if (error || typeof ruta !== "string") return Response.json({ error: "Esa foto ya se recogió o no es tuya" }, { status: 403 });

  try {
    const almacen = crearClienteAdmin().storage.from("retail-fotos-por-qr");
    const { data, error: errBajar } = await almacen.download(ruta);
    if (errBajar || !data) throw errBajar ?? new Error("sin datos");
    // relleno-a-proposito: si no se puede borrar, la foto queda en el almacén privado sin dueño; nadie la lee y no frena la entrega.
    await almacen.remove([ruta]).catch(() => null);
    return new Response(data, { headers: { "content-type": data.type || "image/jpeg", "cache-control": "no-store" } });
  } catch (e) {
    capturarError("foto-qr.recoger", e, { archivo });
    return Response.json({ error: "No se pudo traer la foto" }, { status: 503 });
  }
}
