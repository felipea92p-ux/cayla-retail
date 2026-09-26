"use client";

import { Punto } from "@/components/alta-producto/ElegirColores";
import type { CeldaAlta } from "@/lib/alta-producto";

// Las variantes como TABLA talla × color (spike Nuevo producto, 2026-09-24). Antes eran una fila de casillas sueltas,
// cada una con su campo de precio: con 4 tallas y 3 colores salían 12 cajitas y no se veía la forma del modelo.
//
//   * clic en una celda la quita (queda rayada) o la vuelve a poner;
//   * clic en el nombre de un color o en una talla quita o pone la fila o la columna entera;
//   * «Poner un precio distinto a alguna» cambia las celdas por campos de precio; vacío = el precio de todas.
// En celular la celda dice solo ✓ (el precio de todas ya está arriba); un precio distinto sí se ve, en ámbar.
// La tabla se desplaza dentro de su caja si no entra: la página nunca se desplaza de costado.

export function MatrizVariantes({
  celdas,
  tallas,
  colores,
  excluidas,
  onExcluidas,
  precioBase,
  precios,
  onPrecio,
  editandoPrecios,
}: {
  celdas: CeldaAlta[];
  /** Las tallas elegidas, ya ordenadas. Vacío = el producto no tiene talla (una sola columna). */
  tallas: { id: string; texto: string }[];
  colores: { codigo: string; nombre: string; hex: string | null }[];
  excluidas: Set<string>;
  onExcluidas: (s: Set<string>) => void;
  precioBase: string;
  precios: Record<string, string>;
  onPrecio: (clave: string, valor: string) => void;
  editandoPrecios: boolean;
}) {
  const filas: (string | null)[] = colores.length ? colores.map((c) => c.codigo) : [null];
  const columnas: (string | null)[] = tallas.length ? tallas.map((t) => t.id) : [null];
  const celda = (color: string | null, talla: string | null) => celdas.find((c) => c.color === color && c.tallaId === talla);
  const base = Number(precioBase) > 0 ? Number(precioBase).toFixed(2) : "";

  function alternar(claves: string[]) {
    const copia = new Set(excluidas);
    const todasFuera = claves.every((k) => copia.has(k));
    for (const k of claves) {
      if (todasFuera) copia.delete(k);
      else copia.add(k);
    }
    onExcluidas(copia);
  }
  const clavesDeFila = (color: string | null) => celdas.filter((c) => c.color === color).map((c) => c.clave);
  const clavesDeColumna = (talla: string | null) => celdas.filter((c) => c.tallaId === talla).map((c) => c.clave);

  return (
    <div className="overflow-x-auto rounded-xl border border-sand">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-hueso">
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-tinta">
              Color
            </th>
            {columnas.map((t) => (
              <th key={t ?? "sin-talla"} scope="col" className="p-0 text-xs font-semibold text-tinta">
                {t === null ? (
                  <span className="block px-2 py-2">Única</span>
                ) : (
                  <button type="button" onClick={() => alternar(clavesDeColumna(t))} title="Quitar o poner toda la talla" className="w-full px-2 py-2 tabular-nums hover:bg-tinta/[0.05]">
                    {tallas.find((x) => x.id === t)?.texto}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((color) => {
            const c = colores.find((x) => x.codigo === color);
            return (
              <tr key={color ?? "sin-color"} className="border-t border-sand">
                <th scope="row" className="bg-papel p-0 text-left font-medium text-tinta">
                  <button type="button" onClick={() => alternar(clavesDeFila(color))} title="Quitar o poner todo el color" className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left hover:bg-tinta/[0.04]">
                    {c ? (
                      <>
                        <Punto hex={c.hex} />
                        {c.nombre}
                      </>
                    ) : (
                      "Sin color"
                    )}
                  </button>
                </th>
                {columnas.map((talla) => {
                  const cel = celda(color, talla);
                  if (!cel) return <td key={talla ?? "x"} />;
                  const fuera = excluidas.has(cel.clave);
                  const propio = precios[cel.clave];
                  const etiqueta = [c?.nombre ?? "Sin color", tallas.find((x) => x.id === talla)?.texto ?? "Única"].join(" · ");
                  if (!fuera && editandoPrecios) {
                    return (
                      <td key={cel.clave} className="border-l border-sand p-0 text-center">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          aria-label={`Precio de ${etiqueta}`}
                          placeholder={base || "0.00"}
                          value={propio ?? ""}
                          onChange={(e) => onPrecio(cel.clave, e.target.value)}
                          className="h-10 w-16 border-b border-tinta/20 bg-transparent px-1 text-right text-[12.5px] tabular-nums outline-none focus:border-tinta"
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={cel.clave} className="border-l border-sand p-0 text-center">
                      <button
                        type="button"
                        onClick={() => alternar([cel.clave])}
                        aria-pressed={!fuera}
                        aria-label={fuera ? `${etiqueta}: fuera. Volver a incluir` : `${etiqueta}: incluida. Quitar`}
                        className={`flex h-10 w-full min-w-11 items-center justify-center gap-1 px-2 tabular-nums transition-colors hover:bg-tinta/[0.04] ${
                          fuera
                            ? "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(26_26_24/0.05)_6px_7px)] text-tinta/25"
                            : propio
                              ? "font-semibold text-ambar"
                              : "text-tinta"
                        }`}
                      >
                        {fuera ? (
                          "—"
                        ) : (
                          <>
                            <span aria-hidden className="text-[10px] text-verde">
                              ✓
                            </span>
                            {propio ? Number(propio).toFixed(2) : <span className="hidden sm:inline">{base}</span>}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
