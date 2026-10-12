"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import type { ProductoListado } from "@/lib/catalogo-v2";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import type { FilaColor } from "@/lib/vista-rapida-producto-reglas";
import { hayPunteroFino } from "./movimiento";

type Capa = { id: number; clave: string; nombre: string; hex: string; fotoUrl: string | null };

/** Lo que dura el cruce de una foto a otra (`vr-foto-entra`, vista-rapida.css): pasado ese tiempo la capa de abajo ya no se ve y se quita. */
const MS_CRUCE = 620;

/**
 * La foto del color que se está mirando (vista rápida de producto, maqueta A). Un color nuevo llega como una capa ENCIMA de la anterior:
 * se funde y se asienta (de 1.06 a 1), y recién cuando termina se quita la de abajo — nunca hay un instante sin foto. Sin foto de ese
 * color, el mosaico de la prenda (ícono de su categoría sobre el color, ADR-0333), con su «Muestra — color» como en la tarjeta.
 * Con mouse, la foto se mueve apenas hacia el lado contrario del puntero (paralaje de ±6 px): es un detalle, no una función.
 */
export function FotoVistaRapida({ producto, fila }: { producto: ProductoListado; fila: FilaColor | undefined }) {
  const clave = fila?.clave ?? "";
  const nombre = fila?.nombre ?? "";
  const hex = fila?.hex;
  const fotoUrl = fila?.fotoUrl ?? null;
  const siguiente = useRef(1);
  const [capas, setCapas] = useState<Capa[]>(() => (fila ? [{ id: 0, clave, nombre, hex: fila.hex, fotoUrl }] : []));
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hex === undefined) return;
    setCapas((previas) => {
      const ultima = previas[previas.length - 1];
      if (ultima && ultima.clave === clave && ultima.fotoUrl === fotoUrl) return previas;
      return [...previas.slice(-1), { id: siguiente.current++, clave, nombre, hex, fotoUrl }];
    });
    const quitar = setTimeout(() => setCapas((previas) => previas.slice(-1)), MS_CRUCE);
    return () => clearTimeout(quitar);
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

  return (
    <div ref={caja} className="vr-foto" onPointerMove={mover} onPointerLeave={soltar}>
      {capas.map((c, i) => (
        <div key={c.id} className="vr-capa" data-nueva={c.id > 0 || undefined}>
          <div className="vr-par">
            {c.fotoUrl ? (
              <Image src={c.fotoUrl} alt={`${producto.referencia} — ${c.nombre}`} fill sizes="260px" className="object-cover" unoptimized />
            ) : (
              <MosaicoPrenda forma="relleno" conNombre colorHex={c.hex} {...categoriaDe(producto)} className="h-full w-full !rounded-none" />
            )}
          </div>
          {!c.fotoUrl && i === capas.length - 1 && <span className="vr-muestra">Muestra{c.nombre ? ` — ${c.nombre}` : ""}</span>}
        </div>
      ))}
    </div>
  );
}
