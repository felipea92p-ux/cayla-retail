import { listarAvisos, sincronizarAvisos, type EntradaAviso } from "@/lib/avisos-tienda-servidor";
import type { LlegadaViva } from "@/lib/campanita";
import { leerAvisosDelClub, leerRespuestasDelClub } from "@/lib/inicio-aviso-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// GET /api/avisos-club — lo que la campanita avisa sin recargar la página: las notificaciones de la cuenta más recientes (tallas que
// llegaron y respuestas de CAYLA), con las claves de todas las no borradas. Anota antes lo que hoy está a favor en el historial, igual que
// la campanita de la página. Solo lee lo de quien tiene la sesión. Sin caché: un aviso viejo sería justo lo que esta ruta existe para evitar.
export async function GET() {
  const sesion = await leerSesion();
  const sinCache = { "cache-control": "no-store" };
  if (sesion.estado !== "con_sesion") return Response.json({ llegadas: [], claves: [] }, { headers: sinCache });

  const [avisos, respuestas] = await Promise.all([leerAvisosDelClub(sesion.usuarioId), leerRespuestasDelClub(sesion.usuarioId)]);
  if (avisos !== null) {
    const entradas: EntradaAviso[] = [
      ...avisos.filter((a) => a.tipo === "llego").map((a) => ({ clave: a.clave, tipo: "llego" as const, titulo: a.titulo, texto: a.texto, href: a.href ?? "/cuenta" })),
      ...respuestas.map((a) => ({ clave: a.clave, tipo: "respuesta" as const, titulo: a.titulo, texto: a.texto, href: a.href ?? "/recomendaciones", cuando: a.cuando })),
    ];
    await sincronizarAvisos(sesion.usuarioId, entradas, true);
  }

  const lista = await listarAvisos(sesion.usuarioId, { pagina: 1, tamano: 50, soloBandeja: true });
  const llegadas: LlegadaViva[] = (lista?.items ?? []).map((a) => ({ clave: a.clave, titulo: a.titulo, href: a.href, tipo: a.tipo }));
  return Response.json({ llegadas, claves: lista?.claves ?? [] }, { headers: sinCache });
}
