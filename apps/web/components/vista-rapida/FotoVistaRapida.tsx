"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { esperarMiniatura, precargarMiniaturas } from "@/components/ui/precargar-miniaturas";
import { ZoomIn } from "lucide-react";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { categoriaDe, type FilaConCategoria } from "@/lib/categoria-de-prenda";
import { SIZES_VISTA_RAPIDA as SIZES_FOTO } from "@/lib/fotos-tamanos";
import { hayPunteroFino } from "./movimiento";

/** Lo que la foto necesita de la prenda: cómo se llama y, sin foto, su categoría para dibujar su ícono. La vista rápida de Productos pasa su `ProductoListado`; la hoja «Ver el modelo» de Producción, lo que ya tiene. */
export type PrendaParaFoto = FilaConCategoria & { referencia: string };
/** El color que se mira: su clave, su nombre, su hex (`null` = el catálogo no lo tiene: se dibuja el ícono de su categoría sin un color inventado) y su foto. */
export type ColorParaFoto = { clave: string; nombre: string; hex: string | null; fotoUrl: string | null };

type Capa = { id: number; clave: string; nombre: string; hex: string | null; fotoUrl: string | null };

/** Lo que dura el cruce de una foto a otra (`vr-foto-entra`, vista-rapida.css): pasado ese tiempo la capa de abajo ya no se ve y se quita. */
const MS_CRUCE = 620;

/**
 * La foto del color que se está mirando (vista rápida de producto, maqueta A). Un color nuevo llega como una capa ENCIMA de la anterior:
 * se funde y se asienta (de 1.06 a 1), y recién cuando termina se quita la de abajo — nunca hay un instante sin foto. Sin foto de ese
 * color, el mosaico de la prenda (ícono de su categoría sobre el color, ADR-0333), con su «Muestra — color» como en la tarjeta.
 * Con mouse, la foto se mueve apenas hacia el lado contrario del puntero (paralaje de ±6 px): es un detalle, no una función.
 *
 * Con foto, tocarla la abre en grande (Felipe 2026-10-12: «que se abra más grande para ver mejor la imagen»), como la miniatura del
 * panel de Existencias: la lupa de la esquina dice que se puede. Se abre la foto que está ARRIBA, la del color que se ve. Sin foto (el
 * mosaico) no hay nada que agrandar y no se ofrece.
 */
export function FotoVistaRapida({
  producto,
  fila,
  onAmpliar,
  botonAmpliar,
  precargar,
}: {
  producto: PrendaParaFoto;
  fila: ColorParaFoto | undefined;
  /** Las fotos de TODOS los colores de la prenda: se bajan apenas abre la hoja, para que pasar de un color a otro no espere a la red. */
  precargar?: readonly (string | null | undefined)[];
  onAmpliar?: (foto: { fotoUrl: string; color: string }) => void;
  /** El botón de la lupa, para devolverle el foco al cerrar la foto en grande. */
  botonAmpliar?: RefObject<HTMLButtonElement | null>;
}) {
  const clave = fila?.clave ?? "";
  const nombre = fila?.nombre ?? "";
  const hex = fila?.hex;
  const fotoUrl = fila?.fotoUrl ?? null;
  const siguiente = useRef(1);
  const [capas, setCapas] = useState<Capa[]>(() => (fila ? [{ id: 0, clave, nombre, hex: fila.hex, fotoUrl }] : []));
  const caja = useRef<HTMLDivElement>(null);

  // Las otras fotos empiezan a bajar al abrir; la del color que se mira ya la está pidiendo su capa (se pide primero, por eso va antes).
  useEffect(() => {
    precargarMiniaturas([fotoUrl, ...(precargar ?? [])], SIZES_FOTO);
    // Solo al abrir (o si cambia el juego de fotos): el color mirado no vuelve a disparar la precarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precargar?.join("|")]);

  useEffect(() => {
    if (hex === undefined) return;
    let vigente = true;
    let quitar: ReturnType<typeof setTimeout> | undefined;
    // La capa nueva entra cuando su foto YA está lista: hasta entonces se queda la anterior a la vista (antes entraba vacía y la caja
    // se veía en blanco mientras llegaba la foto). Pasar el mouse por otro color antes de que llegue cancela esta espera.
    const poner = () => {
      if (!vigente) return;
      setCapas((previas) => {
        const ultima = previas[previas.length - 1];
        if (ultima && ultima.clave === clave && ultima.fotoUrl === fotoUrl) return previas;
        return [...previas.slice(-1), { id: siguiente.current++, clave, nombre, hex, fotoUrl }];
      });
      quitar = setTimeout(() => setCapas((previas) => previas.slice(-1)), MS_CRUCE);
    };
    if (fotoUrl) void esperarMiniatura(fotoUrl, SIZES_FOTO).then(poner);
    else poner();
    return () => {
      vigente = false;
      clearTimeout(quitar);
    };
  }, [clave, nombre, hex, fotoUrl]);

  function mover(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || !hayPunteroFino() || !caja.current) return;
    const r = caja.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    caja.current.style.setProperty("--vr-px", `${(-x * 12).toFixed(1)}px`);
    caja.current.style.setProperty("--vr-py", `${(-y * 12).toFixed(1)}px`);
  }
  function soltar() {
    caja.current?.style.setProperty("--vr-px", "0px");
    caja.current?.style.setProperty("--vr-py", "0px");
  }

  const sinFotoDe = (c: Capa) => <MosaicoPrenda forma="relleno" conNombre colorHex={c.hex} {...categoriaDe(producto)} className="h-full w-full !rounded-none" />;
  const arriba = capas[capas.length - 1];
  const ampliable = onAmpliar && arriba?.fotoUrl ? { fotoUrl: arriba.fotoUrl, color: arriba.nombre } : null;

  return (
    <div ref={caja} className="vr-foto" onPointerMove={mover} onPointerLeave={soltar}>
      {capas.map((c, i) => (
        <div key={c.id} className="vr-capa" data-nueva={c.id > 0 || undefined}>
          <div className="vr-par">
            {c.fotoUrl ? (
              <ImagenDePrenda src={c.fotoUrl} alt={`${producto.referencia} — ${c.nombre}`} fill sizes={SIZES_FOTO} className="object-cover" fondo={c.hex} fallback={sinFotoDe(c)} />
            ) : (
              sinFotoDe(c)
            )}
          </div>
          {!c.fotoUrl && i === capas.length - 1 && <span className="vr-muestra">Muestra{c.nombre ? ` — ${c.nombre}` : ""}</span>}
        </div>
      ))}
      {ampliable && (
        <button
          ref={botonAmpliar}
          type="button"
          className="vr-ampliar"
          data-guia="vista-rapida.ampliar"
          onClick={() => onAmpliar!(ampliable)}
          aria-label={`Ver la foto de ${producto.referencia}${ampliable.color ? ` — ${ampliable.color}` : ""} en grande`}
          title="Ver la foto en grande"
        >
          <span className="vr-ampliar-lupa" aria-hidden="true">
            <ZoomIn strokeWidth={2} />
          </span>
        </button>
      )}
    </div>
  );
}
