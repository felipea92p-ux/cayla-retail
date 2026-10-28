"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { letrasDelNombre, VELO_SALE_MS } from "@/lib/sede-velo";
import { MarcaDeTienda } from "./MarcaDeTienda";

/**
 * El velo del cambio de tienda (ADR-0466): la pantalla de carga de «elegir otra tienda». Un velo oscuro y desenfocado cubre lo que hay
 * bajo la cabecera (la lista de antes se sigue viendo detrás, borrosa), escribe «Ahora ves lo que hay en LIMA» con las letras subiendo
 * una a una y un hilo que barre bajo el nombre mientras llega la página; cuando llega, se disipa. Vive en el `<body>` (un portal) y no
 * dentro de la cabecera: la cabecera tiene `backdrop-filter`, que haría de ella el marco de todo lo que sea `fixed` adentro. Empieza
 * justo bajo la cabecera (`arriba`), así la tienda que rueda en ella se ve nítida. Cuándo se queda y cuándo se va lo decide
 * `lib/sede-velo.ts`; el movimiento, `app/estilos/cabecera.css`, y con «reducir movimiento» queda quieto (no desaparece: sigue diciendo
 * que la página está llegando).
 */
export function VeloDeSede({ nombre, fase, arriba }: { nombre: string; fase: "espera" | "sale"; arriba: number }) {
  return createPortal(
    <div className="t-velo-sede" data-fase={fase} role="status" style={{ top: arriba }}>
      {/* Para el lector de pantalla, una sola frase; lo que se ve, letra por letra, no se lee. */}
      <span className="t-solo-lector">Cambiando a la tienda de {nombre}</span>
      <span className="t-velo-sede-ceja" aria-hidden="true">
        Ahora ves lo que hay en
      </span>
      <p className="t-velo-sede-nombre" aria-hidden="true">
        {letrasDelNombre(nombre).map((letra, j) => (
          <span key={j} style={{ "--j": j } as CSSProperties}>
            {letra}
          </span>
        ))}
      </p>
      <span className="t-velo-sede-hilo" aria-hidden="true" />
    </div>,
    document.body,
  );
}

/**
 * La tienda en la cabecera (su escudo o, sin él, su nombre): cuando cambia (la página nueva llegó), el de antes rueda hacia arriba y el nuevo sube desde
 * abajo, como la cédula de un museo. Los dos comparten el lugar, alineados a la derecha (junto a la flecha), así el nombre más corto no
 * se corre al terminar. Sin cambio, es solo el texto.
 */
export function NombreQueRueda({ nombre }: { nombre: string }) {
  const [visto, setVisto] = useState(nombre);
  const [antes, setAntes] = useState<string | null>(null);
  // Ajuste durante el dibujo (no un efecto): el nombre cambió, el de antes se queda un momento para rodar hacia arriba.
  if (visto !== nombre) {
    setVisto(nombre);
    setAntes(visto);
  }
  useEffect(() => {
    if (antes === null) return;
    const t = window.setTimeout(() => setAntes(null), VELO_SALE_MS + 40);
    return () => window.clearTimeout(t);
  }, [antes]);
  return (
    <span className="t-sede-caja">
      {antes !== null && (
        <span className="t-sede-nom t-sede-nom-sale" aria-hidden="true">
          <MarcaDeTienda nombre={antes} />
        </span>
      )}
      <span key={nombre} className={antes !== null ? "t-sede-nom t-sede-nom-entra" : "t-sede-nom"}>
        <MarcaDeTienda nombre={nombre} />
      </span>
    </span>
  );
}
