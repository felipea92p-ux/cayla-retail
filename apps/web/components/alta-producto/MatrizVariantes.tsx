"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { BotonFoto, useFotosPendientes, type FotoPendiente } from "@/components/alta-producto/FotosAlta";
import type { CeldaAlta } from "@/lib/alta-producto";
import { leyendaVariantes, textoFotosDeFila } from "@/lib/tabla-alta-reglas";

// La tabla de la prenda (paso 3 de Nuevo producto, spike v2 2026-09-28): una fila por color, una columna por talla, y
// en la primera columna la foto de ese color. Antes eran dos piezas —una grilla de casillas de fotos (`FotosAlta`) y
// esta tabla— y cada color aparecía dos veces en el mismo paso.
//
//   * cada celda es una variante: ✓ se crea; tocarla la quita (queda rayada con «—») y tocarla otra vez la devuelve;
//   * UNA sola forma de quitar cada cosa (revisión de claridad del spike): la talla se quita arriba, en Tallas; el
//     color, con su ×; aquí solo se toca la combinación que no existe. Por eso ni el encabezado ni la fila quitan nada;
//   * la foto va en la fila de su color; la de «Todos los colores» (`colorCodigo: null`) va en su propia línea bajo la
//     tabla, porque no es de ninguna fila: se ve en cada color que no tenga la suya (`fotoDeVariante`). Sin colores, la
//     fila «Sin color» ES esa foto;
//   * encabezado de tallas fijo arriba y columna del color fija a la izquierda: con 9 tallas × 8 colores (el peor caso
//     real) la tabla se desplaza dentro de su caja y la página nunca se desborda a lo ancho (375 px incluidos).
// El precio distinto por celda ya no vive aquí: pasó al segmento «¿Alguna cuesta distinto?» de `MatrizCantidades`.

type Color = { codigo: string; nombre: string; hex: string | null; familiaColor?: string | null; tipo?: string | null };

/** El rayado de «no existe»: el mismo en los pasos 3 y 4. */
export const RAYADO_FUERA = "bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--color-tinta)_5%,transparent)_6px_7px)] text-tinta/25";

export function MatrizVariantes({
  celdas,
  tallas,
  colores,
  excluidas,
  onExcluidas,
  fotos,
  onFotos,
  disabled = false,
}: {
  celdas: CeldaAlta[];
  /** Las tallas elegidas, ya ordenadas. Vacío = el producto no tiene talla (una sola columna). */
  tallas: { id: string; texto: string }[];
  colores: Color[];
  excluidas: Set<string>;
  onExcluidas: (s: Set<string>) => void;
  fotos: FotoPendiente[];
  onFotos: (f: FotoPendiente[]) => void;
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

  const { agregar, quitar, revision } = useFotosPendientes({ fotos, onFotos });
  // De qué color se están mirando las fotos (para quitar alguna). `undefined` = ninguna hoja abierta; `null` = las de
  // «Todos los colores» (o de la prenda, si no tiene colores).
  const [viendo, setViendo] = useState<string | null | undefined>(undefined);
  const generales = fotos.filter((f) => f.colorCodigo === null);
  const nombreDe = (codigo: string | null) =>
    codigo === null ? (colores.length ? "todos los colores" : "la prenda") : (colores.find((c) => c.codigo === codigo)?.nombre ?? codigo);

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
                {colores.length ? "Color y fotos" : "Fotos"}
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
              const suyas = fotos.filter((f) => f.colorCodigo === color);
              const nombre = c?.nombre ?? "Sin color";
              return (
                <tr key={color ?? "sin-color"}>
                  <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap border-r border-t border-sand bg-papel py-1.5 pl-2 pr-2 text-left font-medium text-tinta sm:py-2 sm:pl-3 sm:pr-2.5">
                    <div className="flex items-center gap-1.5 sm:gap-2.5">
                      <FotosDeFila suyas={suyas} nombre={nombreDe(color)} disabled={disabled} onArchivos={(a) => agregar(a, color)} />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold sm:text-[13.5px]">
                          {c && <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />}
                          {nombre}
                        </span>
                        {suyas.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setViendo(color)}
                            aria-label={`Ver o quitar las fotos de ${nombreDe(color)}`}
                            className="w-fit text-left text-[11px] font-normal text-taupe underline decoration-tinta/20 underline-offset-2 hover:text-tinta"
                          >
                            {textoFotosDeFila(suyas.length, false)}
                          </button>
                        ) : (
                          <small className="text-[11px] font-normal text-taupe">{textoFotosDeFila(0, color !== null && generales.length > 0)}</small>
                        )}
                      </div>
                    </div>
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

      {/* La foto de «Todos los colores»: no es de ninguna fila, así que va en su propia línea, justo bajo la tabla. Sin
          colores no hace falta: la fila «Sin color» ya es esa foto. */}
      {colores.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-tinta">
          <span className="font-medium">Una foto para todos los colores:</span>
          <FotosDeFila suyas={generales} nombre="todos los colores" disabled={disabled} onArchivos={(a) => agregar(a, null)} />
          {generales.length > 0 && (
            <button type="button" onClick={() => setViendo(null)} aria-label="Ver o quitar las fotos de todos los colores" className="btn-cayla btn-enlace text-xs">
              {textoFotosDeFila(generales.length, false)}
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-taupe">
        {colores.length > 0
          ? "La foto va en la fila de su color. Una sola alcanza: la de todos los colores se muestra en los colores que no tengan la suya. Se sube al crear el producto."
          : "La foto va en la fila de la prenda. Se sube al crear el producto."}
      </p>

      {viendo !== undefined && (
        <Modal
          titulo={`Fotos de ${nombreDe(viendo)}`}
          subtitulo="Se suben al crear el producto. Para agregar otra, toca la foto en la tabla."
          ancho="max-w-md"
          onClose={() => setViendo(undefined)}
        >
          {(cerrar) => {
            const estas = fotos.filter((f) => f.colorCodigo === viendo);
            return (
              <div className="space-y-4">
                {estas.length === 0 ? (
                  <p className="text-sm text-taupe">Ya no quedan fotos de {nombreDe(viendo)}.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    {estas.map((f, i) => (
                      <div key={f.clave} className="space-y-1.5">
                        <div className="aspect-[4/5] overflow-hidden rounded-md border border-sand bg-hueso">
                          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza */}
                          <img src={f.vista} alt={`Foto ${i + 1} de ${nombreDe(viendo)}`} className="h-full w-full object-cover" />
                        </div>
                        <button type="button" onClick={() => quitar(f.clave)} disabled={disabled} className="btn-cayla btn-sutil btn-chico w-full">
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <button type="button" onClick={cerrar} className="btn-cayla btn-primario">
                    Listo
                  </button>
                </div>
              </div>
            );
          }}
        </Modal>
      )}
      {revision}
    </div>
  );
}

/** La foto de una fila: la miniatura (con el número si tiene varias; tocarla agrega otra) o, si no tiene, la cámara. */
function FotosDeFila({ suyas, nombre, disabled, onArchivos }: { suyas: FotoPendiente[]; nombre: string; disabled: boolean; onArchivos: (a: File[]) => void }) {
  if (suyas.length === 0) {
    return (
      <BotonFoto
        onArchivos={onArchivos}
        disabled={disabled}
        etiqueta={`Agregar foto de ${nombre}`}
        className="grid h-[42px] w-[34px] shrink-0 place-items-center rounded-[5px] border border-dashed border-tinta/25 text-taupe transition-colors hover:border-tinta/45 hover:text-tinta disabled:opacity-40"
      >
        <Camera aria-hidden className="h-[17px] w-[17px]" strokeWidth={1.7} />
      </BotonFoto>
    );
  }
  return (
    <BotonFoto
      onArchivos={onArchivos}
      disabled={disabled}
      etiqueta={`${suyas.length} foto${suyas.length === 1 ? "" : "s"} de ${nombre} · toca para agregar otra`}
      className="relative h-[42px] w-[34px] shrink-0 rounded-[5px] border border-sand bg-hueso disabled:opacity-40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza */}
      <img src={suyas[0].vista} alt="" className="h-full w-full rounded-[4px] object-cover" />
      {suyas.length > 1 && (
        <span className="absolute -right-[5px] -top-1.5 rounded-full bg-tinta px-[5px] text-[9.5px] font-bold leading-[15px] tabular-nums text-crema">{suyas.length}</span>
      )}
    </BotonFoto>
  );
}
