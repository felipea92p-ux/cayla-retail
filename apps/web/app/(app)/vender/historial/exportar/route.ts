import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { hoyEnLima } from "@/lib/movimientos-reglas";
import { filtrosDesdeParams, idsDeHistorial, listarVentasHistorial, type CursorVentas, type FilaHistorial, type ParamsHistorial } from "@/lib/ventas-historial";
import { csvDeHistorial, nombreArchivoHistorial } from "@/lib/historial-exportar-reglas";

// Exportar Ventas ▸ Historial (ADR-0230, solo el líder): las ventas con los MISMOS filtros de la pantalla, en un CSV que
// Excel abre directo (UTF-8 con BOM). Una ruta y no un botón que arma el archivo en el navegador: la lista de la pantalla
// es de a 20, y aquí hacen falta todas las del período.
//
// Un `route.ts` no pasa por el `layout.tsx` que exige el módulo: se pregunta aquí (módulo «historial» + líder).

/** Hasta cuántas ventas se exportan de una vez (un año de las tres tiendas cabe de sobra). */
const TOPE_EXPORTAR = 5000;
const POR_PAGINA = 500;

export async function GET(req: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider" || !veModulo(persona, "historial")) return new Response("Solo el líder exporta el historial.", { status: 403 });

  const params = Object.fromEntries(new URL(req.url).searchParams.entries()) as ParamsHistorial;
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda");
  const hoy = hoyEnLima();
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

  const alcance = tiendas.find((t) => t.id === filtros.sedeId)?.nombre ?? "todas";
  return new Response(csvDeHistorial(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoHistorial(alcance, filtros.desde, filtros.hasta ?? hoy)}"`,
      "Cache-Control": "no-store",
    },
  });
}
