import { createClient } from "@/lib/supabase/server";
import { emitirDocumentoLucode, type DatosComprobante, type ItemComprobante, type TipoDocumentoLucode } from "@/lib/lucode";

// POST /api/lucode/emitir  { comprobante_id: string }
//
// CONTRATO
//   PROMETE: transmite a Lucode un comprobante que `emitir_comprobante`/
//            `emitir_nota` ya reservó, y deja su `estado` real en la base
//            (enviado/aceptado/rechazado) — nunca inventa un resultado.
//   ASUME:   sesión válida (RLS decide si esta persona puede ver/tocar ese
//            comprobante, igual que el resto del sistema).
//   NO HACE: no reserva número ni serie (eso ya pasó), no reintenta solo si
//            Lucode no responde — el comprobante se queda "pendiente" y
//            queda a la vista para volver a intentar (principio 9).
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
};

function itemsValidos(raw: unknown): ItemComprobante[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: ItemComprobante[] = [];
  for (const it of raw) {
    if (
      typeof it !== "object" ||
      it === null ||
      typeof (it as Record<string, unknown>).descripcion !== "string" ||
      typeof (it as Record<string, unknown>).cantidad !== "number" ||
      typeof (it as Record<string, unknown>).precio_unitario !== "number"
    ) {
      return null;
    }
    const o = it as Record<string, unknown>;
    items.push({ descripcion: o.descripcion as string, cantidad: o.cantidad as number, precio_unitario: o.precio_unitario as number });
  }
  return items;
}

export async function POST(request: Request) {
  let body: { comprobante_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const comprobanteId = body.comprobante_id;
  if (!comprobanteId) {
    return Response.json({ error: "Falta comprobante_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: comprobante, error: errLectura } = await supabase
    .from("comprobantes")
    .select(
      "id, tipo, serie, numero, moneda, cliente_tipo_doc, cliente_num_doc, cliente_nombre, total, estado, items, comprobante_original_id, motivo"
    )
    .eq("id", comprobanteId)
    .maybeSingle();

  if (errLectura || !comprobante) {
    return Response.json({ error: "Comprobante no encontrado o sin permiso para verlo" }, { status: 404 });
  }
  const fila = comprobante as FilaComprobante;

  if (fila.estado !== "pendiente" && fila.estado !== "rechazado") {
    return Response.json(
      { error: `Este comprobante ya está en estado "${fila.estado}" — no se vuelve a transmitir.` },
      { status: 409 }
    );
  }

  const items = itemsValidos(fila.items);
  if (!items) {
    return Response.json(
      { error: "El comprobante no tiene ítems válidos. Esto no debería pasar — emitir_comprobante siempre asigna al menos uno (ADR-0009)." },
      { status: 500 }
    );
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
    const { data: original } = await supabase
      .from("comprobantes")
      .select("tipo, serie, numero")
      .eq("id", fila.comprobante_original_id)
      .maybeSingle();
    if (!original || (original.tipo !== "boleta" && original.tipo !== "factura")) {
      return Response.json({ error: "El comprobante original de esta nota no es una boleta ni una factura." }, { status: 500 });
    }
    datos.original = { tipo: original.tipo, serie: original.serie, numero: original.numero };
    datos.motivoCodigo = fila.motivo;
  }

  const resultado = await emitirDocumentoLucode(datos);

  if (!resultado.ok) {
    // No se toca `estado`: sigue "pendiente"/"rechazado", visible para
    // reintentar. Un problema de red o de credenciales no es un rechazo de
    // SUNAT — no se debe confundir el uno con el otro en la base.
    return Response.json({ error: resultado.detalle, motivo: resultado.motivo }, { status: 502 });
  }

  const nuevoEstado = resultado.estado === "ACEPTADO" ? "aceptado" : resultado.estado === "RECHAZADO" ? "rechazado" : "enviado";
  const { error: errActualizar } = await supabase.rpc("actualizar_transmision_comprobante", {
    p_comprobante_id: fila.id,
    p_estado: nuevoEstado,
    p_respuesta_sunat: resultado,
    p_motivo_rechazo: resultado.estado === "RECHAZADO" ? resultado.mensaje : null,
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

  return Response.json({ estado: nuevoEstado, xmlUrl: resultado.xmlUrl, cdrUrl: resultado.cdrUrl, pdfUrl: resultado.pdfUrl });
}
