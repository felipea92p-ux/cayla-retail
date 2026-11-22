import { createClient } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { probarLlaveLucode } from "@/lib/lucode";
import { capturarError } from "@/lib/errores";

// POST /api/lucode/probar-aliada  { empresa_id: string }
//
// «Probar conexión» de una empresa aliada (ADR-0683, migración 20261122213000). La llave vive cifrada en el Vault y solo la lee el servidor
// (`fn_llave_lucode_aliada`, service_role): por eso la prueba no puede hacerse desde el navegador. No emite nada: pregunta a Lucode el estado de
// una boleta que no existe y mira si aceptó la llave. Solo un Admin la pide (lo pregunta la base con su sesión, no esta ruta).
// Responde { estado: "conectada" | "rechazada" | "sin_respuesta", entorno }. Nunca devuelve la llave.
export async function POST(request: Request) {
  let body: { empresa_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const id = typeof body.empresa_id === "string" && /^[0-9a-f-]{36}$/i.test(body.empresa_id) ? body.empresa_id : null;
  if (!id) return Response.json({ error: "Falta empresa_id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { data: esAdmin } = await supabase.rpc("fn_es_admin");
  if (esAdmin !== true) return Response.json({ error: "Solo un Admin prueba la conexión de una empresa aliada." }, { status: 403 });

  let servidor: ReturnType<typeof crearClienteAdmin>;
  try {
    servidor = crearClienteAdmin();
  } catch (e) {
    capturarError("lucode/probar-aliada: sin llave de servicio", e);
    return Response.json({ error: "El servidor no puede leer la llave ahora. Prueba en un rato." }, { status: 503 });
  }

  const { data: llave, error } = await servidor.rpc("fn_llave_lucode_aliada" as never, { p_id: id } as never);
  if (error) {
    capturarError("lucode/probar-aliada: no se leyó la llave", error, { empresa_id: id });
    return Response.json({ error: "No se pudo leer la llave guardada. Prueba en un rato." }, { status: 503 });
  }
  if (typeof llave !== "string" || !llave) {
    return Response.json({ error: "Esta empresa todavía no tiene una llave de Lucode guardada." }, { status: 409 });
  }

  const { aceptada, entorno } = await probarLlaveLucode(llave);
  if (aceptada === null) return Response.json({ estado: "sin_respuesta", entorno });

  const { error: errAnotar } = await servidor.rpc("anotar_prueba_lucode_aliada" as never, { p_id: id, p_conectada: aceptada } as never);
  if (errAnotar) capturarError("lucode/probar-aliada: no se anotó la prueba", errAnotar, { empresa_id: id });
  return Response.json({ estado: aceptada ? "conectada" : "rechazada", entorno });
}
