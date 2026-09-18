"use client";

import { useState } from "react";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { PrendaCelda } from "@/components/ui/PrendaCelda";
import { DetalleVarianteModal, ListaSituacionModal, TONO_SITUACION } from "@/components/ResumenDetalleModal";
import { tonoExactitud } from "@/lib/conteo-varianza";
import {
  UMBRAL_COBERTURA_CRITICA_DIAS,
  UMBRAL_COBERTURA_RIESGO_DIAS,
  UMBRAL_SOBRESTOCK_SEMANAS,
} from "@/lib/inventario-reglas";
import {
  DIAS_SIN_VENTA_SOBRESTOCK,
  ETIQUETA_SITUACION,
  MIN_DIAS_HISTORIAL,
  textoAccion,
  textoCobertura,
  textoEnRed,
  type AnalisisVariante,
} from "@/lib/resumen-reglas";
import type { ResumenParaPantalla } from "@/lib/resumen-inventario";

// Resumen de Inventario (2026-09-17, ADR-0101): análisis + excepciones +
// decisiones de UNA sede. No es otra Existencias (eso responde "qué hay en
// esta fila") ni un tablero de gráficos: cinco bloques, todos con el número
// a la vista y el "por qué" a un click. Decisiones > métricas decorativas.

const PLANTILLA = "sm:grid-cols-[minmax(13.5rem,1.6fr)_10rem_7rem_9rem_10rem_6rem]";

const DECISIONES_VISIBLES = 8;

type Lista = "riesgo" | "traslados" | "reposicion" | "curvas" | "sobrestock" | "en_camino";

export function ResumenInventarioPanel({
  resumen,
  ubicacionId,
  /** La sede de la persona (cookie/sede base): la única para la que la pestaña
   *  Conteo muestra lo mismo que esta tarjeta — Conteo no acepta `?ubicacion=`. */
  ubicacionBaseId,
}: {
  resumen: ResumenParaPantalla;
  ubicacionId: string;
  ubicacionBaseId: string;
}) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [detalle, setDetalle] = useState<AnalisisVariante | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const { salud, riesgo, traslados, reposicionAhora, curvas, sobrestock, enCamino, decisiones, vigilar, exactitud } = resumen;

  // Todo lo que pide acción ya está en `decisiones` (lo "normal" no viaja).
  const filasDe = (l: Lista): AnalisisVariante[] => {
    switch (l) {
      case "riesgo":
        return decisiones.filter((a) => a.situacion === "riesgo_quiebre");
      case "traslados":
        return decisiones.filter((a) => a.sugerencia !== null);
      case "reposicion":
        return decisiones.filter((a) => a.situacion === "riesgo_quiebre" && a.critico);
      case "curvas":
        return decisiones.filter((a) => a.situacion === "curva_incompleta");
      case "sobrestock":
        return decisiones.filter((a) => a.situacion === "posible_sobrestock");
      case "en_camino":
        return decisiones.filter((a) => a.situacion === "mejora_en_camino");
    }
  };

  const TITULO_LISTA: Record<Lista, { titulo: string; subtitulo: string }> = {
    riesgo: { titulo: "Riesgo de quiebre", subtitulo: `Cobertura de ${UMBRAL_COBERTURA_RIESGO_DIAS} días o menos al ritmo de venta observado, o sin stock con ventas recientes.` },
    traslados: { titulo: "Traslados sugeridos", subtitulo: "Otra sede puede ceder sin quedarse corta. Nada se mueve solo: el traslado lo creas tú." },
    reposicion: { titulo: "Necesita reposición ahora", subtitulo: `Sin stock con demanda, o cobertura de ${UMBRAL_COBERTURA_CRITICA_DIAS} días o menos.` },
    curvas: { titulo: "Curvas incompletas", subtitulo: "Una talla en cero entre tallas hermanas con stock, en esta sede." },
    sobrestock: { titulo: "Posible sobrestock", subtitulo: `Cobertura de ${UMBRAL_SOBRESTOCK_SEMANAS} semanas o más, o ${DIAS_SIN_VENTA_SOBRESTOCK} días observados sin ninguna venta.` },
    en_camino: { titulo: "En camino con impacto", subtitulo: "Lo que ya viajó saca a la prenda del riesgo: conviene esperar la recepción antes de mover nada." },
  };

  const decisionesVisibles = verTodas ? decisiones : decisiones.slice(0, DECISIONES_VISIBLES);

  return (
    <div className="space-y-6">
      {/* Bloque 1 — estado general */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaCifra etiqueta="Salud del inventario" valor={salud ? `${salud.porcentaje}%` : "—"}>
          {salud ? `${salud.sinAlerta} de ${salud.relevantes} variantes sin alertas` : "Sin variantes con historial en esta sede"}
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Riesgo de quiebre"
          valor={riesgo.total}
          unidad={riesgo.total === 1 ? "variante" : "variantes"}
          tono={riesgo.criticas > 0 ? "text-rojo" : undefined}
          onClick={() => setLista("riesgo")}
          activa={lista === "riesgo"}
        >
          {riesgo.total === 0
            ? "Ninguna con cobertura baja"
            : riesgo.criticas > 0
              ? `${riesgo.criticas} crítica${riesgo.criticas === 1 ? "" : "s"} en los próximos ${UMBRAL_COBERTURA_CRITICA_DIAS} días`
              : "Ninguna crítica todavía"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Traslados sugeridos" valor={traslados.total} onClick={() => setLista("traslados")} activa={lista === "traslados"}>
          {traslados.total === 0 ? "No se detectaron oportunidades" : `${traslados.entreTiendas} entre tiendas · ${traslados.desdeTaller} desde taller`}
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Exactitud del inventario"
          valor={exactitud ? `${exactitud.porcentaje.toLocaleString("es-PE")}%` : "—"}
          tono={exactitud ? tonoExactitud(exactitud.porcentaje) : undefined}
          href={ubicacionId === ubicacionBaseId ? "/inventario/conteo" : undefined}
        >
          {exactitud
            ? `${exactitud.correctas} de ${exactitud.lineas} líneas · ${exactitud.conteos} ${exactitud.conteos === 1 ? "conteo cerrado" : "conteos cerrados"}`
            : "Aún no hay conteos cerrados"}
        </TarjetaCifra>
      </div>

      {/* Bloque 2 — situaciones que necesitan atención */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaCifra
          etiqueta="Necesita reposición ahora"
          valor={reposicionAhora.total}
          acento={reposicionAhora.total > 0}
          accion={{ texto: "Ver detalle", onClick: () => setLista("reposicion") }}
        >
          {reposicionAhora.total === 0
            ? "Nada urgente por reponer"
            : `variantes sin stock o cobertura ≤ ${UMBRAL_COBERTURA_CRITICA_DIAS} días`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Curvas incompletas" valor={curvas.total} accion={{ texto: "Ver detalle", onClick: () => setLista("curvas") }}>
          {curvas.total === 0 ? "Ninguna curva rota detectada" : `faltan tallas clave en ${curvas.productos} curva${curvas.productos === 1 ? "" : "s"}`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Posible sobrestock" valor={sobrestock.total} accion={{ texto: "Ver detalle", onClick: () => setLista("sobrestock") }}>
          {sobrestock.total === 0 ? "Sin excesos evidentes" : `con cobertura mayor a ${UMBRAL_SOBRESTOCK_SEMANAS} sem. o sin ventas`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="En camino con impacto" valor={enCamino.total} accion={{ texto: "Ver detalle", onClick: () => setLista("en_camino") }}>
          {enCamino.total === 0 ? "Ningún traslado cambia una situación crítica" : `variantes que mejoran cobertura crítica (+${enCamino.unidades} uds)`}
        </TarjetaCifra>
      </div>

      {/* Bloque 3 — decisiones sugeridas hoy */}
      <Tabla>
        <div className="flex items-baseline justify-between px-5 py-3">
          <p className="label-cayla text-[11px] text-tinta">Decisiones sugeridas hoy</p>
          <p className="label-cayla text-[10px] text-tinta/45">{decisiones.length}</p>
        </div>
        {decisiones.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tinta/55">
            Sin decisiones pendientes en esta sede. Con {MIN_DIAS_HISTORIAL} días de historial por prenda el resumen empieza a proponer.
          </p>
        ) : (
          <>
            <Encabezado
              plantilla={PLANTILLA}
              columnas={[
                { titulo: "Prenda · variante" },
                { titulo: "Situación" },
                { titulo: "Cobertura" },
                { titulo: "En la red" },
                { titulo: "Acción sugerida" },
                { titulo: "Detalle", alinear: "centro" },
              ]}
            />
            {decisionesVisibles.map((a) => (
              <div key={a.fila.varianteId} className={fila(PLANTILLA)}>
                <PrendaCelda referencia={a.fila.referencia} sku={a.fila.sku} talla={a.fila.talla} color={a.fila.color} fotoUrl={a.fila.fotoUrl} />
                <span className={celda("izq", "overflow-visible")}>
                  <Chip tono={TONO_SITUACION[a.situacion]}>{ETIQUETA_SITUACION[a.situacion]}</Chip>
                </span>
                <span className={celda("izq", "text-sm text-tinta")}>
                  <span className="label-cayla mr-1 text-[10px] font-normal text-tinta/45 sm:hidden">Cobertura</span>
                  {textoCobertura(a)}
                </span>
                <span className={celda("izq", "text-sm text-tinta")}>
                  <span className="label-cayla mr-1 text-[10px] font-normal text-tinta/45 sm:hidden">En la red</span>
                  {textoEnRed(a)}
                </span>
                <span className={celda("izq", "text-sm text-tinta")}>
                  <span className="label-cayla mr-1 text-[10px] font-normal text-tinta/45 sm:hidden">Acción</span>
                  {textoAccion(a)}
                </span>
                <span className={celda("centro", "overflow-visible")}>
                  <button
                    type="button"
                    onClick={() => setDetalle(a)}
                    className="label-cayla rounded-full border border-tinta/20 px-3 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
                  >
                    Ver detalle
                  </button>
                </span>
              </div>
            ))}
            {decisiones.length > DECISIONES_VISIBLES && (
              <div className="px-5 py-2.5 text-xs text-tinta/55">
                <button type="button" onClick={() => setVerTodas((v) => !v)} className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline">
                  {verTodas ? "Ver menos" : `Ver las ${decisiones.length}`}
                </button>
              </div>
            )}
          </>
        )}
      </Tabla>

      {/* Bloque 4 y 5 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card-cayla p-5">
          <p className="label-cayla text-[11px] text-tinta">Productos a vigilar</p>
          {vigilar.length === 0 ? (
            <p className="mt-4 text-sm text-tinta/55">Nada que vigilar por ahora.</p>
          ) : (
            <ul className="mt-2 divide-y divide-tinta/10">
              {vigilar.map(({ analisis: a, razon }) => (
                <li key={a.fila.varianteId}>
                  <button
                    type="button"
                    onClick={() => setDetalle(a)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-tinta/[0.03]"
                  >
                    <PrendaCelda referencia={a.fila.referencia} sku={a.fila.sku} talla={a.fila.talla} color={a.fila.color} fotoUrl={a.fila.fotoUrl} compacta />
                    <span className="shrink-0 text-sm text-tinta/55">{razon}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-cayla p-5">
          <p className="label-cayla text-[11px] text-tinta">Cómo leer este resumen</p>
          <ol className="mt-3 space-y-3">
            {[
              {
                titulo: "Riesgo de quiebre:",
                texto: "la cobertura actual es crítica.",
                pie: `Stock para ${UMBRAL_COBERTURA_RIESGO_DIAS} días o menos al ritmo de venta observado; crítico con ${UMBRAL_COBERTURA_CRITICA_DIAS} días o sin stock.`,
              },
              {
                titulo: "Curva incompleta:",
                texto: "faltan tallas clave de una curva válida.",
                pie: "Una talla en cero entre tallas hermanas con stock. Solo cuentan las tallas que el producto tiene dadas de alta.",
              },
              {
                titulo: "Reponer tienda / piso:",
                texto: "la reserva de la tienda bajó del umbral, o el piso está vacío con almacén sano.",
                pie: "Tienda = pedir a otra sede o al Taller (solo se sugiere cuánto si hay ventas observadas). Piso = bajar del almacén, sin pedir nada.",
              },
              {
                titulo: "Sugerir traslado:",
                texto: "hay stock útil en otra sede.",
                pie: `Otra sede cede solo lo que le sobra en el almacén sin bajar de ${UMBRAL_COBERTURA_RIESGO_DIAS} días de cobertura propia; el Taller cede todo. Nada se mueve sin que lo crees tú.`,
              },
            ].map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sand/70 text-xs text-tinta">{i + 1}</span>
                <span>
                  <span className="text-sm text-tinta">
                    <span className="font-medium">{item.titulo}</span> {item.texto}
                  </span>
                  <span className="block text-xs text-tinta/55">{item.pie}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-tinta/10 pt-3 text-xs text-tinta/55">
            Velocidad = ventas menos devoluciones y cambios de los últimos {resumen.ventanaDias} días, contados desde que la prenda llegó a esta sede. Con menos de {MIN_DIAS_HISTORIAL} días observados no se calcula nada.
          </p>
        </section>
      </div>

      {lista && !detalle && (
        <ListaSituacionModal
          titulo={TITULO_LISTA[lista].titulo}
          subtitulo={TITULO_LISTA[lista].subtitulo}
          filas={filasDe(lista)}
          onElegir={(a) => setDetalle(a)}
          onClose={() => setLista(null)}
        />
      )}
      {detalle && <DetalleVarianteModal analisis={detalle} ubicacionId={ubicacionId} onClose={() => setDetalle(null)} />}
    </div>
  );
}
