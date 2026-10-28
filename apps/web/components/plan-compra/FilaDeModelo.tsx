"use client";

import { ChevronRight } from "lucide-react";
import { CantidadEditable } from "@/components/plan-compra/CantidadEditable";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { fila, celda } from "@/components/ui/Tabla";
import { enteroES } from "@/lib/plan-compra-reglas";
import { TEXTO_DEL_DATO, type ColorRepartido, type ModeloRepartido } from "@/lib/plan-compra-modelos";

// Una fila del ranking de modelos del paso 2 del Plan (ADR-0526, spike ⑥): el modelo con su marca debajo, lo que vendió, lo que hay, lo que el sistema propone y lo que la persona compra; y, abierta,
// sus colores y de cada color sus tallas, que se editan ahí mismo. La cuenta es de `lib/plan-compra-modelos.ts`; esto solo la dibuja y avisa qué cambió la persona.

export const PLANTILLA_DE_MODELOS = "sm:grid-cols-[minmax(0,1.7fr)_64px_minmax(0,92px)_84px_minmax(0,150px)_minmax(0,1.1fr)]";

const Punto = ({ hex }: { hex: string | null }) => (
  // El color de la prenda es dato: no cambia con el tema (ADR-0336, regla 3).
  <span data-color-dato aria-hidden className="p2-punto" style={hex ? { backgroundColor: hex } : undefined} />
);

export function FilaDeModelo({
  m,
  abierto,
  tallas,
  deshabilitado,
  onAbrir,
  onModelo,
  onColor,
  onTalla,
  onVolver,
}: {
  m: ModeloRepartido;
  abierto: boolean;
  tallas: { id: string; valor: string }[];
  deshabilitado: boolean;
  onAbrir: () => void;
  onModelo: (n: number) => void;
  onColor: (codigo: string, n: number) => void;
  onTalla: (codigo: string, tallaId: string, n: number) => void;
  onVolver: () => void;
}) {
  const dato = TEXTO_DEL_DATO[m.dato];
  return (
    <>
      <div className={fila(PLANTILLA_DE_MODELOS, `p2-modelo ${abierto ? "p2-abierto" : ""}`)} onClick={onAbrir}>
        <span className="min-w-0">
          <button
            type="button"
            aria-expanded={abierto}
            onClick={(e) => {
              e.stopPropagation();
              onAbrir();
            }}
            className="flex max-w-full items-center gap-1.5 text-left font-semibold text-tinta"
          >
            <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-taupe transition-transform duration-200 ease-cayla motion-reduce:transition-none ${abierto ? "rotate-90" : ""}`} />
            <span className="truncate">{m.nombre}</span>
            <span className="sr-only">: {abierto ? "ocultar" : "ver"} sus colores y tallas</span>
          </button>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 pl-5.5 text-xs text-taupe">
            <span>{m.marca ?? "Sin marca"}</span>
            {m.editado && (
              <Chip tono="ambar" versalitas={false}>
                editado
              </Chip>
            )}
          </span>
        </span>
        <span className={celda("der", "text-tinta")} title="Lo que vendió este modelo en los días que lleva el ERP">
          <span className="sm:hidden text-taupe">Vendió </span>
          {enteroES.format(m.vendidas)}
        </span>
        <span className={celda("der", "text-tinta")}>
          <span className="sm:hidden text-taupe">Hay hoy </span>
          {enteroES.format(m.hay)}
          {m.alcanza !== null && (
            <span className={`block text-xs ${m.alcanza < 14 ? "font-semibold text-ambar-profundo" : "text-taupe"}`} title="Para cuántos días alcanza lo que hay al ritmo de lo vendido">
              alcanza {m.alcanza} d
            </span>
          )}
        </span>
        <span className={celda("der", "text-tinta/80")} title="Lo que el sistema propone repetir de este modelo">
          <span className="sm:hidden text-taupe">El sistema propone </span>
          {m.elegible ? enteroES.format(m.propone) : "—"}
        </span>
        <span className="min-w-0 sm:justify-self-end" onClick={(e) => e.stopPropagation()}>
          <CantidadEditable valor={m.unidades} onCambiar={onModelo} etiqueta={`prendas de ${m.nombre}`} tamano="celda" deshabilitado={deshabilitado} />
        </span>
        <span className="min-w-0">
          <Chip tono={dato.tono} versalitas={false}>
            {dato.texto}
          </Chip>
        </span>
      </div>
      {abierto && (
        <div className="p2-detalle" data-guia="paso2.detalle">
          <p className="text-xs text-taupe">
            Los colores que más vendió «{m.nombre}». Cambia las prendas de cada talla o de cada color: el color suma sus tallas, el modelo suma sus colores y lo que queda del total del paso 1 se ajusta.
          </p>
          <div className="overflow-x-auto">
            <MatrizDelModelo m={m} tallas={tallas} deshabilitado={deshabilitado} onColor={onColor} onTalla={onTalla} />
          </div>
          {m.editado && (
            <div className="flex flex-wrap items-center gap-3">
              <Chip tono="ambar" versalitas={false}>
                Lo cambiaste: el sistema proponía {enteroES.format(m.propone)}
              </Chip>
              <Boton type="button" peso="fantasma" className="btn-chico" onClick={onVolver} disabled={deshabilitado}>
                Usar lo que propone
              </Boton>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Los colores de un modelo por sus tallas: una rejilla (no una tabla de registros) con la cantidad de cada color y de cada talla en un paso de cantidad. */
function MatrizDelModelo({
  m,
  tallas,
  deshabilitado,
  onColor,
  onTalla,
}: {
  m: ModeloRepartido;
  tallas: { id: string; valor: string }[];
  deshabilitado: boolean;
  onColor: (codigo: string, n: number) => void;
  onTalla: (codigo: string, tallaId: string, n: number) => void;
}) {
  const columnas = { gridTemplateColumns: `minmax(8.5rem,1.4fr) 3.25rem 3.25rem 6.25rem ${tallas.length > 0 ? `repeat(${tallas.length}, 6.25rem)` : ""}` };
  const totalPorTalla = tallas.map((t, j) => m.colores.reduce((s, c) => s + (c.tallas[j]?.unidades ?? 0), 0));
  return (
    <div className="p2-matriz min-w-max text-sm" role="group" aria-label={`Colores y tallas de ${m.nombre}`}>
      <div className="p2-matriz-fila p2-matriz-cabecera" style={columnas}>
        <span>Color</span>
        <span className="text-right">Vendió</span>
        <span className="text-right">Hay</span>
        <span className="text-center">Comprar</span>
        {tallas.map((t) => (
          <span key={t.id} className="text-center">
            {t.valor}
          </span>
        ))}
      </div>
      {m.colores.map((c) => (
        <FilaDeColor key={c.codigo} c={c} columnas={columnas} nombreModelo={m.nombre} deshabilitado={deshabilitado} onColor={onColor} onTalla={onTalla} />
      ))}
      <div className="p2-matriz-fila p2-matriz-total" style={columnas}>
        <span className="font-semibold text-tinta">El modelo suma</span>
        <span />
        <span />
        <span className="text-center font-semibold tabular-nums text-tinta">{enteroES.format(m.unidades)}</span>
        {totalPorTalla.map((n, j) => (
          <span key={tallas[j].id} className="text-center font-semibold tabular-nums text-tinta">
            {enteroES.format(n)}
          </span>
        ))}
      </div>
    </div>
  );
}

function FilaDeColor({
  c,
  columnas,
  nombreModelo,
  deshabilitado,
  onColor,
  onTalla,
}: {
  c: ColorRepartido;
  columnas: { gridTemplateColumns: string };
  nombreModelo: string;
  deshabilitado: boolean;
  onColor: (codigo: string, n: number) => void;
  onTalla: (codigo: string, tallaId: string, n: number) => void;
}) {
  return (
    <div className="p2-matriz-fila" style={columnas}>
      <span className="flex min-w-0 items-center gap-2 font-semibold text-tinta">
        <Punto hex={c.hex} />
        <span className="truncate">{c.nombre}</span>
      </span>
      <span className="text-right tabular-nums text-tinta/80">{enteroES.format(c.vendidas)}</span>
      <span className="text-right tabular-nums text-tinta/80">{enteroES.format(c.hay)}</span>
      <span className="justify-self-center">
        {/* Con tallas, el color es la suma de sus tallas: se cambia en ellas, o se escribe aquí y se reparte por la curva. Sin tallas (accesorios), es lo último. */}
        <CantidadEditable valor={c.unidades} onCambiar={(n) => onColor(c.codigo, n)} etiqueta={`prendas de ${c.nombre} de ${nombreModelo}`} deshabilitado={deshabilitado} />
      </span>
      {c.tallas.map((t) => (
        <span key={t.id ?? t.valor} className="justify-self-center">
          {t.id !== null && (
            <CantidadEditable valor={t.unidades} onCambiar={(n) => onTalla(c.codigo, t.id!, n)} etiqueta={`talla ${t.valor} de ${c.nombre} de ${nombreModelo}`} deshabilitado={deshabilitado} />
          )}
        </span>
      ))}
    </div>
  );
}
