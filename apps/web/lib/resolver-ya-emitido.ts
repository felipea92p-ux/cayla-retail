// Rutas relativas (sin `@/`): lo prueba `resolver-ya-emitido.test.ts` en vitest, que no tiene el alias.
import type { Json } from "@cayla-retail/database";
import { consultarEstadoLucode, descargarXmlLucode, type DatosComprobante } from "./lucode";
import { decidirYaEmitido, diferenciasConLucode, leerXmlComprobante, NUMERO_OCUPADO, YA_EMITIDO } from "./ya-emitido-reglas";
import { vaALaColaDeReintento } from "./transmision-reglas";
import { capturarError } from "./errores";
import type { Cliente, Respuesta } from "./transmitir-comprobante";

// Cuando Lucode contesta «ese número ya fue emitido» (ADR-0378): preguntarle qué tiene, confirmar con su XML firmado que es
// NUESTRA boleta y guardar lo que dice SUNAT. Lo llama `transmitirComprobante` justo después del rechazo. Solo servidor.
//
// CONTRATO
//   PROMETE: nunca reenvía nada (solo lee de Lucode: `/api/v3/status` y el XML). Escribe un estado de SUNAT SOLO si el XML
//            que Lucode firmó coincide con el comprobante (`diferenciasConLucode` vacío). Si no se puede confirmar, o es
//            otro documento, el comprobante sigue en la cola con el motivo a la vista: nunca se pierde ni se da por declarado.
//   ASUME:   `datos` es exactamente lo que se acaba de mandar a Lucode (el mismo objeto de `transmitirComprobante`).
//   NO HACE: no decide qué significa cada respuesta: eso es `lib/ya-emitido-reglas.ts`.

type Fila = { id: string; estado: string; serie: string; numero: number };

async function alaCola(supabase: Cliente, fila: Fila, error: string): Promise<boolean> {
  if (!vaALaColaDeReintento(fila.estado)) return false;
  const { error: errCola } = await supabase.rpc("fn_marcar_reintento_transmision", { p_comprobante_id: fila.id, p_error: error });
  if (errCola) console.error("No se pudo encolar el comprobante para reintento", fila.id, errCola.message);
  return !errCola;
}

export async function resolverYaEmitido(supabase: Cliente, fila: Fila, datos: DatosComprobante, detalleLucode: string): Promise<Respuesta> {
  const numero = `${fila.serie}-${fila.numero}`;

  const consulta = await consultarEstadoLucode(datos.tipo, datos.serie, datos.numero);
  if (!consulta.ok) {
    const detalle = `Lucode ya tiene ${numero}, pero no se pudo consultar su estado (${consulta.detalle}).`;
    const encolado = await alaCola(supabase, fila, `${YA_EMITIDO}: ${detalle}`);
    return { status: 502, body: { error: detalle, motivo: YA_EMITIDO, encolado } };
  }

  let diferencias: string[] | null = null;
  let motivoSinXml = "Lucode no devolvió el XML del documento";
  if (consulta.xmlUrl) {
    const xml = await descargarXmlLucode(consulta.xmlUrl);
    const leido = xml.ok ? leerXmlComprobante(xml.xml) : null;
    if (leido) {
      diferencias = diferenciasConLucode(
        {
          tipo: datos.tipo,
          serie: datos.serie,
          numero: datos.numero,
          fecha: datos.fechaEmision!,
          moneda: datos.moneda,
          total: datos.total,
          clienteTipoDoc: datos.clienteTipoDoc,
          clienteNumDoc: datos.clienteNumDoc,
          lineas: datos.items.length,
        },
        leido,
      );
    } else {
      motivoSinXml = xml.ok ? "el XML de Lucode no se pudo leer" : xml.detalle;
    }
  }

  const decision = decidirYaEmitido(numero, consulta.estado, consulta.mensaje, diferencias);

  if (decision.tipo === "sin_confirmar") {
    const detalle = `${decision.detalle.replace(/\.$/, "")} (${motivoSinXml}).`;
    const encolado = await alaCola(supabase, fila, `${YA_EMITIDO}: ${detalle}`);
    return { status: 502, body: { error: detalle, motivo: YA_EMITIDO, encolado } };
  }

  if (decision.tipo === "numero_ocupado") {
    // Grave y raro: el número de esta venta lo tiene otro documento ante SUNAT. Al log, para que no dependa de que alguien
    // mire la pantalla; sin datos del cliente (`lib/errores.ts`).
    capturarError("lucode/emitir: el número lo tiene otro documento", new Error(decision.detalle), { comprobante_id: fila.id, comprobante: numero });
    const encolado = await alaCola(supabase, fila, `${NUMERO_OCUPADO}: ${decision.enCola}`);
    return { status: 409, body: { error: decision.detalle, motivo: NUMERO_OCUPADO, encolado } };
  }

  const respuesta = {
    ...consulta,
    // De dónde salió este estado: no del envío (que Lucode rechazó por repetido) sino de la consulta, confirmada con el XML.
    ya_emitido: { aviso_lucode: detalleLucode, verificado_con_xml: true, consultado_at: new Date().toISOString() },
  } satisfies Json;
  const { error: errGuardar } = await supabase.rpc("actualizar_transmision_comprobante", {
    p_comprobante_id: fila.id,
    p_estado: decision.estado,
    p_entorno: consulta.entorno,
    p_respuesta_sunat: respuesta,
    p_motivo_rechazo: decision.motivoRechazo ?? undefined,
  });
  if (errGuardar) {
    // Igual que en el envío: SUNAT ya lo tiene y la base no se enteró. Sigue en la cola (no se tocó), y la próxima pasada lo
    // confirma de nuevo sin reenviar nada.
    capturarError("lucode/emitir: ya emitido, confirmado pero sin guardar", errGuardar, { comprobante_id: fila.id, comprobante: numero, estado_sunat: consulta.estado });
    return { status: 500, body: { error: `Lucode ya tenía ${numero} (${consulta.estado}) pero no se pudo guardar: ${errGuardar.message}` } };
  }

  return {
    status: 200,
    body: {
      estado: decision.estado,
      entorno: consulta.entorno,
      xmlUrl: consulta.xmlUrl,
      cdrUrl: consulta.cdrUrl,
      pdfUrl: consulta.pdfUrl,
      ya_emitido: true,
    },
  };
}
