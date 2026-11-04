import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getRankingCompleto, TOPE_DE_DESCARGA } from "@/lib/reportes-ranking";
import { filtrosDeUrl, periodoDe } from "@/lib/reportes-ranking-reglas";
import { alcanceDeReportes } from "@/lib/reportes-ventas-alcance";
import { csvDeRanking, nombreArchivoRanking } from "@/lib/reportes-ventas-exportar-reglas";

// Descargar Ventas ▸ Reportes ▸ Ranking de prendas: TODAS las filas con los filtros puestos (no solo la página que se ve), en un CSV que Excel abre directo
// (mismo formato que el Historial, ADR-0230). Lee con la misma función de la base que la pantalla. Un archivo cortado que parece completo es peor que
// ninguno: si el ranking pasa del tope, no se entrega y se pide un filtro (413). Un `route.ts` no pasa por el `layout.tsx` que exige el módulo.
export async function GET(req: Request) {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "reportes_ventas")) return new Response("Tu rol no ve los Reportes de ventas.", { status: 403 });

  const pedidos = filtrosDeUrl(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const { tienda, sede } = await alcanceDeReportes(persona, pedidos.tienda);
  const f = { ...pedidos, tienda, pagina: 0 };
  const periodo = periodoDe(f, hoyLima());

  const lectura = await getRankingCompleto(f, periodo);
  if (lectura.truncado) {
    return new Response(`El ranking tiene más de ${TOPE_DE_DESCARGA.toLocaleString("es-PE")} filas: filtra por categoría, por marca o por tienda y vuelve a descargar.`, { status: 413 });
  }
  if (!lectura.datos) return new Response(lectura.falla ?? "No se pudo leer el ranking.", { status: lectura.sinAcceso ? 403 : 502 });

  return new Response(csvDeRanking(lectura.datos, f.nivel, f.orden), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoRanking(periodo, f, sede)}"`,
      "Cache-Control": "no-store",
    },
  });
}
