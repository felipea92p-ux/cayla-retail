"use client";

import { ItemAyuda } from "@/components/ResumenActualizado";
import { Pestanas, ResumenCabecera } from "@/components/ResumenCabecera";
import { ResumenComparacionDetalle } from "@/components/ResumenComparacionDetalle";
import { ResumenComparacionGeneral } from "@/components/ResumenComparacionGeneral";
import { ResumenControles } from "@/components/ResumenControles";
import { useResumenUrl } from "@/components/useResumenUrl";
import { AYUDA_ROTACION, TEXTO_LIMITACION_PROMEDIO, TEXTO_VALORACION_ROTACION } from "@/lib/rotacion";
import { pluralizar } from "@/lib/resumen-formato";
import { textoInstanteLima } from "@/lib/resumen-periodo";
import type { ComparacionParaPantalla, VistaComparacion } from "@/lib/resumen-comparacion";

// Comparación de dos períodos, A contra B (ADR-0138; rediseño 2026-09-19). Responde UNA pregunta —
// «¿qué cambió en el desempeño del inventario entre A y B?»— en dos vistas sobre el MISMO cálculo:
// la general da el veredicto (cuatro cifras, cómo evolucionó el ritmo, quién más rotó, cómo se
// repartió el sell-through) y el detalle dice en qué productos y por qué. Tocar una categoría de la
// dona no recalcula ninguna cifra de arriba: solo abre el detalle con ese filtro puesto. El estado
// (períodos, vista, filtro de cambio, orden, página) vive en la URL, como en todo el análisis.
//
// A siempre antes que B, en todas partes: el contexto de período (compacto, en `ResumenControles`),
// los KPI, los gráficos, la tabla y sus tooltips. Es el eje de lectura de toda la pantalla.

const VISTAS: readonly { valor: VistaComparacion; texto: string }[] = [
  { valor: "general", texto: "Vista general" },
  { valor: "detalle", texto: "Detalle por producto" },
];

export function ResumenComparacionPanel({ datos }: { datos: ComparacionParaPantalla }) {
  const { actualizar, pendiente } = useResumenUrl();
  const { periodoA, periodoB, vista, ubicacion, avisos } = datos;

  return (
    <div className={`space-y-4 transition-opacity duration-200 ${pendiente ? "opacity-60" : ""}`} aria-busy={pendiente}>
      <ResumenCabecera modo="comparar" ahoraIso={datos.ahoraIso} actualizar={actualizar}>
        <ItemAyuda titulo="Cálculo">Hecho el {textoInstanteLima(new Date(datos.ahoraIso))}. Los dos períodos usan los mismos filtros (categoría y búsqueda del detalle).</ItemAyuda>
        <ItemAyuda titulo="Ritmo de venta">Unidades netas vendidas ÷ días con stock en el período (los días agotado no castigan el ritmo).</ItemAyuda>
        <ItemAyuda titulo="Evolución del ritmo">
          Compara el ritmo de B contra el de A: {"±"}25% es Aceleró o Desaceleró, si no, Estable. Con muy pocas unidades vendidas en los dos períodos no se afirma nada.
        </ItemAyuda>
        <ItemAyuda titulo="Sell-through">Ventas netas ÷ (stock al inicio del período + entradas): qué parte de lo disponible se vendió.</ItemAyuda>
        <ItemAyuda titulo="Rotación">
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

      {ubicacion.tipo !== "tienda" ? (
        <p className="card-cayla px-5 py-10 text-sm text-taupe">
          {ubicacion.nombre} no vende a clientas: no hay ventas ni rotación que comparar. Elige una tienda en el selector de sede de arriba.
        </p>
      ) : (
        <>
          <Pestanas
            etiqueta="Vista de la comparación"
            valor={vista}
            opciones={VISTAS}
            // Al cambiar de vista se parte de los valores iniciales: el filtro y el orden son del detalle.
            onValor={(v) => actualizar({ vista: v === "detalle" ? "detalle" : null, cambio: null, orden: null })}
          />
          {datos.tabla.totalSede === 0 ? (
            <p className="card-cayla px-5 py-10 text-sm text-taupe">
              {ubicacion.nombre} no tuvo stock ni ventas en estos dos períodos. Cuando reciba mercadería o venda, aparecerá acá.
            </p>
          ) : vista === "general" ? (
            // La entrada (KPI, dona, barras) se reproduce de nuevo cuando cambia QUÉ se mira —el
            // período o el alcance (categoría, búsqueda)—, nunca al tocar el filtro de la dona (que no
            // mueve estos agregados) ni por un simple repintado del servidor.
            <ResumenComparacionGeneral key={`${periodoA.rango.desde}_${periodoA.rango.hasta}_${periodoB.desde}_${periodoB.hasta}_${datos.alcance.categoriaId ?? ""}_${datos.alcance.q}`} datos={datos} actualizar={actualizar} />
          ) : (
            <ResumenComparacionDetalle datos={datos} actualizar={actualizar} />
          )}
        </>
      )}
    </div>
  );
}
