import { ImageResponse } from "next/og";
import { esId } from "@/lib/bolsa";
import { piezasDeLaImagen, tituloDeLaHistoria } from "@/lib/compartir-look";
import { prendasParaCompartir } from "@/lib/compartir-servidor";
import { fuentesDeLaMarca } from "@/lib/fuentes-og";
import { cargarFotos, cargarIsotipo, HistoriaDelLook, TAMANO_HISTORIA } from "@/lib/imagenes-del-look";
import { lookDelGuardado } from "@/lib/looks-guardados";
import { leerMisLooksEnBase } from "@/lib/looks-guardados-servidor";
import { indizar } from "@/lib/probador";
import { leerSesion } from "@/lib/sesion-servidor";

// GET /looks/guardado/<id>/historia — la imagen para estados de un look guardado (ADR-0434, actividad 9; lienzo v3, pantalla 9):
// 1080×1920, con el nombre del look, sus prendas como polaroids y «Arma el tuyo en tienda.cayla.pe». Lleva el nombre que la persona le
// puso, así que solo la arma para la cuenta dueña del look (la base solo le devuelve los suyos); nunca es pública ni se guarda en la red.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esId(id)) return new Response(null, { status: 404 });
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return new Response(null, { status: sesion.estado === "sin_respuesta" ? 503 : 401 });
  const [looks, prendas] = await Promise.all([leerMisLooksEnBase(sesion.usuarioId), prendasParaCompartir()]);
  if (looks === null || prendas === null) return new Response(null, { status: 503 });
  const guardado = looks.find((l) => l.id === id);
  if (!guardado) return new Response(null, { status: 404 });
  const piezas = piezasDeLaImagen(lookDelGuardado(guardado, prendas).look, indizar(prendas));
  if (piezas.length === 0) return new Response(null, { status: 404 });
  const origen = new URL(request.url).origin;
  const [fuentes, conFotos, isotipo] = await Promise.all([fuentesDeLaMarca(), cargarFotos(piezas), cargarIsotipo(origen)]);
  return new ImageResponse(<HistoriaDelLook titulo={tituloDeLaHistoria(guardado.nombre)} piezas={conFotos} isotipo={isotipo} />, {
    ...TAMANO_HISTORIA,
    fonts: fuentes,
    headers: { "Cache-Control": "private, no-store" },
  });
}
