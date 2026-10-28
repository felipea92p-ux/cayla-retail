import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { hoyLima } from "@/lib/fechas-lima";
import { filtrosDesdeParams, idsDeHistorial, listarVentasHistorial, type CursorVentas, type FilaHistorial, type ParamsHistorial } from "@/lib/ventas-historial";
import { csvDeHistorial, nombreArchivoHistorial } from "@/lib/historial-exportar-reglas";

// Exportar Ventas ▸ Historial (ADR-0230, solo el líder): las ventas con los MISMOS filtros de la pantalla, en un CSV que
// Excel abre directo (UTF-8 con BOM). Una ruta y no un botón que arma el archivo en el navegador: la lista de la pantalla
// es de a 20, y aquí hacen falta todas las del período.
//
// Un `route.ts` no pasa por el `layout.tsx` que exige el módulo: se pregunta aquí (módulo «historial» + líder).

/** Hasta cuántas ventas se exportan de una vez. Con ~47 ventas al día, un año de las tres tiendas son ~17.000: el tope de antes (5.000)
 *  cortaba el archivo en silencio a los ~3 meses, sin las ventas más viejas. Si el período aún pasa de este tope, se dice (abajo). */
const TOPE_EXPORTAR = 20_000;
const POR_PAGINA = 500;

export async function GET(req: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider" || !veModulo(persona, "historial")) return new Response("Solo el líder exporta el historial.", { status: 403 });

  const params = Object.fromEntries(new URL(req.url).searchParams.entries()) as ParamsHistorial;
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda");
  const hoy = hoyLima();
  const filtros = filtrosDesdeParams(params, {
    esLider: true,
    sedesIds: tiendas.map((t) => t.id),
    hoy,
    personaId: persona.personaId ?? undefined,
    sedePorDefecto: persona.ubicacionId,
  });
  const ids = await idsDeHistorial(filtros, { ubicacionId: persona.ubicacionId, esLider: true });

  const filas: FilaHistorial[] = [];
  let cursor: CursorVentas | null = null;
  do {
    const pagina = await listarVentasHistorial(filtros, { cursor, ids, limite: POR_PAGINA });
    filas.push(...pagina.filas);
    cursor = pagina.siguiente;
  } while (cursor && filas.length < TOPE_EXPORTAR);
  // Un archivo cortado que parece completo es peor que ninguno: si quedaron ventas fuera, se dice y no se entrega.
  if (cursor) return new Response(`El período tiene más de ${TOPE_EXPORTAR.toLocaleString("es-PE")} ventas: acórtalo (por mes) y vuelve a exportar.`, { status: 413 });

  const alcance = tiendas.find((t) => t.id === filtros.sedeId)?.nombre ?? "todas";
  return new Response(csvDeHistorial(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoHistorial(alcance, filtros.desde, filtros.hasta ?? hoy)}"`,
      "Cache-Control": "no-store",
    },
  });
}
