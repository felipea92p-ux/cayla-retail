"use client";

import { useRef } from "react";

/**
 * La invitación al Club CAYLA del Inicio (ADR-0524, «G · Pasarela»): una tarjeta blanca de 5 : 7 con su filo adentro. Sin cuenta dice «Tu nombre aquí»; con
 * cuenta, lleva el nombre de quien entró. Con el mouse encima se inclina un poco hacia él, como una tarjeta que se toma con la mano (con el dedo o con
 * «reducir movimiento», no). La tarjeta de miembro de «Mi perfil» y de «Entrar» sigue siendo `TarjetaClub`.
 */
export function InvitacionClub({ nombre, desde }: { nombre: string | null; desde: number }) {
  const cara = useRef<HTMLDivElement>(null);
  const cuadro = useRef(0);

  function inclinar(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { clientX, clientY, currentTarget } = e;
    cancelAnimationFrame(cuadro.current);
    cuadro.current = requestAnimationFrame(() => {
      const r = currentTarget.getBoundingClientRect();
      const x = (clientX - r.left) / r.width - 0.5;
      const y = (clientY - r.top) / r.height - 0.5;
      cara.current?.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
      cara.current?.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
    });
  }

  function soltar() {
    cancelAnimationFrame(cuadro.current);
    cara.current?.style.setProperty("--rx", "0deg");
    cara.current?.style.setProperty("--ry", "0deg");
  }

  return (
    <div className="t-invitacion" role="img" aria-label={nombre ? `Invitación al Club CAYLA de ${nombre}` : "Invitación al Club CAYLA"} onPointerMove={inclinar} onPointerLeave={soltar}>
      <div ref={cara} className="t-invitacion-cara">
        <span className="t-ceja">CAYLA</span>
        <span className="t-invitacion-nombre">
          {nombre ? (
            <em>{nombre}</em>
          ) : (
            <>
              <em>Tu nombre</em>
              <br />
              aquí
            </>
          )}
        </span>
        <span className="t-ceja t-invitacion-gris">Miembro del Club · {desde}</span>
      </div>
    </div>
  );
}
