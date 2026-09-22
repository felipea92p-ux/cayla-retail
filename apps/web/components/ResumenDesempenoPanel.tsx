"use client";

import { ItemAyuda } from "@/components/ResumenActualizado";
import { ResumenCabecera } from "@/components/ResumenCabecera";
import { ResumenComportamiento } from "@/components/ResumenComportamiento";
import { ResumenControles } from "@/components/ResumenControles";
import { useResumenUrl } from "@/components/useResumenUrl";
import { TENDENCIA_MIN_UNIDADES, TENDENCIA_UMBRAL_PCT } from "@/lib/inventario-reglas";
import { pluralizar } from "@/lib/resumen-formato";
import { AYUDA_ROTACION, TEXTO_VALORACION_ROTACION } from "@/lib/rotacion";
import type { DesempenoParaPantalla } from "@/lib/resumen-desempeno";

// Análisis de inventario › Desempeño (ADR-0138): «¿cómo se comportó mi inventario durante el período
// seleccionado?». Es la mirada HISTÓRICA: no mezcla el stock de hoy —qué hay ahora y cuánto dura, con
// sus acciones, vive en Existencias— ni compara dos períodos —eso es la otra pestaña—. El estado
// (período, categoría, sell-through, búsqueda, orden y página) vive en la URL, como en todo el análisis.

export function ResumenDesempenoPanel({ datos }: { datos: DesempenoParaPantalla }) {
  const { actualizar, pendiente } = useResumenUrl();
  const { periodo, ubicacion } = datos;

  return (
    <div className={`space-y-4 transition-opacity duration-200 ${pendiente ? "opacity-60" : ""}`} aria-busy={pendiente}>
      <ResumenCabecera modo="desempeno" ahoraIso={datos.ahoraIso} actualizar={actualizar}>
        <ItemAyuda titulo="Período">
          {periodo.etiqueta}
          {periodo.preset === "mes" || periodo.preset === "personalizado" ? ` (${pluralizar(periodo.dias, "día", "días")})` : ""}. Todo lo de esta pantalla es del período: el stock de hoy no interviene (eso está en Existencias).
        </ItemAyuda>
        <ItemAyuda titulo="Ritmo de venta">Unidades netas vendidas ÷ días con stock en el período (los días agotado no castigan el ritmo).</ItemAyuda>
        <ItemAyuda titulo="Sell-through">Ventas netas ÷ (stock al inicio del período + entradas): qué parte de lo disponible se vendió.</ItemAyuda>
        <ItemAyuda titulo="Rotación">
          {AYUDA_ROTACION} {TEXTO_VALORACION_ROTACION} Es la misma de Comparar períodos; una variante a la que le falta el costo de lo vendido o del stock queda en N/D y va al final al ordenar por rotación.
        </ItemAyuda>
        <ItemAyuda titulo="Tendencia">
          El ritmo de la segunda mitad del período contra el de la primera: si cambia {TENDENCIA_UMBRAL_PCT}% o más es Aceleró o Desaceleró; si no, Estable. Con menos de {TENDENCIA_MIN_UNIDADES} unidades vendidas en el período no se afirma nada (N/D).
        </ItemAyuda>
        {datos.estimadas > 0 && (
          <p className="text-ambar-profundo">
            {pluralizar(datos.estimadas, "variante tiene", "variantes tienen")} un historial de movimientos que no cuadra con el stock de hoy: sus cifras (marcadas con ≈) son estimadas.
          </p>
        )}
      </ResumenCabecera>
      {periodo.advertencia && <p className="text-[11px] text-ambar-profundo">{periodo.advertencia}</p>}

      <ResumenControles modo="desempeno" periodo={periodo} alcance={datos.alcance} categorias={datos.categorias} sellThrough={datos.sellThrough} actualizar={actualizar} />

      {ubicacion.tipo !== "tienda" ? (
        <p className="card-cayla px-5 py-10 text-sm text-taupe">
          {ubicacion.nombre} no vende a clientas: no hay ventas, ritmo ni rotación que analizar. Elige una tienda en el selector de sede de arriba.
        </p>
      ) : datos.tabla.totalSede === 0 ? (
        <p className="card-cayla px-5 py-10 text-sm text-taupe">
          {ubicacion.nombre} no tuvo stock ni ventas en este período. Cuando reciba mercadería o venda, aparecerá acá.
        </p>
      ) : (
        <ResumenComportamiento datos={datos} actualizar={actualizar} />
      )}
    </div>
  );
}
