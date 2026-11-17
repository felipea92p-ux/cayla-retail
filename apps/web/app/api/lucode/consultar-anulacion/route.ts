import { createClient } from "@/lib/supabase/server";
import { consultarAnulacionLucode, entornoLucode } from "@/lib/lucode";
import { capturarError } from "@/lib/errores";
import { confirmarBajaEnLaBase } from "@/lib/confirmar-baja-sunat";

// POST /api/lucode/consultar-anulacion  { comprobante_id: string }
//
// CONTRATO
//   PROMETE: pregunta a Lucode si una baja YA PEDIDA terminó, y si SUNAT la
//            confirmó, recién ahí escribe `anulado` en la base, con la llave
//            del servidor (`fn_confirmar_baja_sunat`, ADR-0673).
//   ASUME:   el comprobante tiene `anulacion_solicitada_at` — o sea que
//            alguien ya pidió la baja por /api/lucode/anular.
//   NO HACE: no vuelve a pedir la baja. Reenviar un resumen diario ya enviado
//            no es un reintento: es otro documento tributario.
//
// Existe porque una baja de boleta se resuelve en diferido y el sistema no
// puede quedarse esperando: sin esto un comprobante se queda en "Anulación en
// trámite" para siempre, aunque SUNAT ya haya respondido (le pasó a
// B004-000003 el 2026-09-09).

export async function POST(request: Request) {
  let body: { comprobante_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!body.comprobante_id) return Response.json({ error: "Falta comprobante_id" }, { status: 400 });

  // La sesión de quien consulta decide si ve el comprobante (RLS: su sede). Confirmar no firma a nadie: quien pidió la baja ya
  // quedó en `anulado_por` (ADR-0673), así que aquí no hace falta el responsable del combo.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: c, error: errC } = await supabase
    .from("comprobantes")
    .select("id, tipo, serie, numero, estado, entorno_transmision, anulacion_solicitada_at")
    .eq("id", body.comprobante_id)
    .maybeSingle();

  // Un fallo de consulta NO es "no encontrado": si se confunden, quien anula concluye que
  // el comprobante no existe y lo vuelve a emitir. 503 dice "reintenta", 404 dice "no está".
  if (errC) {
    capturarError("lucode/consultar-anulacion: no se pudo leer el comprobante", errC, { comprobante_id: body.comprobante_id });
    return Response.json({ error: "No se pudo leer el comprobante. Reintenta en un momento." }, { status: 503 });
  }
  if (!c) return Response.json({ error: "Comprobante no encontrado o sin permiso para verlo" }, { status: 404 });
  if (!c.anulacion_solicitada_at) {
    return Response.json({ error: "Este comprobante no tiene una baja pedida — no hay nada que consultar." }, { status: 409 });
  }
  if (c.estado === "anulado") {
    return Response.json({ anulacion: "confirmada", yaEstaba: true });
  }
  if (c.entorno_transmision && c.entorno_transmision !== entornoLucode()) {
    return Response.json(
      { error: `Se transmitió en "${c.entorno_transmision}" y ahora estás en "${entornoLucode()}". No se puede consultar desde el otro ambiente.` },
      { status: 409 }
    );
  }

  const r = await consultarAnulacionLucode(
    c.tipo as "boleta" | "factura" | "nota_credito" | "nota_debito",
    c.serie,
    c.numero
  );
  if (!r.ok) return Response.json({ error: r.detalle, motivo: r.motivo }, { status: 502 });

  // Solo "confirmada" escribe. "en_tramite" y "no_anulado" no tocan nada: el
  // comprobante se queda como está y se puede volver a consultar.
  if (r.anulacion !== "confirmada") {
    return Response.json({ anulacion: r.anulacion, estadoCrudo: r.estadoCrudo, mensaje: r.mensaje });
  }

  // SUNAT la confirmó: «anulado» lo escribe el servidor (ADR-0673). No toca el motivo ni quién la pidió: esta ruta confirma una
  // decisión que ya se tomó, no toma otra.
  const { error: errGuardar } = await confirmarBajaEnLaBase(c.id, {
    estado: r.estadoCrudo,
    mensaje: r.mensaje,
    consultado_at: new Date().toISOString(),
  });
  if (errGuardar) {
    capturarError("lucode/consultar-anulacion: SUNAT confirmó pero sin guardar", new Error(errGuardar), {
      comprobante_id: c.id,
      comprobante: `${c.serie}-${c.numero}`,
    });
    return Response.json(
      { error: `SUNAT confirmó la baja pero no se pudo guardar: ${errGuardar}`, anulacion: "confirmada" },
      { status: 500 }
    );
  }

  return Response.json({ anulacion: "confirmada", estadoCrudo: r.estadoCrudo, mensaje: r.mensaje });
}
