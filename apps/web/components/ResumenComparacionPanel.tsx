"use client";

import { ItemAyuda } from "@/components/ResumenActualizado";
import { ResumenCabecera } from "@/components/ResumenCabecera";
import { ResumenComparacionDetalle } from "@/components/ResumenComparacionDetalle";
import { ResumenComparacionGeneral } from "@/components/ResumenComparacionGeneral";
import { ResumenControles } from "@/components/ResumenControles";
import { ResumenVacio, type SedeParaVer } from "@/components/ResumenVacio";
import { useResumenUrl } from "@/components/useResumenUrl";
import { AYUDA_ROTACION, ETIQUETA_ROTACION_VALORIZADA, TEXTO_LIMITACION_PROMEDIO, TEXTO_VALORACION_ROTACION } from "@/lib/rotacion";
import { pluralizar } from "@/lib/resumen-formato";
import { textoInstanteLima } from "@/lib/resumen-periodo";
import type { ComparacionParaPantalla } from "@/lib/resumen-comparacion";

// Comparación de dos períodos, A contra B (ADR-0138; rediseño 2026-09-19). Responde UNA pregunta —
// «¿qué cambió en el desempeño del inventario entre A y B?»— sobre UN cálculo: arriba el veredicto
// (cuatro cifras, cómo evolucionó el ritmo, quién más rotó, cómo se repartió el sell-through) y debajo
// el detalle, en qué productos y por qué. Tocar una categoría de la dona no recalcula ninguna cifra de
// arriba: solo filtra la tabla de abajo. El estado (períodos, filtro de cambio, orden, página) vive en
// la URL, como en todo el análisis.
//
// A siempre antes que B, en todas partes: el contexto de período (compacto, en `ResumenControles`),
// los KPI, los gráficos, la tabla y sus tooltips. Es el eje de lectura de toda la pantalla.

// Rediseño 2026-09-22 (guía oficial): ya no hay «Vista general / Detalle por producto». Es una sola lectura de
// arriba abajo —cifras, gráficos y la tabla debajo—, y la dona y «Ver ranking» filtran u ordenan esa tabla en vez
// de mandar a otra vista. Sin nada que comparar, un vacío con salidas.

export function ResumenComparacionPanel({ datos, otrasTiendas }: { datos: ComparacionParaPantalla; otrasTiendas: SedeParaVer[] }) {
  const { actualizar, pendiente } = useResumenUrl();
  const { periodoA, periodoB, ubicacion, avisos } = datos;

  return (
    <div className={`space-y-4 transition-opacity duration-200 ${pendiente ? "opacity-60" : ""}`} aria-busy={pendiente}>
      <ResumenCabecera modo="comparar" ahoraIso={datos.ahoraIso} actualizar={actualizar}>
        <ItemAyuda titulo="Cálculo">Hecho el {textoInstanteLima(new Date(datos.ahoraIso))}. Los dos períodos usan los mismos filtros (categoría y búsqueda del detalle).</ItemAyuda>
        <ItemAyuda titulo="Ritmo de venta">Unidades netas vendidas ÷ días con stock en el período (los días agotado no castigan el ritmo).</ItemAyuda>
        <ItemAyuda titulo="Evolución del ritmo">
          Compara el ritmo de B contra el de A: {"±"}25% es Aceleró o Desaceleró, si no, Estable. Con muy pocas unidades vendidas en los dos períodos no se afirma nada.
        </ItemAyuda>
        <ItemAyuda titulo="Sell-through">Ventas netas ÷ (stock al inicio del período + entradas): qué parte de lo disponible se vendió.</ItemAyuda>
        <ItemAyuda titulo={ETIQUETA_ROTACION_VALORIZADA}>
          {AYUDA_ROTACION} {TEXTO_VALORACION_ROTACION} En la cifra total solo cuentan las variantes con datos válidos en A y en B, las mismas en los dos períodos: las que quedan fuera se cuentan bajo la cifra. {TEXTO_LIMITACION_PROMEDIO}
        </ItemAyuda>
        <ItemAyuda titulo="Stock al cierre">
          Lo que había en la sede (piso + almacén) al terminar cada período, reconstruido del historial de movimientos. «Inicio → cierre» no son las ventas: entre uno y otro también pueden llegar recepciones, devoluciones, traslados o ajustes.
        </ItemAyuda>
        {datos.estimadas > 0 && (
          <p className="text-ambar-profundo">
            {pluralizar(datos.estimadas, "variante tiene", "variantes tienen")} un historial de movimientos que no cuadra con el stock de hoy: sus cifras (marcadas con ≈) son estimadas.
          </p>
        )}
      </ResumenCabecera>

      <ResumenControles modo="comparar" periodo={periodoB} modoComparacion={periodoA.modo} rangoComparacion={periodoA.rango} alcance={datos.alcance} categorias={datos.categorias} actualizar={actualizar} />

      {[...avisos, ...(periodoB.advertencia ? [periodoB.advertencia] : [])].map((aviso) => (
        <p key={aviso} className="text-[11px] text-ambar-profundo">
          {aviso}
        </p>
      ))}

      {ubicacion.tipo !== "tienda" || datos.tabla.totalSede === 0 ? (
        <ResumenVacio ubicacion={ubicacion} modo="comparar" puedeAmpliar={false} otrasTiendas={otrasTiendas} actualizar={actualizar} />
      ) : (
        <>
          {/* La entrada (cifras, dona, barras) se reproduce cuando cambia QUÉ se mira —el período o el alcance
              (categoría, búsqueda)—, nunca al tocar el filtro de la dona (que no mueve estos agregados). */}
          <ResumenComparacionGeneral key={`${periodoA.rango.desde}_${periodoA.rango.hasta}_${periodoB.desde}_${periodoB.hasta}_${datos.alcance.categoriaId ?? ""}_${datos.alcance.q}`} datos={datos} actualizar={actualizar} />
          <ResumenComparacionDetalle datos={datos} actualizar={actualizar} />
        </>
      )}
    </div>
  );
}
