import type { createClient } from "@/lib/supabase/server";
import { emitirDocumentoLucode, entornoLucode, type DatosComprobante, type TipoDocumentoLucode } from "@/lib/lucode";
import { itemsParaLucode, motivoParaNoTransmitir, vaALaColaDeReintento, variantesPorNombrar } from "@/lib/transmision-reglas";

// Transmitir UN comprobante a SUNAT por Lucode: la pieza que comparten `/api/lucode/emitir` (el envío
// al cobrar y «Reintentar ahora») y `/api/lucode/reintentar` (el barrido de la cola, D-60). Solo
// servidor: llama a Lucode con el token. Devuelve el status HTTP y el cuerpo que responde la ruta.
//
// CONTRATO
//   PROMETE: transmite un comprobante que `emitir_comprobante`/`emitir_nota` ya reservó, y deja su
//            `estado` real en la base (enviado/aceptado/rechazado) — nunca inventa un resultado.
//   ASUME:   el cliente de Supabase trae la sesión de quien pide (RLS decide si puede verlo).
//   NO HACE: no reserva número ni serie (eso ya pasó). Si Lucode no responde, el comprobante pasa a
//            "pendiente_reintento" (la cola visible) con su intento anotado — nunca se pierde ni
//            cambia de número (principio 9).
//
// Vive separado de la RPC a propósito: `emitir_comprobante` es Postgres puro (ADR-0007/ADR-0005). Esta
// es la única pieza que depende de que Lucode responda — si cambia el proveedor, se reemplaza esto.

type Cliente = Awaited<ReturnType<typeof createClient>>;
export type Destino = { comprobanteId: string } | { ventaId: string };
export type Respuesta = { status: number; body: Record<string, unknown> };

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
  /** Separaciones (ADR-0166): se leen aparte, ver abajo. */
  es_anticipo?: boolean;
  anticipo_deducido?: number | string | null;
};

export async function transmitirComprobante(supabase: Cliente, destino: Destino): Promise<Respuesta> {
  const comprobanteId = "comprobanteId" in destino ? destino.comprobanteId : null;
  const ventaId = "ventaId" in destino ? destino.ventaId : null;

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
    return { status: 404, body: { error: "Comprobante no encontrado o sin permiso para verlo" } };
  }
  const fila = comprobante as FilaComprobante;

  // Separaciones (ADR-0166): un anticipo, o el comprobante que lo deduce, no se transmite todavía. Consulta
  // aparte y TOLERANTE: si la web sale antes que la migración, la columna no existe (42703) y se lee como
  // «no es anticipo» — las boletas de siempre se siguen transmitiendo. Cualquier otro fallo, falla cerrada.
  const { data: anticipo, error: errAnticipo } = await supabase
    .from("comprobantes")
    .select("es_anticipo, anticipo_deducido")
    .eq("id", fila.id)
    .maybeSingle();
  if (errAnticipo && errAnticipo.code !== "42703") {
    return { status: 503, body: { error: "No se pudo comprobar si el comprobante es de una separación. Reintenta." } };
  }
  if (anticipo) Object.assign(fila, anticipo);

  // Lo que llega a SUNAT no se deshace: todo lo que puede frenarlo se decide antes de llamar a Lucode
  // (estado del comprobante y estado de su venta, ver `lib/transmision-reglas.ts`).
  const noSePuede = motivoParaNoTransmitir(fila);
  if (noSePuede) return { status: noSePuede.status, body: { error: noSePuede.error } };

  // Las líneas de una venta no traen descripción (solo `variante_id`): se nombra cada prenda con su
  // referencia y su SKU (color y talla), que es lo que la clienta reconoce en la boleta.
  const porNombrar = variantesPorNombrar(fila.items);
  const nombres = new Map<string, string>();
  if (porNombrar.length > 0) {
    const { data: variantes, error: errVariantes } = await supabase.from("variantes").select("id, sku, producto:productos(referencia)").in("id", porNombrar);
    if (errVariantes) {
      return { status: 503, body: { error: "No se pudieron leer las prendas del comprobante. Reintenta." } };
    }
    for (const v of variantes ?? []) {
      const referencia = (v.producto as { referencia?: string } | null)?.referencia;
      if (referencia) nombres.set(v.id, v.sku ? `${referencia} · ${v.sku}` : referencia);
    }
  }
  const items = itemsParaLucode(fila.items, nombres);
  if (!items) {
    return { status: 500, body: { error: "El comprobante tiene líneas que no se pueden declarar (sin prenda reconocible o datos incompletos)." } };
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
      return { status: 500, body: { error: "La nota no tiene comprobante original o motivo — no debería poder existir así (ADR-0007)." } };
    }
    const { data: original, error: errOriginal } = await supabase
      .from("comprobantes")
      .select("tipo, serie, numero, entorno_transmision")
      .eq("id", fila.comprobante_original_id)
      .maybeSingle();
    // Distinguir el fallo de lectura del "no es boleta ni factura": lo primero se reintenta,
    // lo segundo es un dato mal formado que nunca se va a arreglar solo.
    if (errOriginal) {
      return { status: 503, body: { error: "No se pudo leer el comprobante original de la nota. Reintenta." } };
    }
    if (!original || (original.tipo !== "boleta" && original.tipo !== "factura")) {
      return { status: 500, body: { error: "El comprobante original de esta nota no es una boleta ni una factura." } };
    }
    // Una nota vive en el mismo ambiente que el documento que corrige. Sin
    // esto se puede emitir una nota de crédito REAL contra una boleta que solo
    // existe en el sandbox: `emitir_nota` solo exige que el original esté
    // "aceptado" (0034), y una boleta de prueba también lo está.
    if (original.entorno_transmision && original.entorno_transmision !== entornoLucode()) {
      return { status: 409, body: {
          error: `El comprobante original se transmitió en "${original.entorno_transmision}" y ahora estás en "${entornoLucode()}". Una nota no puede cruzar de ambiente.`,
        } };
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
    return { status: 502, body: { error: resultado.detalle, motivo: resultado.motivo, encolado } };
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
    return { status: 500, body: { error: `Lucode transmitió (${resultado.estado}) pero no se pudo guardar el resultado: ${errActualizar.message}`, resultado } };
  }

  return { status: 200, body: {
    estado: nuevoEstado,
    entorno: resultado.entorno,
    xmlUrl: resultado.xmlUrl,
    cdrUrl: resultado.cdrUrl,
    pdfUrl: resultado.pdfUrl,
  } };
}
