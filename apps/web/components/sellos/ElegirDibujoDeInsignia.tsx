"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ImagePlus } from "lucide-react";
import { DIBUJOS_ELEGIBLES, NOMBRE_DEL_DIBUJO } from "@cayla-retail/shared/insignias-visual";
import { urlDeImagenDeInsignia } from "@cayla-retail/shared/insignia-imagen";
import { Aviso } from "@/components/ui/Aviso";
import { Casilla } from "@/components/ui/Casilla";
import { DibujoInsignia } from "@/components/sellos/DibujoInsignia";
import { ImagenDeInsignia } from "@/components/sellos/ImagenDeInsignia";
import type { EleccionDeDibujo } from "@/lib/eleccion-de-dibujo";
import { prepararImagenDeInsignia } from "@/lib/imagen-de-insignia";
import { ACEPTA_IMAGEN_DE_INSIGNIA } from "@/lib/imagen-de-insignia-reglas";
import { textoDeModoDeSilueta } from "@/lib/silueta-de-imagen";

/* ====================================================================
   El dibujo de una insignia (ADR-0490, Felipe 2026-10-23): se elige al crearla o después, en Catálogo ▸ Insignias. Hay dos caminos: uno de los 21
   dibujos de la lista o una imagen propia que se sube. No hay «ninguno»: cuando la persona todavía no tocó nada, el selector ya trae marcado el
   dibujo que sugiere el nombre (escribes «Halloween» y se marca la calabaza), y se queda con el que elija a mano.

   Es un grupo de opciones de radio (una a la vez, flechas para moverse, Espacio o Enter para elegir): los dibujos y, si hay una imagen propia, su
   baldosa al final. «Subir tu imagen» abre el selector de archivos; la imagen se reduce en el navegador (256 × 256, WebP) y se sube al guardar.
   Cada dibujo pinta con los colores del tema; una imagen propia, a todo color, no (es lo que la persona subió). Para un logo de UN solo color, la
   casilla «Pintar con el color del sello» la convierte en silueta (ADR-0490 act. b): se usa solo por su forma y toma el color del lugar, así se ve
   bien también en modo oscuro; la vista previa se actualiza al marcarla y se puede desmarcar.
   ==================================================================== */

const mismaOpcion = (a: EleccionDeDibujo, b: EleccionDeDibujo): boolean => {
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === "dibujo") return a.clave === (b as typeof a).clave;
  if (a.tipo === "guardada") return a.ruta === (b as typeof a).ruta;
  return a.vista === (b as typeof a).vista;
};

export function ElegirDibujoDeInsignia({
  valor,
  yaElegido,
  onValor,
  idEtiqueta,
  deshabilitado = false,
}: {
  /** Lo que se ve seleccionado: lo que eligió o, si todavía no eligió, el dibujo que sugiere el nombre (`eleccionEfectiva`). */
  valor: EleccionDeDibujo;
  /** ¿La persona ya eligió a mano? Con `false`, el texto de abajo dice que es una sugerencia del nombre. */
  yaElegido: boolean;
  onValor: (v: EleccionDeDibujo) => void;
  /** El id de la etiqueta visible del campo (`aria-labelledby`). */
  idEtiqueta?: string;
  deshabilitado?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const archivo = useRef<HTMLInputElement>(null);
  // La imagen propia se recuerda aunque se pruebe un dibujo: volver a ella es un toque, sin volver a subirla.
  const [imagen, setImagen] = useState<Extract<EleccionDeDibujo, { tipo: "imagen" | "guardada" }> | null>(valor.tipo === "dibujo" ? null : valor);
  // La silueta se decide al subir (el archivo que sale ya es el molde) y se puede cambiar mientras la imagen no se haya guardado: se vuelve a convertir
  // desde lo que eligió la persona.
  const [silueta, setSilueta] = useState(valor.tipo === "guardada" && valor.silueta);
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // La vista previa local (`blob:`) se libera cuando se cambia la imagen o se cierra la hoja.
  const vistaActual = imagen?.tipo === "imagen" ? imagen.vista : null;
  useEffect(() => () => { if (vistaActual) URL.revokeObjectURL(vistaActual); }, [vistaActual]);

  const opciones: EleccionDeDibujo[] = [...DIBUJOS_ELEGIBLES.map((clave) => ({ tipo: "dibujo", clave }) as const), ...(imagen ? [imagen] : [])];
  const indiceActual = Math.max(0, opciones.findIndex((o) => mismaOpcion(o, valor)));
  const urlDeLaImagen = imagen ? (imagen.tipo === "imagen" ? imagen.vista : urlDeImagenDeInsignia(process.env.NEXT_PUBLIC_SUPABASE_URL, imagen.ruta)) : null;

  // Flechas, Inicio y Fin: mueven la elección (y el foco) como en cualquier grupo de opciones de radio.
  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const destino = e.key === "Home" ? 0 : e.key === "End" ? opciones.length - 1 : paso ? (indiceActual + paso + opciones.length) % opciones.length : -1;
    if (destino < 0) return;
    e.preventDefault();
    onValor(opciones[destino]);
    refs.current[destino]?.focus();
  }

  // Prepara la imagen elegida (a color o como silueta) y la deja como la opción marcada. La usan elegir un archivo y marcar o desmarcar la casilla.
  async function procesar(original: File, comoSilueta: boolean) {
    setError(null);
    setPreparando(true);
    try {
      const listo = await prepararImagenDeInsignia(original, { silueta: comoSilueta });
      if ("error" in listo) {
        setError(listo.error);
        return;
      }
      const nueva = { tipo: "imagen", archivo: listo.archivo, vista: URL.createObjectURL(listo.archivo), silueta: comoSilueta, modo: listo.modo, original } as const;
      setImagen(nueva);
      setSilueta(comoSilueta);
      setAviso(listo.aviso);
      onValor(nueva);
    } finally {
      setPreparando(false);
    }
  }

  async function alElegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    e.target.value = ""; // el mismo archivo se puede volver a elegir
    if (!elegido) return;
    setAviso(null);
    await procesar(elegido, silueta);
  }

  async function alCambiarSilueta() {
    if (imagen?.tipo === "imagen") await procesar(imagen.original, !imagen.silueta);
  }

  const clase = (marcado: boolean) =>
    `relative flex items-center justify-center rounded-lg border bg-papel text-tinta transition-colors duration-200 ease-cayla disabled:opacity-50 ${
      marcado ? "border-tinta ring-1 ring-tinta" : "border-sand hover:border-taupe"
    }`;
  const texto =
    valor.tipo === "dibujo"
      ? yaElegido
        ? `Ícono: ${NOMBRE_DEL_DIBUJO[valor.clave]}.`
        : `Sugerido por el nombre: ${NOMBRE_DEL_DIBUJO[valor.clave]}. Elige otro si quieres.`
      : valor.tipo === "imagen"
        ? valor.silueta && valor.modo
          ? textoDeModoDeSilueta(valor.modo)
          : "Tu imagen propia."
        : valor.silueta
          ? "Tu imagen, pintada del color del sello."
          : "Tu imagen propia.";

  return (
    <div className="space-y-2" data-campo="dibujo">
      <div role="radiogroup" aria-labelledby={idEtiqueta} onKeyDown={alTeclear} className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" }}>
        {opciones.map((o, i) => (
          <button
            key={o.tipo === "dibujo" ? o.clave : "imagen-propia"}
            type="button"
            role="radio"
            aria-checked={mismaOpcion(o, valor)}
            aria-label={o.tipo === "dibujo" ? NOMBRE_DEL_DIBUJO[o.clave] : "Tu imagen"}
            title={o.tipo === "dibujo" ? NOMBRE_DEL_DIBUJO[o.clave] : "Tu imagen"}
            tabIndex={indiceActual === i ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
            }}
            disabled={deshabilitado}
            onClick={() => onValor(o)}
            className={`${clase(mismaOpcion(o, valor))} aspect-square min-h-11`}
          >
            {o.tipo === "dibujo" ? (
              <DibujoInsignia clave={o.clave} className="h-6 w-6" />
            ) : urlDeLaImagen ? (
              <ImagenDeInsignia url={urlDeLaImagen} silueta={o.silueta} className="h-7 w-7" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <input ref={archivo} type="file" accept={ACEPTA_IMAGEN_DE_INSIGNIA} className="sr-only" tabIndex={-1} aria-hidden onChange={alElegirArchivo} />
        <button
          type="button"
          disabled={deshabilitado || preparando}
          onClick={() => archivo.current?.click()}
          className="btn-cayla btn-sutil btn-chico"
        >
          <ImagePlus aria-hidden className="h-4 w-4" />
          {preparando ? "Preparando…" : imagen ? "Cambiar tu imagen" : "Subir tu imagen"}
        </button>
        <p className="text-xs text-taupe" aria-live="polite">
          {texto}
        </p>
      </div>
      {valor.tipo === "imagen" && imagen?.tipo === "imagen" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm text-tinta">
          <Casilla marcada={imagen.silueta} onCambio={alCambiarSilueta} etiqueta="Pintar con el color del sello" disabled={deshabilitado || preparando} className="mt-0.5" />
          <span>
            Pintar con el color del sello
            <span className="block text-xs text-taupe">Para un logo de un solo color: se verá bien también en modo oscuro. Pierde sus colores.</span>
          </span>
        </label>
      )}
      {!imagen && !error && <p className="text-xs text-taupe">¿No está el que buscas? Sube tu imagen: mejor un PNG con fondo transparente, que se reduce a 256 × 256.</p>}
      {aviso && <p className="text-xs text-taupe">{aviso}</p>}
      {error && (
        <Aviso tono="error" chico>
          {error}
        </Aviso>
      )}
    </div>
  );
}
