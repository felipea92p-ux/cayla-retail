"use client";

import { useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { navegacionSinEspera } from "@/components/ui/Espera";

/* ====================================================================
   Buscar escribiendo, sin el loader general (ADR-0149, «Actualización 2026-09-28»).

   Productos, Movimientos, Compras, Recibidas y el Historial de ventas filtran en la base: lo escrito va a la
   URL (`?q=`) y la página se vuelve a pedir. Para el loader eso era «abrir una pantalla» y cubría todo a
   mitad de palabra, quitándole el foco al campo. Vender y Apartados no lo sufren porque filtran en el
   navegador; aquí la base es inevitable, así que se cambia la señal, no el camino:

   · `buscar(href)` anuncia la dirección al loader (`navegacionSinEspera`) y navega en una transición.
   · Mientras la base responde, `buscando` es true: el campo dice «Buscando…» (`SenalBuscando`) y todo lo
     marcado con `data-resultados` se atenúa (regla «BÚSQUEDA EN CURSO» de globals.css). Lo de antes se
     sigue viendo, pero nadie lo confunde con la respuesta nueva.

   Solo lo que se TIPEA (o se arrastra, como el precio) pasa por aquí. Un filtro por clic (categoría,
   una píldora, «Limpiar todo») es una acción decidida y sigue con el loader de siempre.
   ==================================================================== */
export function useBusquedaEnUrl() {
  const router = useRouter();
  const [buscando, empezar] = useTransition();

  useEffect(() => {
    if (!buscando) return;
    const raiz = document.documentElement;
    raiz.setAttribute("data-buscando", "");
    const zonas = [...document.querySelectorAll("[data-resultados]")];
    zonas.forEach((z) => z.setAttribute("aria-busy", "true"));
    return () => {
      raiz.removeAttribute("data-buscando");
      zonas.forEach((z) => z.removeAttribute("aria-busy"));
    };
  }, [buscando]);

  /** Navega a `href` sin loader. `reemplazar`: sin dejar una entrada por búsqueda en «atrás». */
  const buscar = useCallback(
    (href: string, { reemplazar = false }: { reemplazar?: boolean } = {}) => {
      navegacionSinEspera(href);
      empezar(() => {
        if (reemplazar) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router],
  );

  return { buscando, buscar };
}

/** «Buscando…» en rojo, junto al campo. Entra y sale con opacidad (sin mover nada) y lo anuncia a un lector de pantalla. */
export function SenalBuscando({ activo, className = "" }: { activo: boolean; className?: string }) {
  return (
    <>
      <span
        aria-hidden
        className={`label-cayla pointer-events-none whitespace-nowrap text-[10.5px] text-rojo transition-opacity duration-200 [transition-timing-function:var(--ease-cayla)] motion-reduce:transition-none ${
          activo ? "opacity-100" : "opacity-0"
        } ${className}`}
      >
        Buscando…
      </span>
      <span role="status" className="sr-only">
        {activo ? "Buscando…" : ""}
      </span>
    </>
  );
}
