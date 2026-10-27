"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PiezaDelDesfile } from "@/lib/desfile";
import { FotoTarjeta } from "../FotoTarjeta";
import "@/app/estilos/desfile.css";

// «El programa» (ADR-0524): la lista de salidas que baja del escenario. Cada fila lleva a su prenda; con mouse, al pasar por una fila la prenda asoma junto
// al cursor y lo sigue con un poco de inercia. Con el dedo, con «reducir movimiento» o con el teclado es solo la lista.
export function ListaDeSalidas({ piezas }: { piezas: PiezaDelDesfile[] }) {
  const [sobre, setSobre] = useState<number | null>(null);
  const [ultima, setUltima] = useState(0);
  const [montada, setMontada] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const punto = useRef({ tx: 0, ty: 0, x: 0, y: 0 });

  // Mientras una fila tiene el mouse encima, la caja persigue al cursor. Fuera de eso no hay ningún cuadro corriendo.
  useEffect(() => {
    if (sobre === null) return;
    const p = punto.current;
    const mover = (e: PointerEvent) => {
      p.tx = e.clientX + 28;
      p.ty = e.clientY - 140;
    };
    window.addEventListener("pointermove", mover, { passive: true });
    let cuadro = 0;
    const bucle = () => {
      p.x += (p.tx - p.x) * 0.14;
      p.y += (p.ty - p.y) * 0.14;
      if (caja.current) caja.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${(p.tx - p.x) * 0.02}deg)`;
      cuadro = requestAnimationFrame(bucle);
    };
    cuadro = requestAnimationFrame(bucle);
    return () => {
      window.removeEventListener("pointermove", mover);
      cancelAnimationFrame(cuadro);
    };
  }, [sobre]);

  const alEntrar = (e: React.PointerEvent, i: number) => {
    if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const p = punto.current;
    p.tx = p.x = e.clientX + 28;
    p.ty = p.y = e.clientY - 140;
    setMontada(true);
    setUltima(i);
    setSobre(i);
  };

  const en = piezas[ultima] ?? piezas[0];
  return (
    <>
      <ol className="t-salidas" onPointerLeave={() => setSobre(null)}>
        {piezas.map((p, i) => (
          <li key={p.id} onPointerEnter={(e) => alEntrar(e, i)}>
            <Link
              href={p.href}
              data-prenda={p.id}
              data-nombre={p.datos.nombre}
              data-precio={p.datos.precio}
              data-antes={p.datos.antes}
              data-oferta={p.datos.oferta}
              data-categoria={p.datos.categoria}
            >
              <span className="t-cap t-salida-gris">
                <span className="t-salida-pal">Salida </span>
                {p.salida}
              </span>
              <span className="t-salida-nom">{p.nombre}</span>
              <span className="t-cap t-salida-gris">{p.categoria}</span>
              <span className="t-salida-precio">
                {p.anterior && <s>{p.anterior}</s>}
                {p.precio}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {/* La caja se fija a la ventana: `.tienda` es un contenedor y no dejaría que algo suyo se fije a ella, por eso vive en el `body`. */}
      {montada &&
        en &&
        createPortal(
          <div ref={caja} className={`t-asoma${sobre !== null ? " visible" : ""}`} aria-hidden="true">
            <FotoTarjeta key={en.id} foto={en.foto} segunda={null} optimizar={[en.optimizar, false]} nombre={en.nombre} forma={en.forma} color={en.color} tamanos="220px" />
          </div>,
          document.body,
        )}
    </>
  );
}
