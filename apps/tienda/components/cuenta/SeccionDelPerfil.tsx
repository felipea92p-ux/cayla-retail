import type { ReactNode } from "react";

/**
 * Una sección de «Mi perfil» (Felipe 2026-10-15: «más ordenado y entendible»): su título con cuántos hay (el globito, si hay alguno) y, a
 * la derecha, su «Ver todos» o «Cómo funciona». Todas iguales y separadas por una línea, para que la página se lea como un índice. `id` es
 * su ancla: la usan los cuadros de arriba (`AtajosDelPerfil`). `mitad`: en la computadora va lado a lado con la otra mitad («Mis pedidos»
 * y «Mi Club CAYLA»); en el celular, todas a lo ancho.
 */
export function SeccionDelPerfil({
  id,
  titulo,
  cuenta = null,
  accion = null,
  mitad = false,
  children,
}: {
  id: string;
  titulo: string;
  cuenta?: number | null;
  accion?: ReactNode;
  mitad?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="pf-sec" data-mitad={mitad ? "" : undefined} aria-labelledby={`${id}-t`}>
      <div className="pf-sec-cab">
        <h2 id={`${id}-t`}>
          {titulo}
          {cuenta ? <span className="pf-cuenta">{cuenta}</span> : null}
        </h2>
        {accion}
      </div>
      {children}
    </section>
  );
}
