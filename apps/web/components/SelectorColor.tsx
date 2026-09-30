"use client";

import { useState } from "react";
import { CampoTexto } from "@/components/ui/campos";
import { parsearColor, rgbDeHex } from "@/lib/color-entrada";

// Elegir el tono de un color: el mismo control en Catálogo ▸ Atributos (ColoresLista) y en «+ Nuevo color» de Nuevo
// producto (NuevoColorAlta). Vivía dentro de ColoresLista; salió a este archivo el 2026-09-28 porque el alta solo tenía
// el selector del navegador y Felipe pidió «el recuadro de hex o RGB, así como en registrar nuevo color en su módulo».
//
// El color se elige de tres maneras que dan lo mismo: el selector del
// navegador, el código HTML (`#c9b79c`) o el RGB (`201, 183, 156`) — este
// último lo que da una ficha de proveedor o un programa de diseño. En la base
// solo se guarda el hex. Mientras se escribe, un texto a medias no pisa el
// color vigente; al salir del campo, si no era válido, vuelve al último bueno.
// La muestra es UN rectángulo relleno con el color. El <input type="color">
// nativo va escondido detrás y se abre al tocar la muestra: pintado tal cual
// dejaba un recuadro con otro más chico adentro, y un Crudo o un Blanco casi
// no se distinguían del fondo crema.
export function MuestraEditable({ hex, onHex, className = "" }: { hex: string | null; onHex?: (hex: string) => void; className?: string }) {
  // Sin elegir: caja punteada, no un color de relleno. Un beige por defecto se
  // guardaba sin que nadie lo notara (5 colores en producción llevan #c9b79c).
  const caja = `relative block h-9 w-14 shrink-0 rounded-md shadow-inner ${
    hex ? "border border-tinta/35" : "border border-dashed border-tinta/40"
  } ${className}`;
  if (!onHex) return <span className={caja} style={hex ? { backgroundColor: hex } : undefined} aria-hidden />;
  return (
    <label className={`${caja} cursor-pointer focus-within:ring-2 focus-within:ring-rojo/40`} style={hex ? { backgroundColor: hex } : undefined}>
      <input type="color" aria-label="Elegir color con el selector" value={hex ?? "#c9b79c"} onChange={(e) => onHex(e.target.value)} className="sr-only" />
    </label>
  );
}

export function SelectorColor({
  hex,
  onHex,
  etiqueta = "Color",
  caja = false,
  deshabilitado = false,
}: {
  hex: string | null;
  onHex: (hex: string) => void;
  /** El título del campo de texto. */
  etiqueta?: string;
  /** Campo con caja hueso (Nuevo producto), en vez de sobre el hilo (Atributos). */
  caja?: boolean;
  deshabilitado?: boolean;
}) {
  const [texto, setTexto] = useState(hex ?? "");
  const [ultimoHex, setUltimoHex] = useState(hex);
  // El selector nativo también mueve el color: el campo de texto lo sigue.
  if (hex !== ultimoHex) {
    setUltimoHex(hex);
    setTexto(hex ?? "");
  }
  const invalido = texto.trim() !== "" && parsearColor(texto) === null;

  const fila = (
    <div className="flex items-start gap-3">
      <MuestraEditable hex={hex} onHex={deshabilitado ? undefined : onHex} className={caja ? "h-10 w-12" : "mt-6"} />
      <div className="min-w-0 flex-1">
        <CampoTexto
          etiqueta={etiqueta}
          mono
          caja={caja}
          disabled={deshabilitado}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            const valido = parsearColor(e.target.value);
            if (valido) {
              setUltimoHex(valido);
              onHex(valido);
            }
          }}
          onBlur={() => setTexto(hex ?? "")}
          tono={invalido ? "error" : undefined}
          pie={
            invalido
              ? "No se entiende. Prueba #c9b79c o 201, 183, 156."
              : hex
                ? `RGB ${rgbDeHex(hex)} · acepta #hex o R, G, B`
                : "Toca el cuadro o escribe #hex o R, G, B"
          }
          placeholder="#c9b79c" // sugerir-fijo: ejemplo del FORMATO #hex, no de un color; sirve igual con cualquier familia
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
  // Con caja, el campo esconde su etiqueta (`CampoTexto caja`): se pone arriba, sobre la muestra y la caja, con el mismo
  // estilo que los demás títulos del formulario, para que quede alineado con «Familia» y «Código».
  if (!caja) return fila;
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-tinta">{etiqueta}</span>
      {fila}
    </div>
  );
}
