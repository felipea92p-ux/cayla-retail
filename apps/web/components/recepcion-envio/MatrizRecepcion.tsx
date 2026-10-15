"use client";

import { Minus, Plus } from "lucide-react";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { RAYADO_FUERA } from "@/components/alta-producto/MatrizVariantes";
import { limpiarCantidad, leerCantidad, type ColorAlta } from "@/lib/alta-producto";
import { fondoDeMuestra } from "@/lib/colores-familias";
import { pasoCantidad } from "@/lib/tabla-alta-reglas";
import { matrizDe, nombreDeVariante, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";

// La matriz de lo que llegó de UNA prenda (ADR-0362, fase 4): una fila por color, una columna por talla, como la tabla de Nuevo producto
// (`MatrizCantidades`) — la misma forma a propósito: quien ya armó una prenda reconoce cada celda sin leerla otra vez. Cada celda es una
// talla y un color que la prenda tiene (una variante); la que no existe sale rayada con «—» (se crea con «+ talla o color»).
//
// Dos usos: `modo="cantidades"` (cuántas llegaron, buenas y dañadas juntas) y `modo="danadas"` (cuántas de esas vinieron dañadas: una celda
// con más dañadas que las que llegaron se pinta en ámbar y la guía lo dice). Vacío es cero; solo dígitos, hasta 4 (una cantidad imposible ni
// se tipea). Total por color, por talla y general, solo donde dicen algo.

const BOTON_PASO =
  "grid h-6 w-5 shrink-0 place-items-center rounded-[5px] text-taupe/70 transition-colors hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-25";

export function MatrizRecepcion({
  prenda,
  colores,
  valores,
  onValor,
  modo,
  topes,
  deshabilitada = false,
}: {
  prenda: PrendaRecepcion;
  /** El vocabulario de colores: el orden de las filas y el punto de cada color. */
  colores: readonly ColorAlta[];
  /** Lo escrito en cada celda, por variante. */
  valores: Readonly<Record<string, string>>;
  onValor: (varianteId: string, texto: string) => void;
  modo: "cantidades" | "danadas";
  /** En «dañadas»: lo que llegó de cada variante (una celda que pasa su tope se marca). */
  topes?: Readonly<Record<string, number>>;
  deshabilitada?: boolean;
}) {
  const matriz = matrizDe(prenda, colores.map((c) => c.codigo));
  const porCodigo = new Map(colores.map((c) => [c.codigo, c]));
  const numero = (varianteId: string) => leerCantidad(valores[varianteId] ?? "") ?? 0;

  const totalFila = (colorCodigo: string | null) =>
    matriz.tallas.reduce((a, t) => {
      const v = matriz.celda(t.id, colorCodigo);
      return a + (v ? numero(v.id) : 0);
    }, 0);
  const totalColumna = (tallaId: string | null) =>
    matriz.colores.reduce((a, c) => {
      const v = matriz.celda(tallaId, c.codigo);
      return a + (v ? numero(v.id) : 0);
    }, 0);
  const total = prenda.variantes.reduce((a, v) => a + numero(v.id), 0);
  const conColumnaTotal = matriz.tallas.length > 1;
  const conFilaTotal = matriz.colores.length > 1;
  const pregunta = modo === "cantidades" ? "Cuántas llegaron de" : "Cuántas llegaron dañadas de";

  return (
    <div className="max-h-[520px] overflow-auto overscroll-x-contain rounded-xl border border-sand bg-papel">
      <table // unificar-fijo: la matriz talla × color de la recepción, no una lista de registros
        className="w-full border-separate border-spacing-0 text-[13px]"
      >
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-[3] whitespace-nowrap border-r border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta sm:pl-3.5">
              Color
            </th>
            {matriz.tallas.map((t) => (
              <th key={t.id ?? "unica"} scope="col" className="sticky top-0 z-[2] whitespace-nowrap bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta sm:px-1.5">
                {t.texto}
              </th>
            ))}
            {conColumnaTotal && (
              <th scope="col" className="sticky top-0 z-[2] whitespace-nowrap border-l border-sand bg-hueso px-2 py-2 text-center text-xs font-semibold text-taupe sm:px-3">
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {matriz.colores.map((c, i) => {
            const color = c.codigo ? porCodigo.get(c.codigo) : undefined;
            const conZebra = i % 2 === 1;
            const fondoFila = conZebra ? "bg-hueso/40" : "bg-papel";
            // La columna del color queda fija al deslizar la tabla de lado (celular): su fondo tiene que ser OPACO, o las celdas que pasan por
            // detrás se ven a través de la franja de hueso al 40 %. La mezcla es de tokens (el mismo tono que la fila).
            const fondoFijo = conZebra ? "bg-[color-mix(in_srgb,var(--color-hueso)_40%,var(--color-papel))]" : "bg-papel";
            // La franja del color de la fila (como Nuevo producto): el color de la prenda es un dato, no cambia con el tema.
            const franja = color ? (fondoDeMuestra(color.hex, color.familiaColor, color.tipo) ?? "var(--color-sand)") : "var(--color-sand)";
            return (
              <tr key={c.codigo ?? "sin-color"}>
                <th scope="row" className={`sticky left-0 z-[1] relative whitespace-nowrap border-r border-t border-sand py-1.5 pl-3.5 pr-2 text-left text-[12.5px] font-semibold text-tinta sm:py-2 sm:pl-4 sm:pr-2.5 sm:text-[13.5px] ${fondoFijo}`}>
                  <span
                    aria-hidden
                    data-color-dato
                    className="absolute inset-y-0 left-0 w-[5px] shadow-[inset_-1px_0_0_0_color-mix(in_srgb,var(--color-tinta)_18%,transparent)]"
                    style={{ background: franja }}
                  />
                  <span className="flex items-center gap-1.5">
                    {color && <Punto hex={color.hex} familia={color.familiaColor} tipo={color.tipo} />}
                    {c.nombre}
                  </span>
                </th>
                {matriz.tallas.map((t) => {
                  const v = matriz.celda(t.id, c.codigo);
                  if (!v) {
                    return (
                      <td key={t.id ?? "unica"} className={`border-t border-sand p-0 ${fondoFila}`}>
                        <span title="La prenda no tiene esta talla en este color: créala con «+ talla o color»" className={`flex h-12 min-w-11 items-center justify-center sm:h-[52px] sm:min-w-[54px] ${RAYADO_FUERA}`}>
                          —
                        </span>
                      </td>
                    );
                  }
                  const texto = valores[v.id] ?? "";
                  const tope = topes?.[v.id];
                  const sinNada = modo === "danadas" && (tope ?? 0) === 0;
                  const deMas = modo === "danadas" && tope !== undefined && numero(v.id) > tope;
                  const nombre = nombreDeVariante(v);
                  return (
                    <td key={v.id} className={`border-t border-sand p-0 ${fondoFila}`}>
                      <span className="flex h-12 min-w-[88px] items-center justify-center px-0.5 sm:h-[52px] sm:min-w-[98px]">
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-[7px] border bg-hueso px-0.5 focus-within:border-taupe focus-within:bg-papel ${
                            deMas ? "border-ambar" : "border-transparent"
                          } ${sinNada ? "opacity-40" : ""}`}
                        >
                          <button type="button" tabIndex={-1} disabled={deshabilitada || sinNada || texto === ""} aria-label={`Restar a ${nombre}`} onClick={() => onValor(v.id, pasoCantidad(texto, -1))} className={BOTON_PASO}>
                            <Minus aria-hidden className="h-3 w-3" />
                          </button>
                          <input /* unificar-fijo: la celda de una matriz de tallas y colores, no un campo de formulario */
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            autoComplete="off"
                            aria-label={`${pregunta} ${nombre}`}
                            aria-invalid={deMas || undefined}
                            placeholder="0"
                            value={texto}
                            disabled={deshabilitada || sinNada}
                            onChange={(e) => onValor(v.id, limpiarCantidad(e.target.value))}
                            onFocus={(e) => e.currentTarget.select()}
                            className={`w-8 border-0 bg-transparent py-1.5 text-center text-sm tabular-nums outline-none placeholder:text-tinta/25 sm:w-9 ${deMas ? "font-semibold text-ambar" : "text-tinta"}`}
                          />
                          <button type="button" tabIndex={-1} disabled={deshabilitada || sinNada} aria-label={`Sumar a ${nombre}`} onClick={() => onValor(v.id, pasoCantidad(texto, 1))} className={BOTON_PASO}>
                            <Plus aria-hidden className="h-3 w-3" />
                          </button>
                        </span>
                      </span>
                    </td>
                  );
                })}
                {conColumnaTotal && <td className={`border-l border-t border-sand px-2 text-center tabular-nums text-taupe sm:px-3 ${fondoFila}`}>{totalFila(c.codigo) || ""}</td>}
              </tr>
            );
          })}
        </tbody>
        {conFilaTotal && (
          <tfoot>
            <tr>
              <th scope="row" className="sticky bottom-0 left-0 z-[2] border-r border-t border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta sm:pl-3.5">
                Total
              </th>
              {matriz.tallas.map((t) => (
                <td key={t.id ?? "unica"} className="sticky bottom-0 z-[1] border-t border-sand bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta">
                  {totalColumna(t.id) || ""}
                </td>
              ))}
              {conColumnaTotal && <td className="sticky bottom-0 z-[1] border-l border-t border-sand bg-hueso px-2 py-2 text-center font-semibold tabular-nums text-tinta sm:px-3">{total}</td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
