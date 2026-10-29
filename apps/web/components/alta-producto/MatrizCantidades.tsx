"use client";

import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Punto } from "./Punto";
import { SegmentoDeslizante } from "../ui/SegmentoDeslizante";
import { PasoCantidad } from "../ui/PasoCantidad";
import { RAYADO_FUERA } from "./rayado";
import { limpiarCantidad, type CeldaAlta } from "../../lib/alta-producto";
import { fondoDeMuestra } from "../../lib/colores-familias";
import {
  cambiosDeRelleno,
  celdaVecina,
  claveEje,
  columnasEditables,
  costoDistinto,
  limpiarPrecio,
  movimientoDeTecla,
  nombreCelda,
  pasoCantidad,
  precioDistinto,
  precioPropioInvalido,
  textoCostoBase,
  textoPrecioBase,
  totalesCantidades,
} from "../../lib/tabla-alta-reglas";

// Imports RELATIVOS a propósito (ADR-0396, A2): así la tabla se dibuja sola con `renderToStaticMarkup` en una prueba de node (vitest no resuelve `@/`), y la prueba
// `lib/matriz-cantidades.test.ts` fija su HTML de hoy como «golden» para que lo que cambie en Nueva orden no mueva Nuevo producto.

// La tabla de la prenda en el paso 4 de Nuevo producto (spike v2, 2026-09-28): la MISMA tabla color × talla del paso 3,
// ahora con una caja por celda. Misma forma a propósito: quien acaba de armar la tabla reconoce cada celda sin volver
// a leerla. Un segmento arriba decide qué se escribe en ella (las mismas tres que Editar producto, `MatrizStockFicha`):
//
//   * «Cuántas tienes hoy» (la carga inicial, ADR-0212): vacío = 0; solo dígitos, hasta 4 (una cantidad imposible ni se
//     tipea); total por color, por talla y general (la fila «Total» queda fija abajo). «Llenar todas con [n]» pone la
//     misma cantidad en todas las celdas de un golpe (72 en el peor caso real) y después se corrige a mano lo distinto;
//   * «Precios»: una caja de precio por celda; vacía = el precio de venta (su placeholder); la que difiere se ve en ámbar.
//     Antes esto vivía en la tabla de variantes, con un botón «Poner un precio distinto»;
//   * «Costos» (Felipe 2026-10-10: «no me deja poner costos distintos»): lo mismo con el costo; vacía = el costo de arriba,
//     o sin costo si arriba no hay. Una bolsa mediana y una pequeña no cuestan lo mismo, y el margen de cada talla lo usa.
//     Hasta ese día la opción de precio se llamaba «¿Alguna cuesta distinto?», y «cuesta» se leía como el costo.
// La celda quitada en el paso 3 sale rayada con «—» y sin caja: esa variante no se crea, no tiene stock ni precio.
// Encabezado y columna del color fijos, como en el paso 3; en celular la tabla se desliza de lado dentro de su caja.
//
// ADR-0396 (A2 «La tabla única»): «Nueva orden de producción» pregunta lo mismo —cuántas prendas por talla y color— y usa ESTA tabla con `soloCantidades`: sin el segmento (no hay precios ni
// costos que escribir ahí), sin los botones − y + (la orden se carga tecleando; el 0 no es «tener cero» sino «no fabricar»), con «Llenar todas con» siempre a la vista, y con
// las cinco cosas que cambian de una pantalla a otra como props opcionales cuyo valor de fábrica es lo de siempre: `preguntaCelda` (lo que oye el lector: «Cuántas prendas de
// Negro en M»), `fantasma` (el número gris de cada celda: lo que sugiere la red), `tituloDe` (qué dice cada celda al pasar el mouse), `teclado` (Enter y ↓ bajan por la talla,
// ↑ y Shift+Enter suben, Enter al fondo pasa a la talla siguiente; nada de esto envía el formulario) y `accionFila` (el «×» de quitar un color). Sin ninguna de ellas el HTML es,
// letra por letra, el de Nuevo producto: lo fija `lib/matriz-cantidades.test.ts`.

type Modo = "cantidades" | "precios" | "costos";

/** Las props del número de una celda de cantidades (con − y + en Nuevo producto, sola en la orden de producción). */
type CampoNumero = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

type Comunes = {
  celdas: CeldaAlta[];
  /** Las tallas elegidas, ya ordenadas. Vacío = el producto no tiene talla (una sola columna). */
  tallas: { id: string; texto: string }[];
  colores: { codigo: string; nombre: string; hex: string | null; familiaColor?: string | null; tipo?: string | null }[];
  excluidas: Set<string>;
  cantidades: Record<string, string>;
  onCantidad: (clave: string, valor: string) => void;
  /** Lo que oye el lector en cada celda: `${preguntaCelda} ${color} en ${talla}`. De fábrica, «Cuántas tienes de» (Nuevo producto). */
  preguntaCelda?: string;
  /** El número gris de una celda vacía. De fábrica, «0». En «Nueva orden» es lo que sugiere la red para esa celda. */
  fantasma?: (clave: string) => string;
  /** Lo que dice una celda al pasar el mouse (su código, por qué se sugiere tanto). De fábrica, nada. */
  tituloDe?: (clave: string) => string | undefined;
  /** Enter y ↓ bajan a la celda de abajo, ↑ y Shift+Enter suben; al fondo, Enter pasa a la talla siguiente. Enter nunca envía el formulario desde una celda. De fábrica, apagado. */
  teclado?: boolean;
  /** Algo junto al nombre de un color (el «×» que lo quita). Solo en las filas con color. De fábrica, nada. */
  accionFila?: (color: { codigo: string; nombre: string }) => ReactNode;
};

/** Nuevo producto (paso 4): cantidades, precios y costos por celda. */
type ConPrecios = Comunes & {
  soloCantidades?: false;
  precioBase: string;
  precios: Record<string, string>;
  onPrecio: (clave: string, valor: string) => void;
  /** El costo de todas (arriba, opcional): vacío = las celdas sin costo propio se crean sin costo. */
  costoBase: string;
  costos: Record<string, string>;
  onCosto: (clave: string, valor: string) => void;
  /** Dónde entra el stock, en palabras de tienda: «TRU · Real Plaza». */
  destinoEtiqueta: string;
  /** La carga inicial de la sede ya se cerró (ADR-0328 act. 2026-10-28): lo que se escribe no es «lo que tienes hoy» sino lo que
   *  LLEGÓ del proveedor, y la tabla lo dice así («Cuántas llegaron»). De fábrica, `false`: la carga inicial, como siempre. */
  llegada?: boolean;
};

/** «Nueva orden de producción» (ADR-0396, A2): solo cantidades, sin segmento ni precios ni costos, sin − y +, con «Llenar todas con» siempre a la vista. */
type SoloCantidades = Comunes & { soloCantidades: true };

export function MatrizCantidades(props: ConPrecios | SoloCantidades) {
  const { celdas, tallas, colores, excluidas, cantidades, onCantidad, preguntaCelda: preguntaPropia, fantasma, tituloDe, teclado = false, accionFila } = props;
  const solo = props.soloCantidades === true;
  const precioBase = props.soloCantidades ? "" : props.precioBase;
  const precios = props.soloCantidades ? {} : props.precios;
  const onPrecio = props.soloCantidades ? undefined : props.onPrecio;
  const costoBase = props.soloCantidades ? "" : props.costoBase;
  const costos = props.soloCantidades ? {} : props.costos;
  const onCosto = props.soloCantidades ? undefined : props.onCosto;
  const destinoEtiqueta = props.soloCantidades ? "" : props.destinoEtiqueta;
  const llegada = props.soloCantidades ? false : (props.llegada ?? false);
  const preguntaCelda = preguntaPropia ?? (llegada ? "Cuántas llegaron de" : "Cuántas tienes de");

  const [modo, setModo] = useState<Modo>("cantidades");
  const [relleno, setRelleno] = useState("");
  // Las cajas de las celdas, para que el teclado sepa a cuál llevar el cursor. Solo se llena con `teclado` (un ref no se dibuja: el HTML no cambia).
  const campos = useRef(new Map<string, HTMLInputElement>());

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
  const baseCosto = Number(costoBase) > 0 ? Number(costoBase).toFixed(2) : "0.00";
  const enCostos = modo === "costos";
  const porTalla = teclado ? columnasEditables(filas, columnas, celdas, excluidas) : [];

  // Se aplica (o se borra) sola, en cada tecla: ya no hay un «Aplicar» que presionar ni que mis-clickear.
  function escribirRelleno(valor: string) {
    const limpio = limpiarCantidad(valor);
    setRelleno(limpio);
    // Vaciar la caja deja vacías las celdas en Nuevo producto (el reverso de llenarlas); en la orden no toca nada: una tecla de más no debe borrar lo escrito (`cambiosDeRelleno`).
    for (const { clave, valor: v } of cambiosDeRelleno(celdas, excluidas, limpio, !solo)) onCantidad(clave, v);
  }

  // El cursor se mueve con Enter y las flechas (ver `movimientoDeTecla`). Enter NUNCA envía el formulario desde una celda, aunque no haya a dónde ir (la última): quien sigue
  // escribiendo en los costos de abajo lo hace con Tab. Una flecha en el borde no hace nada y deja al campo con su propio comportamiento.
  function alTeclear(e: KeyboardEvent<HTMLInputElement>, clave: string) {
    if (e.nativeEvent.isComposing) return;
    const mov = movimientoDeTecla(e);
    if (!mov) return;
    const vecina = celdaVecina(porTalla, clave, mov);
    if (vecina === null && e.key !== "Enter") return;
    e.preventDefault();
    if (vecina !== null) campos.current.get(vecina)?.focus();
  }

  return (
    <div className="space-y-2" data-matriz-mover={teclado ? "" : undefined}>
      <div className={solo ? "flex justify-end" : "flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5"}>
        {/* La misma tabla con otro dato a la vista: el segmento de modo del sistema (ADR-0358). Angosto, ocupa todo el ancho; en el
            celular cada opción parte su texto en dos líneas (2026-10-09: «¿Alguna cuesta distinto?» de una línea ensanchaba la
            página 23 px a 375 px y la pantalla entera se corría de lado). Desde el 2026-10-10 también en escritorio: con el menú
            abierto a 1024 px la columna del alta mide ~250 px, y las tres opciones en una línea se salían de su caja. Con espacio
            siguen en una línea (`flex-auto`); sin él, se encogen y parten su texto. En la orden de producción (`soloCantidades`) no hay segmento: solo se cuentan prendas. */}
        {!solo && (
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Qué escribes en la tabla"
            valor={modo}
            onCambio={(m) => setModo(m as typeof modo)}
            opciones={[
              { clave: "cantidades", etiqueta: llegada ? "Cuántas llegaron" : "Cuántas tienes hoy" },
              { clave: "precios", etiqueta: "Precios" },
              { clave: "costos", etiqueta: "Costos" },
            ]}
            className="w-full sm:w-auto [&>button]:min-w-0 [&>button]:flex-1 [&>button]:justify-center [&>button]:text-center [&>button]:leading-tight [&>button]:whitespace-normal max-sm:[&>button]:px-2 sm:[&>button]:flex-auto"
          />
        )}
        {/* «Llenar todas» ocupa su lugar también en «Precios» y «Costos» (invisible): cambiar de segmento no mueve la tabla (ADR-0185). */}
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
            data-sin-cursor={solo ? "" : undefined}
            onChange={(e) => escribirRelleno(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              // Ya se aplica sola en cada tecla: Enter solo evita que envíe el formulario del alta.
              if (e.key === "Enter") e.preventDefault();
            }}
            className="h-10 w-[72px] rounded-[9px] border border-borde-control bg-hueso px-1.5 text-center text-base font-semibold tabular-nums text-tinta outline-none placeholder:text-tinta/30 focus:border-taupe"
          />
        </div>
      </div>

      {/* Las tres bajadas apiladas en la misma celda de grid: la más larga fija el alto, y cambiar de segmento no lo mueve. En la orden no hay bajadas: la tabla se explica sola. */}
      {!solo && (
        <div className="grid text-[12.5px] text-taupe">
          <p className={`col-start-1 row-start-1 ${enCantidades ? "" : "invisible"}`} aria-hidden={!enCantidades}>
            {llegada ? `Lo que llegó a ${destinoEtiqueta}.` : `Lo que hay hoy en ${destinoEtiqueta}.`} Lo que no tengas, déjalo vacío.{" "}
            <span className="text-tinta/45">—</span> = no existe.
          </p>
          <p className={`col-start-1 row-start-1 ${modo === "precios" ? "" : "invisible"}`} aria-hidden={modo !== "precios"}>
            Escribe solo el precio que cambia. Vacía = {textoPrecioBase(precioBase)}.
          </p>
          <p className={`col-start-1 row-start-1 ${enCostos ? "" : "invisible"}`} aria-hidden={!enCostos}>
            Escribe solo el costo que cambia. Vacía = {textoCostoBase(costoBase)}.
          </p>
        </div>
      )}

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
                <th scope="col" className="sticky top-0 z-[2] whitespace-nowrap border-l border-sand bg-hueso px-2 py-2 text-center text-xs font-semibold text-taupe sm:px-3">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((color, i) => {
              const c = colores.find((x) => x.codigo === color);
              const nombre = c?.nombre ?? "Sin color";
              const totalFila = totales.porFila[claveEje(color)] ?? 0;
              // Franja de color (decisión con Felipe, 2026-10-02 — maqueta B de docs/maquetas/matriz-color-identificacion-2026-10/):
              // la zebra sola no bastaba para no perder la fila de vista al mirar de lejos — se suma el propio color de
              // la fila como franja pegada al nombre. El anillo interior (no el color) es lo que la hace legible incluso
              // en blanco, hueso o crema: sin él, esos colores desaparecen contra el papel.
              const conZebra = i % 2 === 1;
              const franja = c ? (fondoDeMuestra(c.hex, c.familiaColor, c.tipo) ?? "var(--color-sand)") : "var(--color-sand)";
              const fondoFila = conZebra ? "bg-hueso/40" : "bg-papel";
              // En la orden la columna del color queda pegada mientras la tabla se desliza de lado: su fondo tiene que ser opaco (el 40 % de hueso deja ver las celdas que pasan por detrás).
              const fondoNombre = conZebra ? (solo ? "bg-[color-mix(in_srgb,var(--color-hueso)_40%,var(--color-papel))]" : "bg-hueso/40") : "bg-papel";
              return (
                <tr key={color ?? "sin-color"}>
                  <th
                    scope="row"
                    // Con un «×» dentro, el lector de pantalla leería «Negro Quitar Negro» como nombre de la fila: el nombre es solo el color.
                    aria-label={solo && accionFila && c ? c.nombre : undefined}
                    className={`sticky left-0 z-[1] relative whitespace-nowrap border-r border-t border-sand py-1.5 pl-3.5 pr-2 text-left text-[12.5px] font-semibold text-tinta sm:py-2 sm:pl-4 sm:pr-2.5 sm:text-[13.5px] ${fondoNombre}`}
                  >
                    <span
                      aria-hidden
                      data-color-dato={solo ? "" : undefined}
                      className="absolute inset-y-0 left-0 w-[5px] shadow-[inset_-1px_0_0_0_color-mix(in_srgb,var(--color-tinta)_18%,transparent)]"
                      style={{ background: franja }}
                    />
                    <span className="flex items-center gap-1.5">
                      {c && <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />}
                      {nombre}
                      {accionFila && c && accionFila({ codigo: c.codigo, nombre: c.nombre })}
                    </span>
                  </th>
                  {columnas.map((talla) => {
                    const cel = celda(color, talla);
                    if (!cel) return <td key={talla ?? "x"} className={`border-t border-sand ${fondoFila}`} />;
                    if (excluidas.has(cel.clave)) {
                      return (
                        <td key={cel.clave} className={`border-t border-sand p-0 ${fondoFila}`}>
                          <span
                            title={solo ? "Este modelo no tiene esta combinación" : "Esta combinación no existe (la quitaste en el paso 3)"}
                            className={`flex h-12 min-w-11 items-center justify-center sm:h-[52px] sm:min-w-[54px] ${RAYADO_FUERA}`}
                          >
                            —
                          </span>
                        </td>
                      );
                    }
                    const etiqueta = nombreCelda(c?.nombre, textoTalla(talla));
                    const propio = (enCostos ? costos[cel.clave] : precios[cel.clave]) ?? "";
                    const distinto = enCostos ? costoDistinto(propio, costoBase) : precioDistinto(propio, precioBase);
                    const valorCelda = cantidades[cel.clave] ?? "";
                    // El número de la celda: el mismo con − y + (Nuevo producto) que sin ellos (la orden de producción, que se carga tecleando).
                    const numero: CampoNumero = {
                      ref: teclado
                        ? (el) => {
                            if (el) campos.current.set(cel.clave, el);
                            else campos.current.delete(cel.clave);
                          }
                        : undefined,
                      type: "text",
                      inputMode: "numeric",
                      pattern: "[0-9]*",
                      maxLength: 4,
                      autoComplete: "off",
                      "aria-label": `${preguntaCelda} ${etiqueta}`,
                      title: tituloDe?.(cel.clave),
                      placeholder: fantasma ? fantasma(cel.clave) : "0",
                      value: valorCelda,
                      onChange: (e) => onCantidad(cel.clave, limpiarCantidad(e.target.value)),
                      onFocus: (e) => e.currentTarget.select(),
                      onKeyDown: teclado ? (e) => alTeclear(e, cel.clave) : undefined,
                    };
                    return (
                      <td key={cel.clave} className={`border-t border-sand p-0 ${fondoFila}`}>
                        <span
                          className={`flex h-12 items-center justify-center px-0.5 sm:h-[52px] ${
                            enCantidades ? (solo ? "min-w-[64px] sm:min-w-[72px]" : "min-w-[88px] sm:min-w-[98px]") : "min-w-11 sm:min-w-[54px]"
                          }`}
                        >
                          {enCantidades && !solo ? (
                            <PasoCantidad
                              tamano="celda"
                              sinTab
                              menos={{ onClick: () => onCantidad(cel.clave, pasoCantidad(valorCelda, -1)), deshabilitado: valorCelda === "", etiqueta: `Restar a ${etiqueta}` }}
                              mas={{ onClick: () => onCantidad(cel.clave, pasoCantidad(valorCelda, 1)), etiqueta: `Sumar a ${etiqueta}` }}
                              // El «0» de una celda vacía es un fantasma a propósito (25 %): la tabla se lee por lo que SÍ se cargó.
                              campo={{ ...numero, className: "placeholder:text-tinta/25" }}
                            />
                          ) : enCantidades ? (
                            // La orden de producción no lleva − ni +: es una caja para escribir, no un paso de cantidad.
                            <span className="inline-flex items-center gap-0.5 rounded-[7px] border border-borde-control bg-hueso pl-0.5 pr-0.5 focus-within:border-taupe focus-within:bg-papel">
                              <input
                                {...numero}
                                // El número gris DICE algo (lo que sugiere la red): más legible que el «0» de siempre (3,6:1 en claro y 4,7:1 en oscuro, antes 1,7 y 2,1).
                                // Con scroll interno, el encabezado, el «Total» y la columna del color van pegados: la celda enfocada no debe quedar debajo de ellos.
                                className="w-12 border-0 bg-transparent py-1.5 text-center text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/55 sm:w-14 scroll-mt-14 scroll-mb-12 scroll-ml-32"
                              />
                            </span>
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              aria-label={`${enCostos ? "Costo" : "Precio"} de ${etiqueta}`}
                              aria-invalid={!enCostos && precioPropioInvalido(propio) ? true : undefined}
                              placeholder={enCostos ? baseCosto : base}
                              value={propio}
                              onChange={(e) => (enCostos ? onCosto : onPrecio)?.(cel.clave, limpiarPrecio(e.target.value))}
                              onFocus={(e) => e.currentTarget.select()}
                              className={`w-[58px] rounded-[7px] border border-borde-control bg-hueso px-0.5 py-1.5 text-center text-[13px] tabular-nums outline-none placeholder:text-tinta/30 focus:border-taupe focus:bg-papel sm:w-[66px] ${
                                distinto ? "font-semibold text-ambar" : "text-tinta"
                              }`}
                            />
                          )}
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
                  <td key={talla ?? "sin-talla"} className="sticky bottom-0 z-[1] border-t border-sand bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta">
                    {totales.porColumna[claveEje(talla)] || ""}
                  </td>
                ))}
                {conColumnaTotal && (
                  <td className="sticky bottom-0 z-[1] border-l border-t border-sand bg-hueso px-2 py-2 text-center font-semibold tabular-nums text-tinta sm:px-3">{totales.total}</td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
