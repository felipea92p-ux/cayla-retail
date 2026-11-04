import { redirect } from "next/navigation";
import { SearchX, Shirt } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { alcanceDeReportes } from "@/lib/reportes-ventas-alcance";
import { getFotosDeModelos, getOpcionesRanking, getRanking } from "@/lib/reportes-ranking";
import { hoyLima } from "@/lib/fechas-lima";
import { filtrosDeUrl, hayFiltros, hrefRanking, periodoDe, sePuedeComparar } from "@/lib/reportes-ranking-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { CabeceraReportes } from "@/components/reportes-ventas/CabeceraReportes";
import { FiltrosRanking } from "@/components/reportes-ventas/FiltrosRanking";
import { CifrasRanking } from "@/components/reportes-ventas/CifrasRanking";
import { TablaRanking } from "@/components/reportes-ventas/TablaRanking";
import { PanelTallasColores } from "@/components/reportes-ventas/PanelTallasColores";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { Vacio } from "@/components/ui/Vacio";

// Ventas ▸ Reportes ▸ Ranking de prendas (maqueta docs/maquetas/reportes-ventas-2026-11/, cara A · Tabla). Actividad 5: las fechas, la tienda, la categoría,
// la marca, la talla, el color y la búsqueda; por modelo o por color y talla; por prendas o por soles; con su comparación contra el período anterior del
// mismo largo y lo que queda en las tiendas. Lee en el servidor con `fn_reporte_ventas_ranking`: el líder ve todas las tiendas y elige una; quien tiene el
// módulo en su rol ve solo la suya (lo decide la base, no esta pantalla). Todo vive en la URL (ver `hrefRanking`).
export default async function RankingPrendasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const persona = await requirePersonaActualV2();
  const sp = await searchParams;
  const hoy = hoyLima();
  const pedidos = filtrosDeUrl(sp);

  // Una tienda que la cuenta no puede elegir (o que no existe) no se obedece: la URL no amplía lo que se ve.
  const { tiendas, tienda, sede } = await alcanceDeReportes(persona, pedidos.tienda);
  const f = { ...pedidos, tienda };
  const periodo = periodoDe(f, hoy);

  const [lectura, opciones] = await Promise.all([getRanking(f, periodo), getOpcionesRanking()]);
  const r = lectura.datos;
  // Una página que ya no existe (se cambió un filtro y quedan menos filas) vuelve a la primera.
  if (r && r.filas.length === 0 && r.cuantos > 0 && f.pagina > 0) redirect(hrefRanking(f, { pagina: 0 }));
  const fotos = r ? await getFotosDeModelos(r.filas.map((x) => x.productoId)) : new Map<string, string>();
  const sinPrendaFiltrada = !f.categoria && !f.marca && !f.talla && !f.color && !f.q;

  return (
    <div className="space-y-6">
      <CabeceraReportes
        sede={sede}
        activa="ranking"
        acciones={r && r.cuantos > 0 ? <BotonDescargar guia="reportes.descargar" href={hrefRanking(f, { pagina: 0 }).replace("/vender/reportes/ranking", "/vender/reportes/ranking/descargar")}>Descargar Excel</BotonDescargar> : undefined}
      />
      <FiltrosRanking f={f} periodo={periodo} hoy={hoy} opciones={opciones.datos} tiendas={tiendas} />
      {opciones.falla && (
        <Aviso tono="atencion" chico titulo="Faltan algunos filtros">
          {opciones.falla} El ranking sigue bien.
        </Aviso>
      )}
      {lectura.falla ? (
        <Aviso tono={lectura.sinAcceso ? "atencion" : "error"} titulo={lectura.sinAcceso ? "Tu rol no ve los Reportes de ventas" : "No se pudo leer el ranking"}>
          {lectura.sinAcceso ? "Pídele a quien administra los accesos que te lo active." : `${lectura.falla} Vuelve a intentarlo en un momento.`}
        </Aviso>
      ) : r ? (
        <>
          <CifrasRanking r={r} f={f} periodo={periodo} />
          {r.sinRegistrar.unidades > 0 && sinPrendaFiltrada && (
            <Aviso tono="info" chico titulo={`No cuenta ${new Intl.NumberFormat("es-PE").format(r.sinRegistrar.unidades)} ${r.sinRegistrar.unidades === 1 ? "prenda sin registrar" : "prendas sin registrar"} (${soles(r.sinRegistrar.vendido)})`}>
              Se cobraron en caja sin elegir de qué modelo eran. Cuando se registren en Por regularizar, entran aquí.
            </Aviso>
          )}
          {r.cuantos > 0 && !sePuedeComparar(r) && <p className="texto-detalle text-taupe">El período anterior empieza antes de que se vendiera: no se compara.</p>}
          {r.cuantos === 0 ? (
            <Vacio icono={hayFiltros(f) ? <SearchX /> : <Shirt />} titulo={hayFiltros(f) ? "No hay ventas con esos filtros" : "No hay ventas registradas en estas fechas"}>
              {hayFiltros(f) ? "Quita un filtro de arriba o elige otras fechas." : "Elige otras fechas para ver qué se vendió."}
            </Vacio>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:items-start">
              <TablaRanking r={r} f={f} periodo={periodo} fotos={fotos} />
              <PanelTallasColores r={r} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
