"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ico } from "./iconos";

/**
 * El botón fijo de abajo en celular: «Nuevo producto», y al lado Recibir y Escanear. Sube desde abajo cuando el botón grande
 * de la cabina sale de la pantalla (mientras se ve, no se repite). Es una acción de ESTA pantalla, no una barra de
 * navegación: el menú sigue siendo el cajón ☰ (ADR-0206). Desde `sm` no existe (CSS).
 */
export function DockAlmacen({ veRecibir }: { veRecibir: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const cta = document.getElementById("ia-cta");
    if (!cta || typeof IntersectionObserver === "undefined") {
      const cuadro = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(cuadro);
    }
    const io = new IntersectionObserver(([e]) => setVisible(!e?.isIntersecting), { threshold: 0.4 });
    io.observe(cta);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`ia-dock ${visible ? "ia-on" : ""}`} inert={!visible}>
      <Link href="/productos/nuevo" className="ia-principal">
        <Ico clave="plus" /> Nuevo producto
      </Link>
      {veRecibir && (
        <Link href="/recibir" className="ia-ib" aria-label="Recibir mercadería">
          <Ico clave="truck" />
        </Link>
      )}
      <Link href="/buscar" className="ia-ib" aria-label="Escanear o buscar">
        <Ico clave="scan" />
      </Link>
    </div>
  );
}
