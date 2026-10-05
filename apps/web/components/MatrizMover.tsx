"use client";

import { Minus, Plus } from "lucide-react";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { RAYADO_FUERA } from "@/components/alta-producto/MatrizVariantes";
import { fondoDeMuestra } from "@/lib/colores-familias";
import {
  acotarCantidad,
  cantidadDe,
  columnasDeTallas,
  leerCantidadTecleada,
  tallaDelColor,
  topeDeTalla,
  totalesDeMatriz,
  type Cantidades,
  type ColorParaMover,
  type Rumbo,
} from "@/lib/reponer-prenda-reglas";

// La tabla de «Reponer prenda» y «Subir prenda» (ADR-0317): un MODELO con todos sus colores, una fila por color y una columna por talla.
// Es la MISMA tabla de Nuevo y Editar producto (`MatrizCantidades`, Felipe 2026-10-03): encabezado hueso, franja de 5 px con el color
// de la fila pegada al nombre, filas alternadas, la caja − N + por celda (que también se escribe), la columna «Total» y la fila «Total»
// fija abajo; en celular se desliza de lado con la columna del color fija. Una sola forma para que quien ya la conoce no vuelva a leerla.
//
// Lo que esta tabla agrega: bajo cada caja, «hay N» = el tope (lo libre del lugar de donde salen las prendas, `topeDeTalla`). Donde no
// hay nada que mover —o el color no tiene esa talla— la celda sale rayada con «—», como las combinaciones quitadas del alta: sin caja.
// Todo arranca en 0 (ADR-0231): la cifra la pone quien tiene las prendas en la mano. Lo que se ve es lo que se envía: la cifra se recorta
// al tope vivo (si tras refrescar quedó menos de lo elegido, baja).

const BOTON_PASO =
  "grid h-6 w-5 shrink-0 place-items-center rounded-[5px] text-taupe/70 transition-colors hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-25";

export function MatrizMover({
  colores,
  rumbo,
  cantidades,
  problemas,
  bloqueado,
  onCambiar,
  faltan,
}: {
  colores: readonly ColorParaMover[];
  rumbo: Rumbo;
  cantidades: Cantidades;
  /** Lo que la base contestó celda por celda («Solo quedan 3 libres…»), por variante. */
  problemas: Readonly<Record<string, string>>;
  /** Mientras guarda o tras un corte de red (las cifras quedan fijas): los controles se apagan. */
  bloqueado: boolean;
  onCambiar: (varianteId: string, cantidad: number) => void;
  /** Las variantes que faltan en el piso (`tallasQueFaltan`): llevan un punto ámbar mientras no tengan nada elegido. Solo al reponer. */
  faltan?: ReadonlySet<string>;
}) {
  const columnas = columnasDeTallas(colores);
  const totales = totalesDeMatriz(colores, cantidades, rumbo);
  const lugar = rumbo === "bajar" ? "almacén" : "piso";
  // Los totales solo dicen algo donde hay más de uno que sumar (como en `MatrizCantidades`).
  const conColumnaTotal = columnas.length > 1;
  const conFilaTotal = colores.length > 1;
  const textosDeProblema = colores.flatMap((c) =>
    c.tallas.flatMap((t) => {
      const texto = problemas[t.varianteId];
      return texto ? [`${colores.length > 1 ? `${c.nombre} · ` : ""}${t.talla}: ${texto}`] : [];
    }),
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-sand bg-papel" data-matriz-mover>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-[3] whitespace-nowrap border-r border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta sm:pl-3.5">
                Color
              </th>
              {columnas.map((t) => (
                <th key={t} scope="col" className="sticky top-0 z-[2] whitespace-nowrap bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta sm:px-1.5">
                  {t}
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
            {colores.map((color, i) => {
              const conZebra = i % 2 === 1;
              const fondoFila = conZebra ? "bg-hueso/40" : "bg-papel";
              // La franja es el propio color de la fila; el anillo interior la hace legible incluso en blanco o crema.
              const franja = fondoDeMuestra(color.hex) ?? "var(--color-sand)";
              const totalFila = totales.porColor[color.clave] ?? 0;
              return (
                <tr key={color.clave}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-[1] relative whitespace-nowrap border-r border-t border-sand py-1.5 pl-3.5 pr-2 text-left text-[12.5px] font-semibold text-tinta sm:py-2 sm:pl-4 sm:pr-2.5 sm:text-[13.5px] ${fondoFila}`}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[5px] shadow-[inset_-1px_0_0_0_rgba(26,26,24,0.18)]" style={{ background: franja }} />
                    <span className="flex items-center gap-1.5">
                      <Punto hex={color.hex} />
                      {color.nombre}
                    </span>
                  </th>
                  {columnas.map((talla) => {
                    const t = tallaDelColor(color, talla);
                    if (!t) return <td key={talla} className={`border-t border-sand ${fondoFila}`} />;
                    const tope = topeDeTalla(t, rumbo);
                    if (tope <= 0) {
                      return (
                        <td key={t.varianteId} className={`border-t border-sand p-0 ${fondoFila}`}>
                          <span
                            title={`No hay nada libre en el ${lugar}`}
                            className={`flex h-[62px] min-w-[88px] items-center justify-center sm:min-w-[98px] ${RAYADO_FUERA}`}
                          >
                            —
                          </span>
                        </td>
                      );
                    }
                    const n = acotarCantidad(cantidadDe(cantidades, t.varianteId), tope);
                    const etiqueta = `${color.nombre} en ${t.talla}`;
                    const conProblema = Boolean(problemas[t.varianteId]);
                    const falta = rumbo === "bajar" && !!faltan?.has(t.varianteId) && n === 0;
                    return (
                      <td key={t.varianteId} className={`border-t border-sand p-0 ${fondoFila}`}>
                        <span className="flex h-[62px] min-w-[88px] flex-col items-center justify-center gap-0.5 px-0.5 sm:min-w-[98px]">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-[7px] border bg-hueso pl-0.5 pr-0.5 focus-within:border-taupe focus-within:bg-papel ${
                              conProblema ? "border-rojo/60" : "border-transparent"
                            }`}
                          >
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={bloqueado || n <= 0}
                              aria-label={`Una menos de ${etiqueta}`}
                              onClick={() => onCambiar(t.varianteId, acotarCantidad(n - 1, tope))}
                              className={BOTON_PASO}
                            >
                              <Minus aria-hidden strokeWidth={2.25} className="h-3 w-3" />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={4}
                              autoComplete="off"
                              aria-label={`Cuántas de ${etiqueta}${falta ? ". Falta en el piso" : ""}`}
                              data-variante={t.varianteId}
                              value={n}
                              disabled={bloqueado}
                              onChange={(e) => onCambiar(t.varianteId, leerCantidadTecleada(e.target.value, tope))}
                              onFocus={(e) => e.currentTarget.select()}
                              className={`w-8 border-0 bg-transparent py-1.5 text-center text-sm tabular-nums outline-none disabled:opacity-60 sm:w-9 ${n > 0 ? "font-semibold text-tinta" : "text-tinta"}`}
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={bloqueado || n >= tope}
                              aria-label={`Una más de ${etiqueta}`}
                              onClick={() => onCambiar(t.varianteId, acotarCantidad(n + 1, tope))}
                              className={BOTON_PASO}
                            >
                              <Plus aria-hidden strokeWidth={2.25} className="h-3 w-3" />
                            </button>
                          </span>
                          <span className="text-[11px] leading-none tabular-nums text-taupe">
                            {falta && <i aria-hidden title="Falta en el piso" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ambar align-[1px]" />}
                            hay {tope}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                  {conColumnaTotal && (
                    <td className={`border-l border-t border-sand px-2 text-center tabular-nums text-taupe sm:px-3 ${fondoFila}`}>{totalFila || ""}</td>
                  )}
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
                {columnas.map((talla) => (
                  <td key={talla} className="sticky bottom-0 z-[1] border-t border-sand bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta">
                    {totales.porTalla[talla] || ""}
                  </td>
                ))}
                {conColumnaTotal && (
                  <td className="sticky bottom-0 z-[1] border-l border-t border-sand bg-hueso px-2 py-2 text-center font-semibold tabular-nums text-tinta sm:px-3">{totales.total || ""}</td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {textosDeProblema.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs text-rojo-profundo">
          {textosDeProblema.map((texto) => (
            <li key={texto}>{texto}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
