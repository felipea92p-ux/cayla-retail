import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/flujo-caja-reglas";
import { cifrasDeRanking, hayFiltros, type FiltrosRanking, type PeriodoRanking, type Ranking } from "@/lib/reportes-ranking-reglas";

// Las cuatro cifras del Ranking de prendas (maqueta docs/maquetas/reportes-ventas-2026-11/): lo que sumó lo filtrado, qué parte de lo vendido es, cuántos
// modelos salieron y cuánto pesan los diez primeros. Es la `TarjetaCifra` de siempre (ADR-0358).
const ENTERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const PORCENTAJE = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

export function CifrasRanking({ r, f, periodo }: { r: Ranking; f: FiltrosRanking; periodo: PeriodoRanking }) {
  const c = cifrasDeRanking(r);
  const filtrado = hayFiltros(f);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Las cifras del ranking">
      <TarjetaCifra etiqueta="Prendas vendidas" valor={ENTERO.format(c.prendas)} unidad={c.prendas === 1 ? "prenda" : "prendas"} pie={filtrado ? "con tus filtros" : periodo.etiqueta.toLowerCase()}>
        {c.parteVendida !== null && filtrado ? `${PORCENTAJE.format(c.parteVendida * 100)} % de lo registrado` : null}
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Vendido" valor={soles(c.vendido)} pie="con el descuento aplicado" />
      <TarjetaCifra etiqueta={f.nivel === "variante" ? "Combinaciones que salieron" : "Modelos que salieron"} valor={ENTERO.format(c.cuantos)} pie="los que vendieron al menos 1" />
      <TarjetaCifra
        etiqueta="Las 10 primeras"
        valor={c.partePrimerosDiez === null ? null : `${PORCENTAJE.format(c.partePrimerosDiez * 100)} %`}
        unidad={c.partePrimerosDiez === null ? undefined : "de lo registrado"}
        reparto={c.partePrimerosDiez === null ? undefined : { fraccion: Math.min(1, c.partePrimerosDiez), tono: "ambar" }}
        pie="unas pocas sostienen la venta"
      >
        {c.partePrimerosDiez === null ? "No hay ventas registradas en estas fechas" : null}
      </TarjetaCifra>
    </div>
  );
}
