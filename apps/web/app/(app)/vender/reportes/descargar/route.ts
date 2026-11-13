import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDeParametro, type Mes } from "@/lib/facturacion-reglas";
import { getCortesMes, getReporteMes } from "@/lib/reportes-ventas";
import { alcanceDeReportes } from "@/lib/reportes-ventas-alcance";
import { corteDeUrl, cortesOfrecidos, tiendaDeUrl } from "@/lib/reportes-ventas-reglas";
import { csvDeVentasDelMes, nombreArchivoVentasDelMes } from "@/lib/reportes-ventas-exportar-reglas";

// Descargar Ventas ▸ Reportes ▸ Ventas del mes: la tabla del corte que se está mirando (por tienda o por categoría), con su Total, en un CSV que Excel abre
// directo (mismo formato que el Historial, ADR-0230). Una ruta y no un botón que arma el archivo en el navegador: lee con las MISMAS funciones de la base que
// la pantalla, así que dice lo mismo y respeta lo que la cuenta puede ver (el líder, todas las tiendas; con el módulo en su rol, la suya).
// Un `route.ts` no pasa por el `layout.tsx` que exige el módulo: se pregunta aquí.
export async function GET(req: Request) {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "reportes_ventas")) return new Response("Tu rol no ve los Reportes de ventas.", { status: 403 });

  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const hoy = hoyLima();
  const actual: Mes = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  const mes = mesDeParametro(sp.m, actual);
  const { tienda, sede } = await alcanceDeReportes(persona, tiendaDeUrl(sp.tienda));

  const [cifras, cortes] = await Promise.all([getReporteMes(mes, tienda), getCortesMes(mes, tienda)]);
  if (!cifras.datos || !cortes.datos) return new Response(cifras.falla ?? cortes.falla ?? "No se pudo leer el reporte.", { status: cifras.sinAcceso ? 403 : 502 });

  const corte = corteDeUrl(sp.corte, cortesOfrecidos(cortes.datos));
  return new Response(csvDeVentasDelMes(cifras.datos, cortes.datos, corte), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoVentasDelMes(cifras.datos.mes, corte, sede)}"`,
      "Cache-Control": "no-store",
    },
  });
}
