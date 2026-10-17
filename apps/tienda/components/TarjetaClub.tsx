"use client";

import { useRef } from "react";
import { Isotipo, PalabraCayla } from "./Marca";

/** La tarjeta del Club CAYLA. Con el mouse encima se inclina un poco hacia él (con el dedo o «reducir movimiento», no). */
export function TarjetaClub({ nombre, desde }: { nombre: string; desde: number }) {
  const tarjeta = useRef<HTMLDivElement>(null);
  const cuadro = useRef(0);

  function inclinar(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(cuadro.current);
    cuadro.current = requestAnimationFrame(() => {
      const el = tarjeta.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (clientX - r.left) / r.width - 0.5;
      const y = (clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
    });
  }

  function soltar() {
    cancelAnimationFrame(cuadro.current);
    tarjeta.current?.style.setProperty("--rx", "0deg");
    tarjeta.current?.style.setProperty("--ry", "0deg");
  }

  return (
    <div ref={tarjeta} className="t-tarjeta-club" role="img" aria-label="Tarjeta del Club CAYLA" onPointerMove={inclinar} onPointerLeave={soltar}>
      <div className="fila">
        <PalabraCayla className="marca" />
        <Isotipo />
      </div>
      <div className="chip-oro" aria-hidden="true" />
      <div className="fila">
        <span>
          <small>Miembro del club</small>
          <div className="nombre">{nombre}</div>
        </span>
        <span style={{ textAlign: "right" }}>
          <small>Desde</small>
          <div className="nombre">{desde}</div>
        </span>
      </div>
    </div>
  );
}
