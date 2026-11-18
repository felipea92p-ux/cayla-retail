import "server-only";

// Los correos que manda el servidor de la tienda (ADR-0679: la copia de una hoja del Libro de Reclamaciones). Por Resend, con la llave
// propia de la tienda (`TIENDA_RESEND_KEY`) y desde `tienda@cayla.pe` (el dominio ya verificado en Resend, ADR-0408). Si Resend no
// responde en 8 s, o responde con un error, el correo NO se da por enviado: quien llama lo deja para el siguiente intento (principio 9).
//
// Sin llave: en local (no producción) el correo se escribe en el registro del servidor, para verlo sin mandarlo; en producción, no se
// manda y se anota que falta la llave. En los registros de producción nunca va el destinatario ni el contenido.

const REMITENTE_DE_FABRICA = "CAYLA <tienda@cayla.pe>";
const ESPERA_MS = 8000;

export type Correo = { para: string; asunto: string; texto: string; html: string };
export type ResultadoCorreo = "enviado" | "sin_configurar" | "fallo";

export async function enviarCorreo(c: Correo): Promise<ResultadoCorreo> {
  const llave = process.env.TIENDA_RESEND_KEY?.trim();
  if (!llave) {
    if (process.env.NODE_ENV !== "production") {
      // Solo en local: se ve el correo en el registro en vez de mandarlo.
      console.info(`\n----- correo (local, sin TIENDA_RESEND_KEY: no se manda) -----\nPara: ${c.para}\nAsunto: ${c.asunto}\n\n${c.texto}\n-----\n`);
      return "enviado";
    }
    console.error(JSON.stringify({ evento: "tienda_correo_sin_llave" }));
    return "sin_configurar";
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${llave}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.TIENDA_CORREO_REMITENTE?.trim() || REMITENTE_DE_FABRICA,
        to: [c.para],
        subject: c.asunto,
        text: c.texto,
        html: c.html,
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (r.ok) return "enviado";
    console.error(JSON.stringify({ evento: "tienda_correo_rechazado", estado: r.status }));
    return "fallo";
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_correo_fallo", mensaje: error instanceof Error ? error.name : "desconocido" }));
    return "fallo";
  }
}
