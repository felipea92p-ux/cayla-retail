"use client";

import { Punto } from "@/components/alta-producto/ElegirColores";
import { RAYADO_FUERA } from "@/components/alta-producto/rayado";
import type { CeldaAlta } from "@/lib/alta-producto";
import { leyendaVariantes } from "@/lib/tabla-alta-reglas";

// La tabla de la prenda (paso 3 de Nuevo producto, spike v2 2026-09-28): una fila por color, una columna por talla.
// Las fotos ya no van aquí: viven en «Fotos y colores», justo arriba (ADR-0663, /formidable 2026-11-14), que es de donde
// salen los colores. Antes cada color tenía su miniatura en la fila y había una línea más para «Una foto para todos los
// colores»: dos lugares para lo mismo en el mismo paso.
//
//   * cada celda es una variante: ✓ se crea; tocarla la quita (queda rayada con «—») y tocarla otra vez la devuelve;
//   * UNA sola forma de quitar cada cosa (revisión de claridad del spike): la talla se quita arriba, en Tallas; el
//     color, con su ×; aquí solo se toca la combinación que no existe. Por eso ni el encabezado ni la fila quitan nada;
//   * encabezado de tallas fijo arriba y columna del color fija a la izquierda: con 9 tallas × 8 colores (el peor caso
//     real) la tabla se desplaza dentro de su caja y la página nunca se desborda a lo ancho (375 px incluidos).
// El precio distinto por celda ya no vive aquí: pasó al segmento «Precios» de `MatrizCantidades` (y el costo, a «Costos»).

type Color = { codigo: string; nombre: string; hex: string | null; familiaColor?: string | null; tipo?: string | null };

/** El rayado de «no existe»: el mismo en los pasos 3 y 4. Vive en `rayado.ts` (la tabla de cantidades lo usa sin arrastrar las fotos); se sigue exportando de aquí. */
export { RAYADO_FUERA };

export function MatrizVariantes({
  celdas,
  tallas,
  colores,
  excluidas,
  onExcluidas,
  disabled = false,
}: {
  celdas: CeldaAlta[];
  /** Las tallas elegidas, ya ordenadas. Vacío = el producto no tiene talla (una sola columna). */
  tallas: { id: string; texto: string }[];
  colores: Color[];
  excluidas: Set<string>;
  onExcluidas: (s: Set<string>) => void;
  disabled?: boolean;
}) {
  const filas: (string | null)[] = colores.length ? colores.map((c) => c.codigo) : [null];
  const columnas: (string | null)[] = tallas.length ? tallas.map((t) => t.id) : [null];
  const celda = (color: string | null, talla: string | null) => celdas.find((c) => c.color === color && c.tallaId === talla);
  const textoTalla = (talla: string | null) => (talla === null ? "Única" : (tallas.find((x) => x.id === talla)?.texto ?? ""));
  const incluidas = celdas.filter((c) => !excluidas.has(c.clave)).length;
  const leyenda = leyendaVariantes(
    incluidas,
    colores.map((c) => c.nombre),
    tallas.map((t) => t.texto)
  );

  function alternar(clave: string) {
    const copia = new Set(excluidas);
    if (copia.has(clave)) copia.delete(clave);
    else copia.add(clave);
    onExcluidas(copia);
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-snug">
        <b className="text-[15px] tabular-nums text-tinta">{incluidas}</b>{" "}
        <span className="text-taupe">
          variante{incluidas === 1 ? "" : "s"} ({leyenda.deDonde}). <span className="font-bold text-verde">✓</span> se crea.
          {leyenda.ejemplo && (
            <>
              {" "}
              ¿Alguna no existe, como {leyenda.ejemplo}? Tócala y queda <span className="text-tinta/45">—</span>
            </>
          )}
        </span>
      </p>

      <div className="max-h-[520px] overflow-auto overscroll-x-contain rounded-xl border border-sand bg-papel">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-[3] whitespace-nowrap border-r border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta sm:pl-3.5">
                {colores.length ? "Color" : "Prenda"}
              </th>
              {columnas.map((t) => (
                <th key={t ?? "sin-talla"} scope="col" className="sticky top-0 z-[2] whitespace-nowrap bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta sm:px-1.5">
                  {textoTalla(t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((color) => {
              const c = colores.find((x) => x.codigo === color);
              const nombre = c?.nombre ?? "Sin color";
              return (
                <tr key={color ?? "sin-color"}>
                  <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap border-r border-t border-sand bg-papel py-1.5 pl-2 pr-2 text-left font-medium text-tinta sm:py-2 sm:pl-3 sm:pr-2.5">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold sm:text-[13.5px]">
                      {c && <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />}
                      {nombre}
                    </span>
                  </th>
                  {columnas.map((talla) => {
                    const cel = celda(color, talla);
                    if (!cel) return <td key={talla ?? "x"} className="border-t border-sand" />;
                    const fuera = excluidas.has(cel.clave);
                    const etiqueta = `${nombre} en ${textoTalla(talla)}`;
                    return (
                      <td key={cel.clave} className="border-t border-sand p-0 text-center">
                        <button
                          type="button"
                          onClick={() => alternar(cel.clave)}
                          disabled={disabled}
                          aria-pressed={!fuera}
                          aria-label={fuera ? `${etiqueta}: no se crea. Toca para volver a ponerla` : `${etiqueta}: se crea. Toca para quitarla`}
                          title={fuera ? "No se crea · toca para volver a ponerla" : "Toca para quitarla"}
                          className={`flex h-12 w-full min-w-11 items-center justify-center text-[12.5px] transition-colors duration-150 hover:bg-tinta/[0.04] sm:h-[52px] sm:min-w-[54px] ${
                            fuera ? RAYADO_FUERA : ""
                          }`}
                        >
                          {fuera ? (
                            "—"
                          ) : (
                            <span aria-hidden className="text-xs font-bold text-verde">
                              ✓
                            </span>
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
    </div>
  );
}
