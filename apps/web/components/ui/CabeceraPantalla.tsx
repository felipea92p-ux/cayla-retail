import type { ReactNode } from "react";

/* ====================================================================
   CabeceraPantalla · el orden oficial de la parte de arriba de una pantalla
   (2026-09-22, guía «CAYLA Dynamic», ADR-0167)

   Sobretítulo en rojo (módulo · sección) → título en la serif de la casa
   (casi siempre la sede que se mira) → una bajada en taupe que dice para
   qué sirve la pantalla. A la derecha, la acción principal (un solo botón
   primario) y lo que la acompañe (selector de sede, interruptores).
   Va directo sobre el crema: sin tarjeta alrededor, sin ilustración. La
   cabecera no compite con las cifras que vienen debajo.

   Es la hermana sobria de `EncabezadoPagina` (Caja, Cambios, Devoluciones:
   con reloj vivo y título de 46 px). Las dos conviven hasta que Ventas
   pase a la guía oficial.
   ==================================================================== */
export function CabeceraPantalla({
  sobretitulo,
  titulo,
  bajada,
  acciones,
  children,
}: {
  /** «Inventario · Existencias». Va en mayúsculas y en rojo (cuenta en el máximo de 2 rojos). */
  sobretitulo: string;
  titulo: ReactNode;
  /** Para qué sirve la pantalla, en una o dos líneas. */
  bajada?: ReactNode;
  /** A la derecha del título: la acción principal y sus acompañantes. */
  acciones?: ReactNode;
  /** Bajo la bajada: una línea más de contexto (la hora de carga, un aviso). */
  children?: ReactNode;
}) {
  return (
    <header className="anim-sube flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        <p className="eyebrow-cayla">{sobretitulo}</p>
        <h1 className="font-display mt-1.5 text-[30px] leading-tight text-tinta">{titulo}</h1>
        {bajada && <p className="mt-1.5 text-[15px] leading-relaxed text-taupe">{bajada}</p>}
        {children}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2.5">{acciones}</div>}
    </header>
  );
}
