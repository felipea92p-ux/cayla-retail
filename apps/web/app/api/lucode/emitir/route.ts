import { createClient } from "@/lib/supabase/server";
import { emitirDocumentoLucode, entornoLucode, type DatosComprobante, type TipoDocumentoLucode } from "@/lib/lucode";
import { itemsParaLucode, motivoParaNoTransmitir, vaALaColaDeReintento, variantesPorNombrar } from "@/lib/transmision-reglas";

// POST /api/lucode/emitir  { comprobante_id: string } | { venta_id: string }
//
// Con `venta_id` la dispara Vender sola al cobrar (D-60, envío automático): busca la boleta o
// factura de esa venta. Una venta sin comprobante responde 404 y no pasa nada.
//
// CONTRATO
//   PROMETE: transmite a Lucode un comprobante que `emitir_comprobante`/
//            `emitir_nota` ya reservó, y deja su `estado` real en la base
//            (enviado/aceptado/rechazado) — nunca inventa un resultado.
//   ASUME:   sesión válida (RLS decide si esta persona puede ver/tocar ese
//            comprobante, igual que el resto del sistema).
//   NO HACE: no reserva número ni serie (eso ya pasó), no reintenta solo si
//            Lucode no responde — el comprobante pasa a "pendiente_reintento"
//            (la cola visible de D-60) con su intento anotado, nunca se pierde
//            ni cambia de número (principio 9).
//
// Vive separado de la RPC a propósito: `emitir_comprobante` es Postgres puro
// (puede correr sin depender de que un proveedor externo esté arriba, tal
// como manda ADR-0007/ADR-0005). Esta ruta es la única pieza que sí depende
// de que Lucode responda — si algún día cambia de proveedor otra vez, es este
// archivo el que se reemplaza, no la RPC ni el esquema.

type FilaComprobante = {
  id: string;
  tipo: TipoDocumentoLucode;
  serie: string;
  numero: number;
  moneda: string;
  cliente_tipo_doc: "dni" | "ruc" | "sin_documento";
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
  total: number;
  estado: string;
  items: unknown;
  comprobante_original_id: string | null;
  motivo: string | null;
  entorno_transmision: "sandbox" | "produccion" | null;
  /** La venta de la que salió el comprobante y su estado: una venta anulada no se transmite (ver `motivoParaNoTransmitir`). */
  venta_id: string | null;
  venta: { estado: string } | null;
};

export async function POST(request: Request) {
  let body: { comprobante_id?: string; venta_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const comprobanteId = body.comprobante_id;
  const ventaId = body.venta_id;
  if (!comprobanteId && !ventaId) {
    return Response.json({ error: "Falta comprobante_id o venta_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: comprobante, error: errLectura } = await supabase
    .from("comprobantes")
    .select(
      "id, tipo, serie, numero, moneda, cliente_tipo_doc, cliente_num_doc, cliente_nombre, total, estado, items, comprobante_original_id, motivo, entorno_transmision, venta_id, venta:ventas(estado)"
    )
    .match(comprobanteId ? { id: comprobanteId } : { venta_id: ventaId! })
    // Por venta solo cuenta su boleta o factura: una nota de crédito posterior también lleva `venta_id`.
    .in("tipo", comprobanteId ? ["boleta", "factura", "nota_credito", "nota_debito"] : ["boleta", "factura"])
    .maybeSingle();

  if (errLectura || !comprobante) {
    return Response.json({ error: "Comprobante no encontrado o sin permiso para verlo" }, { status: 404 });
  }
  const fila = comprobante as FilaComprobante;

  // Lo que llega a SUNAT no se deshace: todo lo que puede frenarlo se decide antes de llamar a Lucode
  // (estado del comprobante y estado de su venta, ver `lib/transmision-reglas.ts`).
  const noSePuede = motivoParaNoTransmitir(fila);
  if (noSePuede) return Response.json({ error: noSePuede.error }, { status: noSePuede.status });

  // Las líneas de una venta no traen descripción (solo `variante_id`): se nombra cada prenda con su
  // referencia y su SKU (color y talla), que es lo que la clienta reconoce en la boleta.
  const porNombrar = variantesPorNombrar(fila.items);
  const nombres = new Map<string, string>();
  if (porNombrar.length > 0) {
    const { data: variantes, error: errVariantes } = await supabase.from("variantes").select("id, sku, producto:productos(referencia)").in("id", porNombrar);
    if (errVariantes) {
      return Response.json({ error: "No se pudieron leer las prendas del comprobante. Reintenta." }, { status: 503 });
    }
    for (const v of variantes ?? []) {
      const referencia = (v.producto as { referencia?: string } | null)?.referencia;
      if (referencia) nombres.set(v.id, v.sku ? `${referencia} · ${v.sku}` : referencia);
    }
  }
  const items = itemsParaLucode(fila.items, nombres);
  if (!items) {
    return Response.json({ error: "El comprobante tiene líneas que no se pueden declarar (sin prenda reconocible o datos incompletos)." }, { status: 500 });
  }

  const datos: DatosComprobante = {
    tipo: fila.tipo,
    serie: fila.serie,
    numero: fila.numero,
    moneda: fila.moneda === "USD" ? "USD" : "PEN",
    clienteTipoDoc: fila.cliente_tipo_doc,
    clienteNumDoc: fila.cliente_num_doc,
    clienteNombre: fila.cliente_nombre,
    total: fila.total,
    items,
  };

  if (fila.tipo === "nota_credito" || fila.tipo === "nota_debito") {
    if (!fila.comprobante_original_id || !fila.motivo) {
      return Response.json({ error: "La nota no tiene comprobante original o motivo — no debería poder existir así (ADR-0007)." }, { status: 500 });
    }
    const { data: original, error: errOriginal } = await supabase
      .from("comprobantes")
      .select("tipo, serie, numero, entorno_transmision")
      .eq("id", fila.comprobante_original_id)
      .maybeSingle();
    // Distinguir el fallo de lectura del "no es boleta ni factura": lo primero se reintenta,
    // lo segundo es un dato mal formado que nunca se va a arreglar solo.
    if (errOriginal) {
      return Response.json({ error: "No se pudo leer el comprobante original de la nota. Reintenta." }, { status: 503 });
    }
    if (!original || (original.tipo !== "boleta" && original.tipo !== "factura")) {
      return Response.json({ error: "El comprobante original de esta nota no es una boleta ni una factura." }, { status: 500 });
    }
    // Una nota vive en el mismo ambiente que el documento que corrige. Sin
    // esto se puede emitir una nota de crédito REAL contra una boleta que solo
    // existe en el sandbox: `emitir_nota` solo exige que el original esté
    // "aceptado" (0034), y una boleta de prueba también lo está.
    if (original.entorno_transmision && original.entorno_transmision !== entornoLucode()) {
      return Response.json(
        {
          error: `El comprobante original se transmitió en "${original.entorno_transmision}" y ahora estás en "${entornoLucode()}". Una nota no puede cruzar de ambiente.`,
        },
        { status: 409 }
      );
    }
    datos.original = { tipo: original.tipo, serie: original.serie, numero: original.numero };
    datos.motivoCodigo = fila.motivo;
  }

  const resultado = await emitirDocumentoLucode(datos);

  if (!resultado.ok) {
    // Un problema de red o de credenciales no es un rechazo de SUNAT — no se
    // confunde el uno con el otro en la base. Lo que aún no salió entra a la
    // cola de reintento (D-60) con el error anotado; un "rechazado" se queda
    // como estaba, visible para reintentar a mano.
    let encolado = false;
    if (vaALaColaDeReintento(fila.estado)) {
      const { error: errCola } = await supabase.rpc("fn_marcar_reintento_transmision", {
        p_comprobante_id: fila.id,
        p_error: `${resultado.motivo}: ${resultado.detalle}`,
      });
      encolado = !errCola;
      if (errCola) console.error("No se pudo encolar el comprobante para reintento", fila.id, errCola.message);
    }
    return Response.json({ error: resultado.detalle, motivo: resultado.motivo, encolado }, { status: 502 });
  }

  const nuevoEstado = resultado.estado === "ACEPTADO" ? "aceptado" : resultado.estado === "RECHAZADO" ? "rechazado" : "enviado";
  const { error: errActualizar } = await supabase.rpc("actualizar_transmision_comprobante", {
    p_comprobante_id: fila.id,
    p_estado: nuevoEstado,
    // El ambiente que devolvió la llamada, no el que hay ahora: son el mismo
    // valor hoy, pero atarlo al resultado hace imposible guardar "aceptado en
    // producción" para algo que se transmitió al sandbox.
    p_entorno: resultado.entorno,
    p_respuesta_sunat: resultado,
    // `undefined` y no `null`: el parámetro de la RPC tiene default, así que
    // supabase-js lo tipa opcional (`string | undefined`) y omitir la clave deja
    // que Postgres aplique ese default —que es `null`—. Mandar `null` explícito
    // no compila, y era el único error que quedaba escondido detrás de los tipos
    // generados contra el proyecto viejo. Lucode además puede devolver un
    // rechazo sin mensaje, así que el `?? undefined` cubre ese caso.
    p_motivo_rechazo: resultado.estado === "RECHAZADO" ? (resultado.mensaje ?? undefined) : undefined,
  });
  if (errActualizar) {
    // Lucode SÍ transmitió — perder este registro sería peor que un error de
    // pantalla: el correlativo ya se usó ante SUNAT aunque la base no se
    // haya enterado todavía. Se avisa con el detalle exacto para reintentar
    // solo el guardado, no la transmisión (que reenviaría el mismo documento).
    return Response.json(
      { error: `Lucode transmitió (${resultado.estado}) pero no se pudo guardar el resultado: ${errActualizar.message}`, resultado },
      { status: 500 }
    );
  }

  return Response.json({
    estado: nuevoEstado,
    entorno: resultado.entorno,
    xmlUrl: resultado.xmlUrl,
    cdrUrl: resultado.cdrUrl,
    pdfUrl: resultado.pdfUrl,
  });
}
