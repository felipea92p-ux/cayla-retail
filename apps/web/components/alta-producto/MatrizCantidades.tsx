"use client";

import { Punto } from "@/components/alta-producto/ElegirColores";
import { limpiarCantidad, type CeldaAlta } from "@/lib/alta-producto";

// «Cuántas tienes hoy» (paso 5 de Nuevo producto, ADR-0212): la MISMA tabla talla × color del paso 4, pero cada celda es
// un número. Misma forma a propósito: quien acaba de armar la tabla reconoce cada celda sin volver a leerla.
//
//   * vacío = 0 (no hace falta escribir ceros);
//   * solo se pueden escribir dígitos, hasta 4: una cantidad imposible (−1, 2.5, «dos») ni siquiera se tipea;
//   * una celda que se quitó en el paso 4 sale con «—» y sin campo: esa variante no se crea, no tiene stock que contar;
//   * a la derecha de cada fila y al pie de cada columna, el total: al contar prendas colgadas se cuenta por color o por
//     talla, y el total de la fila es lo que se compara con la percha.
// En celular la tabla se desplaza dentro de su caja si no entra: la página nunca se desplaza de costado.

export function MatrizCantidades({
  celdas,
  tallas,
  colores,
  excluidas,
  cantidades,
  onCantidad,
}: {
  celdas: CeldaAlta[];
  /** Las tallas elegidas, ya ordenadas. Vacío = el producto no tiene talla (una sola columna). */
  tallas: { id: string; texto: string }[];
  colores: { codigo: string; nombre: string; hex: string | null; familiaColor?: string | null }[];
  excluidas: Set<string>;
  cantidades: Record<string, string>;
  onCantidad: (clave: string, valor: string) => void;
}) {
  const filas: (string | null)[] = colores.length ? colores.map((c) => c.codigo) : [null];
  const columnas: (string | null)[] = tallas.length ? tallas.map((t) => t.id) : [null];
  const celda = (color: string | null, talla: string | null) => celdas.find((c) => c.color === color && c.tallaId === talla);
  const numero = (clave: string) => (excluidas.has(clave) ? 0 : Number(cantidades[clave] || 0));
  const totalFila = (color: string | null) => celdas.filter((c) => c.color === color).reduce((s, c) => s + numero(c.clave), 0);
  const totalColumna = (talla: string | null) => celdas.filter((c) => c.tallaId === talla).reduce((s, c) => s + numero(c.clave), 0);
  const total = celdas.reduce((s, c) => s + numero(c.clave), 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-sand">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-hueso">
            <th scope="col" className="px-2 py-2 text-left text-xs font-semibold text-tinta sm:px-3">
              Color
            </th>
            {columnas.map((t) => (
              <th key={t ?? "sin-talla"} scope="col" className="px-2 py-2 text-xs font-semibold tabular-nums text-tinta">
                {t === null ? "Única" : tallas.find((x) => x.id === t)?.texto}
              </th>
            ))}
            <th scope="col" className="border-l border-sand px-2 py-2 text-right text-xs font-semibold text-taupe sm:px-3">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((color) => {
            const c = colores.find((x) => x.codigo === color);
            return (
              <tr key={color ?? "sin-color"} className="border-t border-sand">
                <th scope="row" className="whitespace-nowrap bg-papel px-2 py-2 text-left font-medium text-tinta sm:px-3">
                  <span className="flex items-center gap-2">
                    {c ? (
                      <>
                        <Punto hex={c.hex} familia={c.familiaColor} />
                        {c.nombre}
                      </>
                    ) : (
                      "Sin color"
                    )}
                  </span>
                </th>
                {columnas.map((talla) => {
                  const cel = celda(color, talla);
                  if (!cel) return <td key={talla ?? "x"} />;
                  if (excluidas.has(cel.clave)) {
                    return (
                      <td
                        key={cel.clave}
                        title="Quitaste esta variante en el paso 4: no se crea."
                        className="border-l border-sand bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(26_26_24/0.05)_6px_7px)] text-center text-tinta/25"
                      >
                        —
                      </td>
                    );
                  }
                  const etiqueta = [c?.nombre ?? "Sin color", tallas.find((x) => x.id === talla)?.texto ?? "Única"].join(" · ");
                  return (
                    <td key={cel.clave} className="border-l border-sand p-0 text-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        autoComplete="off"
                        aria-label={`Cuántas tienes de ${etiqueta}`}
                        placeholder="0"
                        value={cantidades[cel.clave] ?? ""}
                        onChange={(e) => onCantidad(cel.clave, limpiarCantidad(e.target.value))}
                        onFocus={(e) => e.currentTarget.select()}
                        className="mx-auto block h-10 w-11 sm:w-14 border-b border-tinta/20 bg-transparent px-1 text-center text-[13.5px] tabular-nums text-tinta outline-none placeholder:text-tinta/25 focus:border-tinta"
                      />
                    </td>
                  );
                })}
                <td className="border-l border-sand px-2 text-right font-semibold tabular-nums text-tinta sm:px-3">{totalFila(color) || <span className="text-tinta/25">0</span>}</td>
              </tr>
            );
          })}
          {filas.length > 1 && (
            <tr className="border-t border-sand bg-hueso/60">
              <th scope="row" className="px-2 py-2 text-left text-xs font-semibold text-taupe sm:px-3">
                Total
              </th>
              {columnas.map((talla) => (
                <td key={talla ?? "sin-talla"} className="border-l border-sand px-2 py-2 text-center text-xs font-semibold tabular-nums text-tinta">
                  {totalColumna(talla) || <span className="text-tinta/25">0</span>}
                </td>
              ))}
              <td className="border-l border-sand px-2 py-2 text-right font-semibold tabular-nums text-tinta sm:px-3">{total}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
