"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ItemAyuda } from "@/components/ResumenActualizado";
import { ResumenCabecera } from "@/components/ResumenCabecera";
import { ResumenComparacionDetalle } from "@/components/ResumenComparacionDetalle";
import { ResumenComparacionGeneral } from "@/components/ResumenComparacionGeneral";
import { ResumenControles } from "@/components/ResumenControles";
import { ResumenVacio, type SedeParaVer } from "@/components/ResumenVacio";
import { useResumenUrl } from "@/components/useResumenUrl";
import { AYUDA_ROTACION, ETIQUETA_ROTACION_VALORIZADA, TEXTO_LIMITACION_PROMEDIO, TEXTO_VALORACION_ROTACION } from "@/lib/rotacion";
import { pluralizar } from "@/lib/resumen-formato";
import { periodosParaSembrar } from "@/lib/resumen-periodos-guardados";
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
//
// Barra de período (2026-09-29): la misma tarjeta «PERÍODO ANALIZADO» de Desempeño, con A y B en lugar de los atajos,
// la búsqueda debajo y sin categoría. Los avisos —A anterior al historial, períodos de distinta duración o
// superpuestos, B recortado— ya no son párrafos sueltos entre la barra y las cifras: viven dentro de la tarjeta y solo
// están cuando hay algo que decir.

export function ResumenComparacionPanel({ datos, otrasTiendas, claveGuardado }: { datos: ComparacionParaPantalla; otrasTiendas: SedeParaVer[]; claveGuardado: string }) {
  const { actualizar, pendiente } = useResumenUrl();
  const { periodoA, periodoB, ubicacion, avisos } = datos;

  // Entrar a Comparar con una URL SIN fechas (el enlace guardado, «atrás» hacia una dirección vacía) sin haber pasado por
  // la pestaña: si la persona dejó A y B elegidos, se le ponen en la URL. El clic de la pestaña ya lo hace antes de
  // navegar (`ResumenCabecera`); esto cubre solo las demás entradas. `periodosParaSembrar` no hace nada si la URL ya
  // trae fechas de Comparar, así que no hay bucle: la URL nueva las trae.
  const params = useSearchParams();
  useEffect(() => {
    const sembrar = periodosParaSembrar(claveGuardado, (k) => params.has(k));
    if (Object.keys(sembrar).length > 0) actualizar(sembrar, { conservarPagina: true });
  }, [claveGuardado, params, actualizar]);

  return (
    <div className={`space-y-4 transition-opacity duration-200 ${pendiente ? "opacity-60" : ""}`} aria-busy={pendiente}>
      <ResumenCabecera modo="comparar" ahoraIso={datos.ahoraIso} actualizar={actualizar} claveGuardado={claveGuardado}>
        <ItemAyuda titulo="Cálculo">Hecho el {textoInstanteLima(new Date(datos.ahoraIso))}. Los dos períodos usan la misma búsqueda.</ItemAyuda>
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

      <ResumenControles
        modo="comparar"
        periodo={periodoB}
        rangoA={periodoA.rango}
        alcance={datos.alcance}
        avisos={avisos}
        claveGuardado={claveGuardado}
        actualizar={actualizar}
      />

      {ubicacion.tipo !== "tienda" || datos.tabla.totalSede === 0 ? (
        <ResumenVacio ubicacion={ubicacion} modo="comparar" puedeAmpliar={false} otrasTiendas={otrasTiendas} actualizar={actualizar} />
      ) : (
        <>
          {/* La entrada (cifras, dona, barras) se reproduce cuando cambia QUÉ se mira —el período o la búsqueda—,
              nunca al tocar el filtro de la dona (que no mueve estos agregados). */}
          <ResumenComparacionGeneral key={`${periodoA.rango.desde}_${periodoA.rango.hasta}_${periodoB.desde}_${periodoB.hasta}_${datos.alcance.q}`} datos={datos} actualizar={actualizar} />
          <ResumenComparacionDetalle datos={datos} actualizar={actualizar} />
        </>
      )}
    </div>
  );
}
