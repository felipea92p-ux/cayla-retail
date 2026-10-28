import { createClient } from "@/lib/supabase/server";
import { anularBoletaLucode, anularDocumentoLucode, entornoLucode } from "@/lib/lucode";
import { firmaDeEncabezados, mensajeErrorResponsable } from "@/lib/responsable-reglas";
import { capturarError } from "@/lib/errores";
import { laBajaAnulaLaVenta, motivoDeAnulacionDeVenta, motivoParaNoAnularLaVenta, motivoParaNoPedirBaja } from "@/lib/anular-comprobante-reglas";
import type { EstadoComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import { hoyLima } from "@/lib/fechas-lima";

// POST /api/lucode/anular  { comprobante_id: string, motivo: string }
//
// CONTRATO
//   PROMETE: pide la baja de un comprobante ACEPTADO por el camino que SUNAT
//            exige según su tipo (resumen diario para boletas, comunicación de
//            baja para facturas y notas) y guarda el resultado real —
//            distinguiendo "confirmada" de "en trámite". Y, si es una boleta o
//            una factura de una venta, ANULA LA VENTA en el mismo acto
//            (`anular_venta`: las prendas vuelven al stock, la caja lo
//            descuenta), porque una baja con la venta viva es un estado
//            imposible (ADR-0016, act. 2026-10-14: 3 ventas así en dos semanas,
//            dos cobradas otra vez).
//   ASUME:   sesión válida y el responsable del combo en los encabezados
//            `x-responsable`/`x-ubicacion` (ADR-0161). Que vea Facturación
//            (antes, que fuera líder: ADR-0534), que no haya nota vigente ni
//            una baja en trámite se revisa ANTES de
//            llamar a Lucode (`motivoParaNoPedirBaja`); la RPC lo vuelve a
//            exigir al guardar. Y lo que `anular_venta` va a exigir (caja
//            abierta, mismo día, sin cambio ni devolución, módulo Devoluciones)
//            también se revisa ANTES (`motivoParaNoAnularLaVenta`): si la venta
//            no se puede anular, la baja no se pide y el camino es Devolución
//            con nota de crédito.
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
    .select("id, tipo, serie, numero, estado, entorno_transmision, anulacion_solicitada_at, venta_id")
    .eq("id", comprobanteId)
    .maybeSingle();

  // Un fallo de consulta NO es "no encontrado": si se confunden, quien anula concluye que
  // el comprobante no existe y lo vuelve a emitir. 503 dice "reintenta", 404 dice "no está".
  if (errComprobante) {
    capturarError("lucode/anular: no se pudo leer el comprobante", errComprobante, { comprobante_id: comprobanteId });
    return Response.json({ error: "No se pudo leer el comprobante. Reintenta en un momento." }, { status: 503 });
  }
  if (!comprobante) {
    return Response.json({ error: "Comprobante no encontrado o sin permiso para verlo" }, { status: 404 });
  }

  // Lo que `anular_comprobante` exige (el módulo Facturación, sin nota vigente) y la baja ya en trámite se revisan ANTES de Lucode: lo
  // que llega a SUNAT no se deshace, y si la base lo rechazara recién al guardar, la baja quedaría pedida sin
  // registrarse. Si no se puede saber (la base no responde), no se pide: 503, nunca «adelante».
  const [{ data: veFacturacion, error: errModulo }, { count: notasVigentes, error: errNotas }] = await Promise.all([
    supabase.rpc("fn_ve_modulo", { p_clave: "facturacion" }),
    supabase
      .from("comprobantes")
      .select("id", { count: "exact", head: true })
      .eq("comprobante_original_id", comprobante.id)
      .neq("estado", "anulado"),
  ]);
  if (errModulo || errNotas || notasVigentes === null) {
    capturarError("lucode/anular: no se pudo revisar el permiso o las notas", errModulo ?? errNotas, { comprobante_id: comprobante.id });
    return Response.json({ error: "No se pudo comprobar si se puede anular. Reintenta en un momento." }, { status: 503 });
  }
  const rechazo = motivoParaNoPedirBaja({
    veFacturacion: veFacturacion === true,
    estado: comprobante.estado as EstadoComprobante,
    anulacion_solicitada_at: comprobante.anulacion_solicitada_at,
    notasVigentes,
  });
  if (rechazo) return Response.json({ error: rechazo.error }, { status: rechazo.status });
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

  // La venta que documenta (ADR-0016, act. 2026-10-14): todo lo que `anular_venta` va a exigir se mira ANTES de pedir la baja, porque la
  // baja no se deshace y pedirla con la venta sin anular es justo el estado imposible que esto cierra. Si no se puede leer, 503: nunca
  // «adelante» a ciegas. Una venta ya anulada no frena nada (la baja va sola).
  let ventaParaAnular: { id: string; items: string[] } | null = null;
  if (laBajaAnulaLaVenta(tipo as TipoComprobante, comprobante.venta_id)) {
    const ventaId = comprobante.venta_id as string;
    const rpcDatos = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    const [venta, items, veDevoluciones] = await Promise.all([
      supabase.from("ventas").select("id, estado, caja_id, created_at").eq("id", ventaId).maybeSingle(),
      supabase.from("venta_items").select("id").eq("venta_id", ventaId),
      rpcDatos("fn_ve_modulo", { p_clave: "devoluciones" }),
    ]);
    const itemIds = (items.data ?? []).map((i) => i.id);
    // Las mismas tres preguntas de `anular_venta`: un cambio cuelga de la línea (`cambios.venta_item_id`), una devolución de la venta.
    const [cambios, devoluciones, caja] = await Promise.all([
      supabase.from("cambios").select("id", { count: "exact", head: true }).in("venta_item_id", itemIds),
      supabase.from("devoluciones").select("id", { count: "exact", head: true }).eq("venta_id", ventaId).neq("estado", "rechazada"),
      venta.data?.caja_id ? supabase.from("cajas").select("estado").eq("id", venta.data.caja_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const falla = venta.error ?? items.error ?? veDevoluciones.error ?? cambios.error ?? devoluciones.error ?? caja.error;
    if (falla || !venta.data || !items.data || cambios.count === null || devoluciones.count === null) {
      capturarError("lucode/anular: no se pudo leer la venta del comprobante", falla, { comprobante_id: comprobante.id, venta_id: ventaId });
      return Response.json({ error: "No se pudo leer la venta de este comprobante. Reintenta en un momento." }, { status: 503 });
    }
    const rechazoVenta = motivoParaNoAnularLaVenta({
      estado: venta.data.estado,
      cajaEstado: caja.data?.estado ?? null,
      diaVenta: hoyLima(new Date(venta.data.created_at)),
      hoy: hoyLima(),
      tieneCambioODevolucion: cambios.count > 0 || devoluciones.count > 0,
      veDevoluciones: veDevoluciones.data === true,
    });
    if (rechazoVenta) return Response.json({ error: rechazoVenta.error }, { status: rechazoVenta.status });
    if (venta.data.estado !== "anulada") ventaParaAnular = { id: venta.data.id, items: items.data.map((i) => i.id) };
  }

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
    // La baja ya está pedida ante SUNAT: si esto se pierde con el aviso de la pantalla, nadie sabe que hay que revisarla.
    capturarError("lucode/anular: baja pedida pero sin guardar", errGuardar, {
      comprobante_id: comprobante.id,
      comprobante: `${comprobante.serie}-${comprobante.numero}`,
      estado_sunat: resultado.estado,
    });
    return Response.json(
      {
        error: `La baja se pidió (${resultado.estado}) pero no se pudo guardar: ${errGuardar.message}. No la vuelvas a pedir sin revisar el panel de Lucode.`,
        resultado,
      },
      { status: 500 }
    );
  }

  // La venta se anula en el mismo acto, con la misma firma. Cada prenda vuelve «vendible»: si la venta fue real y solo el documento
  // estaba mal, se vuelve a cobrar y el stock vuelve a salir; si no se hizo, nunca salió. Si esto falla, la baja ya está pedida y
  // guardada: se dice tal cual, con qué hacer, y queda en Sentry; nunca se pide la baja otra vez.
  let ventaAnulada = false;
  if (ventaParaAnular) {
    const { error: errVenta } = await supabase.rpc("anular_venta", {
      p_venta_id: ventaParaAnular.id,
      p_motivo: motivoDeAnulacionDeVenta(comprobante.serie, comprobante.numero, motivo),
      p_items: ventaParaAnular.items.map((id) => ({ venta_item_id: id, condicion: "vendible" })),
    });
    if (errVenta) {
      capturarError("lucode/anular: baja guardada pero la venta no se anuló", errVenta, {
        comprobante_id: comprobante.id,
        comprobante: `${comprobante.serie}-${comprobante.numero}`,
        venta_id: ventaParaAnular.id,
      });
      return Response.json(
        {
          error: `La baja se pidió a SUNAT (${resultado.estado}) y quedó guardada, pero la venta no se pudo anular: ${errVenta.message}. Anúlala desde Ventas ▸ Historial o avisa a quien administra el sistema; no vuelvas a pedir la baja.`,
          resultado,
        },
        { status: 500 }
      );
    }
    ventaAnulada = true;
  }

  return Response.json({ confirmada, estado: resultado.estado, entorno: resultado.entorno, ventaAnulada });
}
