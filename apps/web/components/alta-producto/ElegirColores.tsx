"use client";

import { useState } from "react";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import type { ColorAlta } from "@/lib/alta-producto";
import { fondoDeMuestra, textoDeFamilia } from "@/lib/colores-familias";

// Elegir los colores de un producto sin ver los ~65 colores de golpe (spike Nuevo producto, 2026-09-24).
//
// Antes cada familia de colores salía como una fila de chips con nombre: con el catálogo real eran media pantalla
// (captura de Felipe). Ahora, en orden de lo que más se usa:
//   1. los más usados en la categoría, como chips (casi siempre el color está ahí);
//   2. un buscador («petróleo», «coral»): el color aparece tipeando;
//   3. «Ver los N colores»: una paleta de círculos, un renglón por familia. El nombre sale al instante bajo la paleta
//      al pasar el mouse, al llegar con Tab o al tocarlo (el `title` del navegador tardaba ~1 s y en tablet no salía).
// Lo que se elija fuera de los frecuentes queda a la vista en «También elegiste», con su × para quitarlo:
// en la paleta el nombre no se lee, y nadie tiene que buscar dónde marcó un color para desmarcarlo.

export function ElegirColores({
  colores,
  frecuentes,
  grupos,
  elegidos,
  onAlternar,
  categoriaNombre,
}: {
  colores: ColorAlta[];
  frecuentes: ColorAlta[];
  grupos: { familia: string; texto: string; colores: ColorAlta[] }[];
  elegidos: string[];
  onAlternar: (codigo: string) => void;
  categoriaNombre?: string;
}) {
  const [paleta, setPaleta] = useState(false);
  // El buscador vuelve a vacío después de cada elección: se remonta con otra `key`.
  const [vuelta, setVuelta] = useState(0);
  // El color bajo el mouse o con el foco: su nombre se lee al pie de la paleta.
  const [senalado, setSenalado] = useState<ColorAlta | null>(null);
  const codigosFrecuentes = new Set(frecuentes.map((c) => c.codigo));
  const otrosElegidos = elegidos.map((cod) => colores.find((c) => c.codigo === cod)).filter((c): c is ColorAlta => Boolean(c) && !codigosFrecuentes.has(c!.codigo));

  return (
    <div className="space-y-2.5">
      {frecuentes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-taupe">Los más usados{categoriaNombre ? ` en ${categoriaNombre}` : ""}</p>
          <div className="flex flex-wrap gap-1.5">
            {frecuentes.map((c) => (
              <ChipOpcion key={c.codigo} elegido={elegidos.includes(c.codigo)} onClick={() => onAlternar(c.codigo)}>
                <Punto hex={c.hex} familia={c.familiaColor} />
                {c.nombre}
              </ChipOpcion>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ComboBuscable
          key={vuelta}
          caja
          className="min-w-[13rem] flex-1"
          etiquetaAccesible="Buscar otro color"
          marcador="Busca otro color: petróleo, coral…"
          valor=""
          limite={8}
          onValor={(cod) => {
            if (!elegidos.includes(cod)) onAlternar(cod);
            setVuelta((v) => v + 1);
          }}
          opciones={colores.map((c) => ({
            valor: c.codigo,
            texto: c.nombre,
            detalle: elegidos.includes(c.codigo) ? "✓ elegido" : undefined,
            icono: <Punto hex={c.hex} familia={c.familiaColor} />,
          }))}
        />
        <button type="button" onClick={() => setPaleta((v) => !v)} aria-expanded={paleta} className="btn-cayla btn-secundario">
          {paleta ? "Ocultar paleta" : `Ver los ${colores.length} colores`}
        </button>
      </div>

      {paleta && (
        // Una carta de color: cada familia es un renglón de 9 columnas FIJAS, de claro a oscuro (`colores.orden`, una
        // decena por familia: 20260926100000). Con las columnas alineadas el tono se lee también de arriba abajo, y una
        // familia con menos de 9 deja su hueco al final en vez de correr los círculos. Ya no se parte en dos columnas de
        // familias: cada renglón mide ~370 px y dos no entran en este bloque. Si el BLOQUE es angosto (`@container`, no
        // la ventana), el nombre de la familia va arriba de sus círculos.
        <div className="@container anim-revelar rounded-xl border border-sand bg-crema px-3 py-2">
          {grupos.map((g) => (
            <div key={g.familia} className="grid gap-1 py-1 @md:grid-cols-[5rem_auto] @md:items-center @md:gap-2.5">
              <p className="text-[11.5px] text-taupe">{g.texto}</p>
              <div className="grid grid-cols-[repeat(9,26px)] gap-1.5">
                {g.colores.map((c) => {
                  const elegido = elegidos.includes(c.codigo);
                  return (
                    <button
                      key={c.codigo}
                      type="button"
                      onClick={() => onAlternar(c.codigo)}
                      aria-pressed={elegido}
                      aria-label={c.nombre}
                      onMouseEnter={() => setSenalado(c)}
                      onMouseLeave={() => setSenalado(null)}
                      onFocus={() => setSenalado(c)}
                      onBlur={() => setSenalado(null)}
                      style={{ background: fondoDeMuestra(c.hex, c.familiaColor) ?? "transparent" }}
                      className={`grid h-[26px] w-[26px] place-items-center rounded-full border border-tinta/25 text-[11px] font-bold transition-transform duration-150 hover:scale-110 ${
                        elegido ? "ring-2 ring-tinta ring-offset-2 ring-offset-crema" : ""
                      } ${esClaro(c.hex) ? "text-tinta" : "text-crema"}`}
                    >
                      {elegido && <span aria-hidden>✓</span>}
                      {!c.hex && !elegido && <span aria-hidden className="text-[9px] text-taupe">?</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Alto fijo: el pie no empuja la paleta al aparecer o cambiar de nombre. `aria-hidden` porque cada círculo ya
              se anuncia con su `aria-label`; leerlo dos veces sería ruido para un lector de pantalla. */}
          <p aria-hidden className="mt-1 flex h-6 items-center gap-1.5 border-t border-sand pt-1 text-[12px]">
            {senalado ? (
              <>
                <Punto hex={senalado.hex} familia={senalado.familiaColor} />
                <span className="text-tinta">{senalado.nombre}</span>
                <span className="text-taupe">
                  · {textoDeFamilia(senalado.familiaColor)}
                  {elegidos.includes(senalado.codigo) ? " · elegido" : ""}
                </span>
              </>
            ) : (
              <span className="text-taupe">Pasa el mouse o toca un color para ver su nombre.</span>
            )}
          </p>
        </div>
      )}

      {otrosElegidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-taupe">También elegiste:</span>
          {otrosElegidos.map((c) => (
            <span key={c.codigo} className="inline-flex items-center gap-1.5 rounded-full border border-tinta bg-tinta/[0.07] py-0.5 pl-2.5 pr-1 text-[12.5px] text-tinta">
              <Punto hex={c.hex} familia={c.familiaColor} />
              {c.nombre}
              <button
                type="button"
                onClick={() => onAlternar(c.codigo)}
                aria-label={`Quitar ${c.nombre}`}
                className="grid h-[18px] w-[18px] place-items-center rounded-full text-xs text-tinta/60 hover:bg-tinta/10 hover:text-tinta"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Punto({ hex, familia }: { hex: string | null; familia?: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/20"
      style={{ background: fondoDeMuestra(hex, familia) ?? "transparent" }}
    />
  );
}

/** Para decidir si el ✓ va en tinta o en crema encima del color. Sin hex, se trata como claro. */
function esClaro(hex: string | null): boolean {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
