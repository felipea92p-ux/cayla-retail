import { createClient } from "@/lib/supabase/server";
import { anularBoletaLucode, anularDocumentoLucode, entornoLucode } from "@/lib/lucode";
import { firmaDeEncabezados, mensajeErrorResponsable } from "@/lib/responsable-reglas";

// POST /api/lucode/anular  { comprobante_id: string, motivo: string }
//
// CONTRATO
//   PROMETE: pide la baja de un comprobante ACEPTADO por el camino que SUNAT
//            exige según su tipo (resumen diario para boletas, comunicación de
//            baja para facturas y notas) y guarda el resultado real —
//            distinguiendo "confirmada" de "en trámite".
//   ASUME:   sesión válida y persona líder (la RPC lo vuelve a exigir; una
//            pantalla no es un permiso), y el responsable del combo en los
//            encabezados `x-responsable`/`x-ubicacion` (ADR-0161).
//   NO HACE: no decide el plazo. La documentación de Lucode se contradice
//            (3 vs 5 días) y SUNAT habla de 7: bloquear por una fecha
//            inventada acá negaría anulaciones legítimas. Se intenta, y si el
//            proveedor rechaza se muestra su motivo tal cual.
//
// Vive aparte de /api/lucode/emitir porque son dos hechos opuestos: uno
// consume un correlativo y el otro lo da de baja. Mezclarlos en una ruta con
// un flag es exactamente el tipo de pieza "que hace todo" que el repo evita.

export async function POST(request: Request) {
  let body: { comprobante_id?: string; motivo?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const comprobanteId = body.comprobante_id;
  const motivo = (body.motivo ?? "").trim();
  if (!comprobanteId) return Response.json({ error: "Falta comprobante_id" }, { status: 400 });
  if (motivo.length < 3) {
    return Response.json({ error: "La anulación necesita un motivo — queda registrado en el comprobante." }, { status: 400 });
  }

  // La firma del combo «Responsable» (ADR-0161) que mandó la pantalla viaja en cada consulta de este cliente, así
  // `anular_comprobante` queda firmada por quien eligió el combo (mismo patrón que /api/lucode/emitir).
  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  // El responsable se valida ANTES de pedirle la baja a Lucode: lo que llega a SUNAT no se deshace, y si la base
  // rechazara al responsable recién al guardar, la baja quedaría pedida sin registrarse aquí. Es la misma función
  // de las escrituras; si todavía no existe en esta base, no frena nada (el candado se degrada al de antes).
  const rpcLibre = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { code?: string; hint?: string; message: string } | null }>;
  const { error: errResponsable } = await rpcLibre("fn_actor_persona_id", { p_de_tienda: true });
  const porResponsable = mensajeErrorResponsable(errResponsable);
  if (porResponsable) return Response.json({ error: porResponsable, hint: errResponsable?.hint ?? null }, { status: 403 });

  const { data: comprobante, error: errComprobante } = await supabase
    .from("comprobantes")
    .select("id, tipo, serie, numero, estado, entorno_transmision")
    .eq("id", comprobanteId)
    .maybeSingle();

  // Un fallo de consulta NO es "no encontrado": si se confunden, quien anula concluye que
  // el comprobante no existe y lo vuelve a emitir. 503 dice "reintenta", 404 dice "no está".
  if (errComprobante) {
    return Response.json({ error: "No se pudo leer el comprobante. Reintenta en un momento." }, { status: 503 });
  }
  if (!comprobante) {
    return Response.json({ error: "Comprobante no encontrado o sin permiso para verlo" }, { status: 404 });
  }
  if (comprobante.estado !== "aceptado") {
    return Response.json(
      { error: `Solo se anula un comprobante aceptado por SUNAT (este está "${comprobante.estado}").` },
      { status: 409 }
    );
  }
  // Mismo criterio que las notas (ADR-0015): no se pide una baja real de algo
  // que solo existe en el sandbox, ni al revés.
  if (comprobante.entorno_transmision && comprobante.entorno_transmision !== entornoLucode()) {
    return Response.json(
      {
        error: `Este comprobante se transmitió en "${comprobante.entorno_transmision}" y ahora estás en "${entornoLucode()}". No se puede anular desde el otro ambiente.`,
      },
      { status: 409 }
    );
  }

  const tipo = comprobante.tipo as "boleta" | "factura" | "nota_credito" | "nota_debito";
  const resultado =
    tipo === "boleta"
      ? await anularBoletaLucode(comprobante.serie, comprobante.numero)
      : await anularDocumentoLucode(tipo, comprobante.serie, comprobante.numero, motivo);

  if (!resultado.ok) {
    // No se toca nada: el comprobante sigue aceptado y visible para reintentar.
    // Que Lucode diga que no —por plazo vencido, por ejemplo— no es una
    // anulación a medias, es una anulación que no ocurrió.
    return Response.json({ error: resultado.detalle, motivo: resultado.motivo }, { status: 502 });
  }

  // SUNAT procesa el resumen diario de forma diferida: PENDIENTE significa
  // "recibido, todavía no confirmado". Escribir 'anulado' con eso sería
  // repetir la mentira que cerró ADR-0015 en la otra dirección.
  const confirmada = resultado.estado === "ACEPTADO";
  if (resultado.estado === "RECHAZADO") {
    return Response.json(
      { error: `SUNAT rechazó la anulación: ${resultado.mensaje ?? "sin detalle"}`, resultado },
      { status: 409 }
    );
  }

  // Firmada con el responsable de los encabezados (el cliente de arriba se creó con esa firma).
  const { error: errGuardar } = await supabase.rpc("anular_comprobante", {
    p_comprobante_id: comprobante.id,
    p_motivo: motivo,
    p_confirmada: confirmada,
    p_respuesta: resultado,
  });
  if (errGuardar) {
    return Response.json(
      {
        error: `La baja se pidió (${resultado.estado}) pero no se pudo guardar: ${errGuardar.message}. No la vuelvas a pedir sin revisar el panel de Lucode.`,
        resultado,
      },
      { status: 500 }
    );
  }

  return Response.json({ confirmada, estado: resultado.estado, entorno: resultado.entorno });
}
