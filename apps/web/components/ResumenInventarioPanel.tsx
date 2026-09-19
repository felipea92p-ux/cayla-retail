"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { ReponerPisoModal } from "@/components/ReponerPisoModal";
import { ResumenBloques } from "@/components/ResumenBloques";
import { ResumenCapitalModal } from "@/components/ResumenCapitalModal";
import { ResumenControles } from "@/components/ResumenControles";
import { ResumenDetalleModal } from "@/components/ResumenDetalleModal";
import { ResumenPrioridades } from "@/components/ResumenPrioridades";
import { ResumenSenales } from "@/components/ResumenSenales";
import type { AlAccionar } from "@/components/ResumenAccion";
import { useResumenUrl } from "@/components/useResumenUrl";
import type { FiltroEstado } from "@/lib/resumen-filtros";
import { formatoVariacion } from "@/lib/resumen-formato";
import type { ResumenParaPantalla } from "@/lib/resumen-armado";
import { etiquetaRango, textoDemandaAnalizada, textoInstanteLima } from "@/lib/resumen-periodo";
import type { AnalisisVariante } from "@/lib/resumen-reglas";

// Resumen de Inventario v2 (ADR-0113): la capa analítica y de decisión del
// inventario. NO es otra Existencias (eso responde «qué hay ahora»): responde
// «cómo se está comportando, qué significa y qué conviene hacer». Toda la sede se
// analiza en el servidor; acá llega un resumen y UNA página de filas. El estado
// (período, filtros, página) vive en la URL.

const AYUDA_PERIODO =
  "El período elegido cambia las ventas, la velocidad, el sell-through y la tendencia. El stock que se usa para decidir es siempre el de ahora, aunque elijas un período pasado.";

export function ResumenInventarioPanel({ datos }: { datos: ResumenParaPantalla }) {
  const { actualizar, pendiente } = useResumenUrl();
  const [detalle, setDetalle] = useState<AnalisisVariante | null>(null);
  const [capitalAbierto, setCapitalAbierto] = useState(false);
  const [reponer, setReponer] = useState<{ a: AnalisisVariante; cantidad: number } | null>(null);

  const { periodo, comparacion, resumen, ubicacion, sububicaciones, exactitud } = datos;
  const puedeBajarAlPiso = sububicaciones.pisoId !== null && sububicaciones.almacenId !== null;

  const alAccionar: AlAccionar = {
    // «Bajar al piso» abre el modal de Existencias con la cantidad prellenada: la persona confirma allí.
    bajarAlPiso: (a, cantidad) => (setDetalle(null), setReponer({ a, cantidad })),
    verDetalle: (a) => setDetalle(a),
  };

  const ventas = resumen.ventas;
  const variacionVentas = ventas.previo !== null && ventas.previo > 0 ? ((ventas.periodo - ventas.previo) / ventas.previo) * 100 : null;

  return (
    <div className={`space-y-4 transition-opacity duration-200 ${pendiente ? "opacity-60" : ""}`} aria-busy={pendiente}>
      <div className="flex justify-end">
        <div className="text-right text-[11px] leading-[1.35] text-tinta/65">
          <p className="inline-flex items-center gap-1">
            Stock usado para decisiones: <span className="text-tinta">actual al {textoInstanteLima(new Date(datos.ahoraIso))}</span>
            <span title={AYUDA_PERIODO} aria-label={AYUDA_PERIODO} className="inline-flex cursor-help text-tinta/50">
              <Info aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
            </span>
          </p>
          <p>
            {textoDemandaAnalizada(periodo)}
            {comparacion.rango && (
              <>
                {" "}
                · comparado con {etiquetaRango(comparacion.rango, comparacion.modo === "anio")}
                {variacionVentas !== null && (
                  <span className={variacionVentas >= 0 ? "text-verde-profundo" : "text-tinta/70"}>
                    {" "}
                    (ventas {ventas.periodo} uds, {formatoVariacion(variacionVentas)})
                  </span>
                )}
              </>
            )}
          </p>
          {exactitud.estado === "vigente" && (
            <p className="text-verde-profundo">
              Inventario validado: último conteo {new Date(exactitud.ultimoConteo!).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" })} · {exactitud.porcentaje}% de líneas correctas
            </p>
          )}
          {periodo.advertencia && <p className="text-ambar-profundo">{periodo.advertencia}</p>}
        </div>
      </div>

      <ResumenControles periodo={periodo} modoComparacion={comparacion.modo} alcance={datos.alcance} vista={datos.vista} categorias={datos.categorias} actualizar={actualizar} />

      <ResumenSenales
        r={resumen}
        estadoActivo={datos.vista.estado}
        onEstado={(e: FiltroEstado) => actualizar({ est: e === "todos" ? null : e })}
        onCapital={() => setCapitalAbierto(true)}
        noVende={ubicacion.tipo !== "tienda"}
      />

      <ResumenPrioridades datos={datos} puedeBajarAlPiso={puedeBajarAlPiso} alAccionar={alAccionar} actualizar={actualizar} />

      <ResumenBloques datos={datos} actualizar={actualizar} />

      {detalle && <ResumenDetalleModal a={detalle} datos={datos} puedeBajarAlPiso={puedeBajarAlPiso} alAccionar={alAccionar} onClose={() => setDetalle(null)} />}
      {capitalAbierto && <ResumenCapitalModal capital={resumen.capital} ubicacion={ubicacion.nombre} onClose={() => setCapitalAbierto(false)} />}
      {reponer && sububicaciones.pisoId && sububicaciones.almacenId && (
        <ReponerPisoModal
          fila={{ varianteId: reponer.a.fila.varianteId, referencia: reponer.a.fila.referencia, talla: reponer.a.fila.talla, color: reponer.a.fila.color, sku: reponer.a.fila.sku, piso: reponer.a.fila.piso, almacen: reponer.a.fila.almacen }}
          ubicacionId={ubicacion.id}
          sububicacionPisoId={sububicaciones.pisoId}
          sububicacionAlmacenId={sububicaciones.almacenId}
          cantidadInicial={reponer.cantidad}
          onClose={() => setReponer(null)}
        />
      )}
    </div>
  );
}
