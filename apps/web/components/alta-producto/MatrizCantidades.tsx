"use client";

import { useState } from "react";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { RAYADO_FUERA } from "@/components/alta-producto/MatrizVariantes";
import { limpiarCantidad, type CeldaAlta } from "@/lib/alta-producto";
import { claveEje, limpiarPrecio, llenarTodas, precioDistinto, textoPrecioBase, totalesCantidades } from "@/lib/tabla-alta-reglas";

// La tabla de la prenda en el paso 4 de Nuevo producto (spike v2, 2026-09-28): la MISMA tabla color × talla del paso 3,
// ahora con una caja por celda. Misma forma a propósito: quien acaba de armar la tabla reconoce cada celda sin volver
// a leerla. Un segmento arriba decide qué se escribe en ella:
//
//   * «Cuántas tienes hoy» (la carga inicial, ADR-0212): vacío = 0; solo dígitos, hasta 4 (una cantidad imposible ni se
//     tipea); total por color, por talla y general (la fila «Total» queda fija abajo). «Llenar todas con [n]» pone la
//     misma cantidad en todas las celdas de un golpe (72 en el peor caso real) y después se corrige a mano lo distinto;
//   * «¿Alguna cuesta distinto?»: una caja de precio por celda; vacía = el precio de venta (su placeholder); la que
//     difiere se ve en ámbar. Antes esto vivía en la tabla de variantes, con un botón «Poner un precio distinto».
// La celda quitada en el paso 3 sale rayada con «—» y sin caja: esa variante no se crea, no tiene stock ni precio.
// Encabezado y columna del color fijos, como en el paso 3; en celular la tabla se desliza de lado dentro de su caja.

type Modo = "cantidades" | "precios";

export function MatrizCantidades({
  celdas,
  tallas,
  colores,
  excluidas,
  cantidades,
  onCantidad,
  precioBase,
  precios,
  onPrecio,
  destinoEtiqueta,
}: {
  celdas: CeldaAlta[];
  /** Las tallas elegidas, ya ordenadas. Vacío = el producto no tiene talla (una sola columna). */
  tallas: { id: string; texto: string }[];
  colores: { codigo: string; nombre: string; hex: string | null; familiaColor?: string | null }[];
  excluidas: Set<string>;
  cantidades: Record<string, string>;
  onCantidad: (clave: string, valor: string) => void;
  precioBase: string;
  precios: Record<string, string>;
  onPrecio: (clave: string, valor: string) => void;
  /** Dónde entra el stock, en palabras de tienda: «TRU · Real Plaza». */
  destinoEtiqueta: string;
}) {
  const [modo, setModo] = useState<Modo>("cantidades");
  const [relleno, setRelleno] = useState("");

  const filas: (string | null)[] = colores.length ? colores.map((c) => c.codigo) : [null];
  const columnas: (string | null)[] = tallas.length ? tallas.map((t) => t.id) : [null];
  const celda = (color: string | null, talla: string | null) => celdas.find((c) => c.color === color && c.tallaId === talla);
  const textoTalla = (talla: string | null) => (talla === null ? "Única" : (tallas.find((x) => x.id === talla)?.texto ?? ""));
  const totales = totalesCantidades(celdas, excluidas, cantidades);
  const enCantidades = modo === "cantidades";
  // Los totales solo se muestran donde dicen algo: con una sola talla, el total de la fila repite la celda; con un solo
  // color, el de la columna. El general queda siempre en uno de los dos.
  const conColumnaTotal = enCantidades && columnas.length > 1;
  const conFilaTotal = enCantidades && filas.length > 1;
  const base = Number(precioBase) > 0 ? Number(precioBase).toFixed(2) : "0.00";

  function aplicarRelleno() {
    for (const { clave, valor } of llenarTodas(celdas, excluidas, relleno)) onCantidad(clave, valor);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <div role="group" aria-label="Qué escribes en la tabla" className="flex w-full rounded-[9px] border border-sand bg-crema p-[3px] sm:inline-flex sm:w-auto">
          {(
            [
              ["cantidades", "Cuántas tienes hoy"],
              ["precios", "¿Alguna cuesta distinto?"],
            ] as const
          ).map(([m, texto]) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => setModo(m)}
              className={`flex-1 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors sm:flex-none ${
                modo === m ? "bg-papel text-tinta ring-1 ring-sand" : "text-tinta/60 hover:text-tinta"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
        {/* «Llenar todas» ocupa su lugar también en «precios» (invisible): cambiar de segmento no mueve la tabla (ADR-0185). */}
        <div className={`flex items-center gap-1.5 text-[12.5px] text-taupe ${enCantidades ? "" : "invisible"}`} aria-hidden={!enCantidades}>
          <label htmlFor="alta-llenar-todas">Llenar todas con</label>
          <input
            id="alta-llenar-todas"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoComplete="off"
            placeholder="1"
            value={relleno}
            tabIndex={enCantidades ? undefined : -1}
            onChange={(e) => setRelleno(limpiarCantidad(e.target.value))}
            onKeyDown={(e) => {
              // Enter aplica (y nunca envía el formulario del alta).
              if (e.key === "Enter") {
                e.preventDefault();
                aplicarRelleno();
              }
            }}
            className="h-8 w-[52px] rounded-[7px] border border-transparent bg-hueso px-1.5 text-center tabular-nums text-tinta outline-none placeholder:text-tinta/30 focus:border-taupe"
          />
          <button type="button" onClick={aplicarRelleno} disabled={relleno === ""} tabIndex={enCantidades ? undefined : -1} className="btn-cayla btn-secundario px-2.5 py-1 text-[12.5px]">
            Aplicar
          </button>
        </div>
      </div>

      {/* Las dos bajadas apiladas en la misma celda de grid: la más larga fija el alto, y cambiar de segmento no lo mueve. */}
      <div className="grid text-[12.5px] text-taupe">
        <p className={`col-start-1 row-start-1 ${enCantidades ? "" : "invisible"}`} aria-hidden={!enCantidades}>
          Lo que hay hoy en {destinoEtiqueta}. Lo que no tengas, déjalo vacío. <span className="text-tinta/45">—</span> = no existe.
        </p>
        <p className={`col-start-1 row-start-1 ${enCantidades ? "invisible" : ""}`} aria-hidden={enCantidades}>
          Escribe solo la que cuesta distinto. Vacía = {textoPrecioBase(precioBase)}.
        </p>
      </div>

      <div className="max-h-[520px] overflow-auto overscroll-x-contain rounded-xl border border-sand bg-papel">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-[3] whitespace-nowrap border-r border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta sm:pl-3.5">
                Color
              </th>
              {columnas.map((t) => (
                <th key={t ?? "sin-talla"} scope="col" className="sticky top-0 z-[2] whitespace-nowrap bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta sm:px-1.5">
                  {textoTalla(t)}
                </th>
              ))}
              {conColumnaTotal && (
                <th scope="col" className="sticky top-0 z-[2] whitespace-nowrap border-l border-sand bg-hueso py-2 pl-1 pr-1.5 text-right text-xs font-semibold text-taupe sm:px-3">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((color) => {
              const c = colores.find((x) => x.codigo === color);
              const nombre = c?.nombre ?? "Sin color";
              const totalFila = totales.porFila[claveEje(color)] ?? 0;
              return (
                <tr key={color ?? "sin-color"}>
                  <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap border-r border-t border-sand bg-papel py-1.5 pl-2 pr-2 text-left text-[12.5px] font-semibold text-tinta sm:py-2 sm:pl-3 sm:pr-2.5 sm:text-[13.5px]">
                    <span className="flex items-center gap-1.5">
                      {c && <Punto hex={c.hex} familia={c.familiaColor} />}
                      {nombre}
                    </span>
                  </th>
                  {columnas.map((talla) => {
                    const cel = celda(color, talla);
                    if (!cel) return <td key={talla ?? "x"} className="border-t border-sand" />;
                    if (excluidas.has(cel.clave)) {
                      return (
                        <td key={cel.clave} className="border-t border-sand p-0">
                          <span
                            title="Esta combinación no existe (la quitaste en el paso 3)"
                            className={`flex h-12 min-w-11 items-center justify-center sm:h-[52px] sm:min-w-[54px] ${RAYADO_FUERA}`}
                          >
                            —
                          </span>
                        </td>
                      );
                    }
                    const etiqueta = `${nombre} en ${textoTalla(talla)}`;
                    const propio = precios[cel.clave] ?? "";
                    return (
                      <td key={cel.clave} className="border-t border-sand p-0">
                        <span className="flex h-12 min-w-11 items-center justify-center px-0.5 sm:h-[52px] sm:min-w-[54px]">
                          {enCantidades ? (
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
                              className="w-10 rounded-[7px] border border-transparent bg-hueso px-0.5 py-1.5 text-center text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/25 focus:border-taupe focus:bg-papel sm:w-12 sm:px-1"
                            />
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              aria-label={`Precio de ${etiqueta}`}
                              placeholder={base}
                              value={propio}
                              onChange={(e) => onPrecio(cel.clave, limpiarPrecio(e.target.value))}
                              onFocus={(e) => e.currentTarget.select()}
                              className={`w-[58px] rounded-[7px] border border-transparent bg-hueso px-0.5 py-1.5 text-center text-[13px] tabular-nums outline-none placeholder:text-tinta/30 focus:border-taupe focus:bg-papel sm:w-[66px] ${
                                precioDistinto(propio, precioBase) ? "font-semibold text-ambar" : "text-tinta"
                              }`}
                            />
                          )}
                        </span>
                      </td>
                    );
                  })}
                  {conColumnaTotal && (
                    <td className="border-l border-t border-sand pl-1 pr-1.5 text-right tabular-nums text-taupe sm:px-3">{totalFila || ""}</td>
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
                  <td key={talla ?? "sin-talla"} className="sticky bottom-0 z-[1] border-t border-sand bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta">
                    {totales.porColumna[claveEje(talla)] || ""}
                  </td>
                ))}
                {conColumnaTotal && (
                  <td className="sticky bottom-0 z-[1] border-l border-t border-sand bg-hueso py-2 pl-1 pr-1.5 text-right font-semibold tabular-nums text-tinta sm:px-3">{totales.total}</td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
