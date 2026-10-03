"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { EntornoTransmision, EstadoComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import {
  CONSULTA_PDF_CADA_MS,
  ESPERA_PDF_MS,
  envioDeLaBoleta,
  pdfUrlDeRespuesta,
} from "@/lib/comprobante-whatsapp-reglas";

type Lectura = { estado: EstadoComprobante; entorno: EntornoTransmision; pdfUrl: string | null };

/** Los estados que ya no cambian el resultado: dejar de preguntar. */
const TERMINALES: readonly EstadoComprobante[] = ["rechazado", "anulado", "no_emitido", "interna"];

/**
 * Pregunta cada 2 s si Lucode ya entregó el PDF de esta venta, hasta que llegue, el comprobante quede sin PDF para siempre, o pasen
 * 20 s. Es una lectura (GET a Supabase): el loader global no se abre. Solo trae el enlace —`respuesta_sunat->>pdfUrl`—, no todo el
 * JSON de SUNAT. Si la base no responde, sigue como «esperando» y, a los 20 s, la tarjeta manda a Comprobantes (principio 9).
 */
function useLecturaDelPdf(ventaId: string | null, activo: boolean): { lectura: Lectura | null; esperadoMs: number } {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [esperadoMs, setEsperadoMs] = useState(0);

  useEffect(() => {
    if (!ventaId || !activo) return;
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const inicio = Date.now();

    async function preguntar() {
      const { data } = await createClient()
        .from("comprobantes")
        .select("estado, entorno_transmision, pdf:respuesta_sunat->>pdfUrl")
        .eq("venta_id", ventaId as string)
        .maybeSingle();
      if (!vigente) return;
      const fila = data as { estado: EstadoComprobante; entorno_transmision: EntornoTransmision; pdf: unknown } | null;
      const nueva: Lectura | null = fila ? { estado: fila.estado, entorno: fila.entorno_transmision, pdfUrl: pdfUrlDeRespuesta(fila.pdf) } : null;
      const transcurrido = Date.now() - inicio;
      setLectura(nueva);
      setEsperadoMs(transcurrido);
      const termino = nueva !== null && (nueva.pdfUrl !== null || TERMINALES.includes(nueva.estado));
      if (!termino && transcurrido < ESPERA_PDF_MS) temporizador = setTimeout(preguntar, CONSULTA_PDF_CADA_MS);
    }

    void preguntar();
    return () => {
      vigente = false;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [ventaId, activo]);

  return { lectura, esperadoMs };
}

/**
 * «Enviar por WhatsApp» en «Venta registrada» (ADR-0288, «Actualización 2026-10-03»). Si el cliente dejó su celular, la cajera ve a
 * quién va y un botón que abre el chat de la TIENDA con el mensaje y el enlace al PDF ya escritos: solo falta tocar «Enviar» en
 * WhatsApp. No es un envío automático (decisión de Felipe, 2026-09-30: sin bot); tampoco guarda que se mandó. Mientras Lucode no
 * entrega el PDF dice que lo prepara; si pasa de 20 s o SUNAT no la acepta, lo dice y deja el envío para Comprobantes: la venta
 * nunca espera por esto. Qué se ofrece lo decide `envioDeLaBoleta` (lib/comprobante-whatsapp-reglas.ts, con pruebas).
 */
export function EnviarBoleta({
  ventaId,
  celular,
  comprobante,
}: {
  ventaId: string | null;
  celular: string | null;
  comprobante: { tipo: TipoComprobante; serie: string; numero: number };
}) {
  const { lectura, esperadoMs } = useLecturaDelPdf(ventaId, Boolean(celular));
  const envio = envioDeLaBoleta({
    celular,
    comprobante,
    estado: lectura?.estado ?? null,
    entorno: lectura?.entorno ?? null,
    pdfUrl: lectura?.pdfUrl ?? null,
    esperadoMs,
  });
  if (envio.fase === "nada") return null;

  return (
    <div className="card-cayla space-y-2.5 p-4 text-sm" data-envio-boleta={envio.fase}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-tinta">Enviar por WhatsApp</span>
        <span className="font-mono text-[11.5px] text-tinta/65">{envio.celular}</span>
      </div>
      {envio.fase === "listo" && (
        <a href={envio.href} target="_blank" rel="noreferrer" className="btn-cayla btn-secundario flex w-full items-center justify-center gap-2">
          <MessageCircle aria-hidden className="h-4 w-4" />
          Abrir WhatsApp con la boleta
        </a>
      )}
      {envio.fase === "esperando" && (
        <p role="status" className="text-[12px] leading-snug text-tinta/65">
          Preparando el PDF de la {comprobante.tipo === "factura" ? "factura" : "boleta"}… En unos segundos aparece el botón.
        </p>
      )}
      {envio.fase === "sin_pdf" && <p className="text-[12px] leading-snug text-tinta/65">{envio.motivo}</p>}
    </div>
  );
}
