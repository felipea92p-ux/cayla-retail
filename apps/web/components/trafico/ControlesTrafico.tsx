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
import { AtajosPeriodo } from "./AtajosPeriodo";
import { FiltrosPuestosTrafico } from "./FiltrosPuestosTrafico";

/**
 * La fila de controles de Tráfico (ADR-0495, actividad 6; «Observatorio», actividad 1): el período (Hoy, Ayer, 7 días, Este mes, Mes pasado
 * o la campaña), qué días son y contra cuáles se comparan, los filtros puestos y cómo verlo (gráfico o tabla). Todo vive en la dirección: se puede compartir y «atrás» vuelve.
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
    { clave: "hoy" as const, nombre: "Hoy", tecla: "h" },
    { clave: "ayer" as const, nombre: "Ayer", tecla: "a" },
    { clave: "7" as const, nombre: "7 días", tecla: "7" },
    { clave: "mes" as const, nombre: "Este mes", tecla: "m" },
    { clave: "mes-pasado" as const, nombre: "Mes pasado", tecla: "p" },
    ...(campana ? [{ clave: "campana" as const, nombre: campana.nombre, tecla: "c" }] : []),
  ];
  const teclas = Object.fromEntries(periodos.map((p) => [p.tecla, hrefTrafico(filtros, { periodo: p.clave })]));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {/* Como la maqueta «Observatorio» (Felipe 2026-10-28: «que la implementación sea como la maqueta»): los períodos en un solo segmento,
          con la pieza de la casa (`SegmentoEnlaces`, la caja arena con la opción elegida en papel), no pastillas sueltas. Cada cambio de
          período suma una entrada al «atrás» (`reemplazar={false}`) y no lleva la vista arriba. Las teclas las atiende `AtajosPeriodo`. */}
      <SegmentoEnlaces
        etiquetaAccesible="Período"
        activo={periodo.clave}
        guia="trafico.periodo"
        reemplazar={false}
        scroll={false}
        opciones={periodos.map((p) => ({ valor: p.clave, etiqueta: p.nombre, href: hrefTrafico(filtros, { periodo: p.clave }) }))}
      />
      <AtajosPeriodo teclas={teclas} />
      <span
        className="text-[12.5px] text-tinta/70"
        title={`Se compara con ${rangoTexto(r.anteriorDesde, r.anteriorHasta).toLowerCase()}${r.anteriorCorte ? ", hasta esta hora" : ""}`}
      >
        {rangoTexto(periodo.desde, periodo.hasta)} · se compara con {periodo.antes}
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
