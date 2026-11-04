import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas } from "@/components/ui/Pestanas";

// La cabecera común de Ventas ▸ Reportes (Felipe 2026-11-03; maqueta docs/maquetas/reportes-ventas-2026-11/): el título con el nombre del
// menú y las dos vistas como pestañas de URL (cada una es su ruta, así que «atrás» y el enlace directo funcionan). El título es el del
// menú, nunca la tienda (CLAUDE.md «Paleta y orden de pantalla»).
export type VistaReporte = "mes" | "ranking";

const FRASES: Record<VistaReporte, string> = {
  mes: "Cuánto se vendió cada mes, en qué tienda y cómo pagaron.",
  ranking: "Qué prendas salen más, con las fechas y los filtros que quieras.",
};

/** `acciones`: lo que se puede hacer con lo que se ve (hoy, descargarlo); a la derecha de la cabecera, como en las demás pantallas (ADR-0220). */
export function CabeceraReportes({ sede, activa, acciones }: { sede: string; activa: VistaReporte; acciones?: ReactNode }) {
  return (
    <>
      <EncabezadoPagina sede={sede} titulo="Reportes" subtitulo={FRASES[activa]} acciones={acciones} />
      <Pestanas
        idIndicador="reportes-ventas"
        guia="reportes.pestanas"
        etiquetaAccesible="Qué reporte ver"
        activa={activa}
        items={[
          { clave: "mes", etiqueta: "Ventas del mes", href: "/vender/reportes" },
          { clave: "ranking", etiqueta: "Ranking de prendas", href: "/vender/reportes/ranking" },
        ]}
      />
    </>
  );
}
