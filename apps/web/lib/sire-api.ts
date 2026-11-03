import "server-only";
import { leerZip, esZip } from "./zip-leer";
import { decodificarTexto, type RegistroSire } from "./sire-propuesta-reglas";
import {
  leerEstadoTicket,
  leerTicket,
  leerToken,
  motivoHttp,
  pedidoToken,
  urlDescargarArchivo,
  urlEstadoTicket,
  urlPedirPropuesta,
  type CredencialesSire,
} from "./sire-api-reglas";

// La API del SIRE, la parte que habla por red (ADR-0601, actividad 5). Solo LEE la propuesta del mes: token → pedirla (ticket) →
// preguntar por el ticket hasta «Terminado» → bajar el .zip → el .txt de adentro. La lectura del texto y el guardado los hace quien llama.
//
// SE DEGRADA ASÍ (principio 9): cada llamada tiene su tope de espera; si SUNAT no responde, tarda o contesta otra cosa, devuelve el motivo
// y NO guarda nada. La propuesta se puede subir a mano igual, y el proceso lo vuelve a intentar al día siguiente. Nunca se registran las
// credenciales ni el contenido de una respuesta: el motivo lleva el paso y el código HTTP, nada más.

export type TraidaSire = { ok: true; texto: string; ticket: string } | { ok: false; paso: string; motivo: string };

const ESPERA_MS = 15_000;
/** Cuántas veces se pregunta por el ticket y cada cuánto: ~36 s en total, dentro de lo que dura una función de Vercel. */
const PREGUNTAS = 12;
const ENTRE_PREGUNTAS_MS = 3_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json(url: string, init: RequestInit): Promise<{ ok: true; data: unknown } | { ok: false; motivo: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS), cache: "no-store" });
    if (!res.ok) return { ok: false, motivo: motivoHttp(res.status, await res.text().catch(() => "")) };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error && e.name === "TimeoutError" ? "SUNAT no respondió a tiempo" : "No se pudo llegar a SUNAT" };
  }
}

export async function traerPropuestaSire(registro: RegistroSire, mes: string, c: CredencialesSire): Promise<TraidaSire> {
  const pt = pedidoToken(c);
  const t = await json(pt.url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: pt.cuerpo });
  if (!t.ok) return { ok: false, paso: "token", motivo: t.motivo };
  const token = leerToken(t.data);
  if (!token) return { ok: false, paso: "token", motivo: "SUNAT no entregó el token (¿credenciales vencidas o cambió la Clave SOL?)" };
  const cabeceras = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };

  const p = await json(urlPedirPropuesta(registro, mes), { method: "GET", headers: cabeceras });
  if (!p.ok) return { ok: false, paso: "pedir", motivo: p.motivo };
  const ticket = leerTicket(p.data);
  if (!ticket) return { ok: false, paso: "pedir", motivo: "SUNAT no devolvió un ticket" };

  for (let i = 0; i < PREGUNTAS; i++) {
    await dormir(ENTRE_PREGUNTAS_MS);
    const e = await json(urlEstadoTicket(registro, mes, ticket), { method: "GET", headers: cabeceras });
    if (!e.ok) continue;
    const estado = leerEstadoTicket(e.data, ticket);
    if (!estado?.terminado) continue;
    const archivo = estado.archivos[0];
    if (!archivo) return { ok: false, paso: "ticket", motivo: "El ticket terminó sin archivo" };
    try {
      const res = await fetch(urlDescargarArchivo(registro, mes, ticket, archivo, estado.codProceso), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(ESPERA_MS),
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, paso: "descargar", motivo: motivoHttp(res.status, await res.text().catch(() => "")) };
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!esZip(bytes)) return { ok: true, texto: decodificarTexto(bytes), ticket };
      const txt = (await leerZip(bytes))?.find((a) => a.nombre.toLowerCase().endsWith(".txt"));
      if (!txt) return { ok: false, paso: "descargar", motivo: "El .zip no trae un .txt" };
      return { ok: true, texto: decodificarTexto(txt.contenido), ticket };
    } catch {
      return { ok: false, paso: "descargar", motivo: "No se pudo bajar el archivo" };
    }
  }
  return { ok: false, paso: "ticket", motivo: "SUNAT todavía está armando el archivo; se intenta otra vez mañana" };
}
