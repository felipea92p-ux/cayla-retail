import Link from "next/link";
import { BarChart3, Rows3 } from "lucide-react";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import {
  CAMINOS,
  CIUDADES,
  hrefTrafico,
  rangoTexto,
  type CampanaDelPeriodo,
  type FiltrosTrafico,
  type Periodo,
  type ResumenTrafico,
} from "@/lib/trafico-reglas";
import { FiltrosPuestosTrafico } from "./FiltrosPuestosTrafico";

/**
 * La fila de controles de Tráfico (ADR-0495, actividad 6): el período (7 días, 30 días o la campaña), qué días son y contra cuáles se
 * comparan, los filtros puestos y cómo verlo (gráfico o tabla). Todo vive en la dirección: se puede compartir y «atrás» vuelve.
 */
export function ControlesTrafico({
  filtros,
  periodo,
  campana,
  r,
}: {
  filtros: FiltrosTrafico;
  periodo: Periodo;
  campana: CampanaDelPeriodo | null;
  r: ResumenTrafico;
}) {
  const periodos = [
    { clave: "7" as const, nombre: "7 días", title: undefined },
    { clave: "30" as const, nombre: "30 días", title: undefined },
    ...(campana
      ? [{ clave: "campana" as const, nombre: campana.nombre, title: campana.vigente ? "La campaña que rige hoy, desde que empezó" : "La última campaña que terminó" }]
      : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <nav aria-label="Período" className="flex flex-wrap items-center gap-2" data-guia="trafico.periodo">
        {periodos.map((p) => (
          <Link
            key={p.clave}
            href={hrefTrafico(filtros, { periodo: p.clave })}
            scroll={false}
            aria-current={periodo.clave === p.clave ? "page" : undefined}
            className="pildora-cayla"
            title={p.title}
          >
            {p.nombre}
          </Link>
        ))}
      </nav>
      <span className="text-[12.5px] text-tinta/70" title={`Se compara con ${rangoTexto(r.anteriorDesde, r.anteriorHasta).toLowerCase()}`}>
        {rangoTexto(periodo.desde, periodo.hasta)}
      </span>
      <FiltrosPuestosTrafico
        camino={filtros.camino ? { nombre: CAMINOS[filtros.camino], sinEl: hrefTrafico(filtros, { camino: null }) } : null}
        ciudad={filtros.ciudad ? { nombre: CIUDADES[filtros.ciudad].nombre, sinEl: hrefTrafico(filtros, { ciudad: null }) } : null}
        limpiar={hrefTrafico(filtros, { camino: null, ciudad: null })}
      />
      <SegmentoEnlaces
        className="sm:ml-auto"
        etiquetaAccesible="Cómo verlo"
        activo={filtros.vista}
        guia="trafico.vista"
        opciones={[
          { valor: "grafico", etiqueta: "Gráfico", href: hrefTrafico(filtros, { vista: "grafico" }), icono: <BarChart3 aria-hidden /> },
          { valor: "tabla", etiqueta: "Tabla", href: hrefTrafico(filtros, { vista: "tabla" }), icono: <Rows3 aria-hidden /> },
        ]}
      />
    </div>
  );
}
