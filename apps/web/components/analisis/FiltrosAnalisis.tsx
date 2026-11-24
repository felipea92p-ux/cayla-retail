"use client";

import { useState } from "react";
import { ArrowUpDown, Clock, Eye, Package, Palette, Ruler, SearchX, Shirt, Tag, type LucideIcon } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { BotonFiltros, DesplegablePildora, FilaPildoras, PanelPildoras } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { Modal } from "@/components/ui/Modal";
import { Vacio } from "@/components/ui/Vacio";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import type { OpcionOrden } from "@/lib/analisis-orden";
import {
  cuantosPuestos,
  opcionesDe,
  puestos,
  quitarOpcion,
  SIN_FILTROS,
  type FacetaAnalisis,
  type FiltrosAnalisis as Filtros,
} from "@/lib/analisis-filtros";

// Análisis, cara B (ADR-0357, act. 2026-11-21): la barra de filtros de toda la pantalla, armada con las piezas del patrón de Productos
// (ficha al milímetro `docs/milimetro/analisis-b.md`, pieza 4): el buscador que filtra al escribir, una píldora de varias opciones por
// filtro con cuántos modelos trae cada una, «Limpiar todo» y cuántos se ven. En el celular, el buscador y el botón de filtros, que abre
// el mismo panel en una hoja. Filtra lo ya leído, en el navegador: nunca dice «Buscando…» ni abre el loader.

const PILDORAS: { faceta: FacetaAnalisis; etiqueta: string; icono: LucideIcon }[] = [
  { faceta: "tipo", etiqueta: "Tipo", icono: Shirt },
  { faceta: "talla", etiqueta: "Talla", icono: Ruler },
  { faceta: "color", etiqueta: "Color", icono: Palette },
  { faceta: "precio", etiqueta: "Precio", icono: Tag },
  { faceta: "origen", etiqueta: "Viene de", icono: Package },
];

const plural = (n: number) => (n === 1 ? "modelo" : "modelos");

export function BarraFiltros({
  modelos,
  filtros,
  onFiltros,
  visibles,
  orden,
  mostrar,
}: {
  /** Todos los modelos de la tienda: de aquí salen las opciones de cada filtro. */
  modelos: readonly ModeloAnalisis[];
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  /** Cuántos modelos pasan los filtros. */
  visibles: number;
  /** Cómo se ordena la pestaña que se ve (la primera opción es la de siempre); sin esto, la pestaña no ofrece ordenar. */
  orden?: { valor: string; opciones: readonly OpcionOrden[]; onValor: (v: string) => void };
  /** «Mostrar» (solo «Qué pedir»): cuántas tarjetas de cada parte, con la misma pieza que «Ordenar por». */
  mostrar?: { valor: string; opciones: readonly OpcionOrden[]; onValor: (v: string) => void };
}) {
  const [hoja, setHoja] = useState(false);
  const n = cuantosPuestos(filtros);
  const listas = puestos(filtros);
  const limpiar = () => onFiltros(SIN_FILTROS);

  const pildora = ({ faceta, etiqueta, icono }: (typeof PILDORAS)[number]) => (
    <DesplegablePildora
      key={faceta}
      icono={icono}
      etiqueta={etiqueta}
      varias={{ valores: filtros[faceta], onValores: (v) => onFiltros({ ...filtros, [faceta]: v } as Filtros) }}
      rotuloCantidad="Modelos"
      opciones={opcionesDe(modelos, filtros, faceta)
        // Las que darían una lista vacía no se ofrecen, salvo que ya estén marcadas (como Productos, ADR-0308).
        .filter((o) => o.cantidad > 0 || (filtros[faceta] as readonly string[]).includes(o.valor))
        .map((o) => ({
          valor: o.valor,
          texto: o.texto,
          cantidad: o.cantidad,
          ...(faceta === "color"
            ? { icono: <span aria-hidden data-color-dato className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-tinta/15 align-middle" style={o.hex ? { background: o.hex } : undefined} /> }
            : {}),
        }))}
    />
  );

  // En la hoja del celular «Limpiar» va en su pie: el panel no lo repite.
  const panel = (enHoja = false) => (
    <PanelPildoras filas>
      <FilaPildoras titulo="Prenda">{PILDORAS.map(pildora)}</FilaPildoras>
      <FilaPildoras titulo="Ventas">
        {pildora({ faceta: "quieta", etiqueta: "Sin venderse", icono: Clock })}
        {n > 0 && !enHoja && <BotonLimpiar onClick={limpiar}>Limpiar todo</BotonLimpiar>}
      </FilaPildoras>
    </PanelPildoras>
  );

  return (
    <div className="analisis-filtros" data-guia="analisis.filtros">
      <div className="flex items-center gap-2">
        <Buscador
          guia="analisis.buscador"
          valor={filtros.q}
          onCambio={(q) => onFiltros({ ...filtros, q })}
          atajo
          etiqueta="Busca una prenda"
          // sugerir-fijo: dice qué se puede buscar en Análisis (prenda, tipo o color); no depende de nada elegido antes
          placeholder="Busca prenda, tipo o color"
          className="min-w-0 flex-1 sm:max-w-md"
        />
        <div className="shrink-0 sm:hidden">
          <BotonFiltros soloIcono abierto={hoja} activos={n} onClick={() => setHoja(true)} />
        </div>
      </div>

      {/* Computadora: el panel a la vista. Celular: solo en la hoja, y lo puesto como chips bajo el buscador. */}
      {!hoja && <div className="mt-3 hidden sm:block">{panel()}</div>}
      {listas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:hidden">
          {listas.map((p) => (
            <FiltroPuesto key={`${p.faceta}|${p.valor}`} onQuitar={() => onFiltros(quitarOpcion(filtros, p.faceta, p.valor))} etiqueta={`Quitar filtro ${p.texto}`}>
              {p.texto}
            </FiltroPuesto>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="m-0 text-sm text-tinta/70" aria-live="polite">
        {n > 0 ? (
          <>
            Ves <strong className="font-semibold text-tinta">{visibles}</strong> de {modelos.length} {plural(modelos.length)}
          </>
        ) : (
          <>
            <strong className="font-semibold text-tinta">{modelos.length}</strong> {plural(modelos.length)} en tu tienda
          </>
        )}
      </p>
      {/* Un solo «Ordenar por», fuera del panel, como Productos: ordenar no quita modelos, solo los acomoda. En «Qué pedir», a su lado,
          «Mostrar»: cuántas tarjetas de cada parte (Felipe 2026-11-24). */}
      {(orden || mostrar) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {mostrar && (
            <div className="min-w-0 rounded-lg vd-hundido p-0.5">
              <DesplegablePildora
                encoger
                icono={Eye}
                etiqueta="Mostrar"
                valor={mostrar.valor}
                valorPorDefecto={mostrar.opciones[0]?.valor}
                onValor={mostrar.onValor}
                opciones={mostrar.opciones.map((o) => ({ valor: o.valor, texto: o.texto }))}
              />
            </div>
          )}
          {orden && (
            <div className="min-w-0 rounded-lg vd-hundido p-0.5">
              <DesplegablePildora
                encoger
                icono={ArrowUpDown}
                etiqueta="Ordenar por"
                valor={orden.valor}
                valorPorDefecto={orden.opciones[0]?.valor}
                onValor={orden.onValor}
                opciones={orden.opciones.map((o) => ({ valor: o.valor, texto: o.texto }))}
              />
            </div>
          )}
        </div>
      )}
      </div>

      {hoja && (
        <Modal titulo="Filtros" subtitulo="Cada cambio se aplica al momento." onClose={() => setHoja(false)} tamano="mediana">
          {panel(true)}
          <div className="pie-hoja-fijo pie-acciones mt-4">
            {n > 0 && (
              <button type="button" onClick={limpiar} className="btn-cayla btn-secundario">
                Limpiar
              </button>
            )}
            <button type="button" onClick={() => setHoja(false)} className="btn-cayla btn-primario flex-1">
              Ver {visibles} {plural(visibles)}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Nada pasa los filtros: dice qué no encontró y deja quitar cada filtro de un toque (la pieza `<Vacio>`, ADR-0358). */
export function VacioFiltros({ filtros, onFiltros }: { filtros: Filtros; onFiltros: (f: Filtros) => void }) {
  const q = filtros.q.trim();
  return (
    <Vacio
      icono={<SearchX />}
      titulo={q ? `Nada con «${q}»` : "Nada con estos filtros"}
      filtros={[
        ...(q ? [{ texto: `«${q}»`, onQuitar: () => onFiltros({ ...filtros, q: "" }) }] : []),
        ...puestos(filtros).map((p) => ({ texto: p.texto, onQuitar: () => onFiltros(quitarOpcion(filtros, p.faceta, p.valor)) })),
      ]}
      acciones={<BotonLimpiar onClick={() => onFiltros(SIN_FILTROS)}>Limpiar todo</BotonLimpiar>}
    >
      Quita un filtro o busca otra cosa.
    </Vacio>
  );
}
