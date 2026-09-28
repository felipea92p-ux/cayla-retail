"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { destinoQueSale, textoDeSalida } from "@/lib/aviso-de-salida-reglas";

/**
 * «¿Salir sin guardar?» (ADR-0256; lo decidió Felipe el 2026-09-28: «preguntar antes de perder»).
 *
 * Una pantalla con cambios sin guardar llama a `useAvisoDeSalida({ activo, cantidad, nombre })` y pinta el `dialogo` que
 * devuelve. Mientras `activo` sea verdadero, salir de la pantalla pregunta primero, por cualquiera de estos caminos:
 *
 *  1. Un enlace de la página (el menú, «← Productos», el logo). Se atrapa el clic ANTES de que Next lo vea.
 *  2. El botón Atrás, que en la tablet de la tienda es lo que más se usa. Next navega sin recargar y el navegador no avisa,
 *     así que al primer cambio se pone UNA entrada extra en el historial (misma dirección, mismo estado): «Atrás» gasta esa
 *     entrada y la pantalla no se mueve. Ahí se pregunta; si se sigue editando, se vuelve a poner.
 *  3. Cerrar o recargar la pestaña: el aviso propio del navegador (su texto no se puede cambiar).
 *
 * Al guardar, la pantalla sale con `salirSinPreguntar(destino)`, que primero gasta la entrada extra: así el historial queda
 * como si nunca hubiera estado (Atrás desde la lista no vuelve a la ficha vieja).
 *
 * Lo que se puede decidir sin navegador (qué clic sale, qué texto se dice) vive en `lib/aviso-de-salida-reglas.ts`.
 */

type Pendiente = { tipo: "enlace"; href: string } | { tipo: "atras" };

export function useAvisoDeSalida({ activo, cantidad, nombre }: { activo: boolean; cantidad: number; nombre: string }): {
  dialogo: ReactNode;
  /** Sale ya, sin preguntar (después de guardar). Deja el historial limpio antes de llamar a `destino`. */
  salirSinPreguntar: (destino: () => void) => void;
} {
  const router = useRouter();
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  // ¿Hay una entrada extra puesta en el historial por nosotros?
  const centinela = useRef(false);
  // Ya se decidió salir: nada más pregunta (ni el navegador, ni un segundo «Atrás»).
  const saliendo = useRef(false);
  // Lo último que dijo la pantalla, para los oyentes que se registran una sola vez.
  const activoAhora = useRef(activo);
  useEffect(() => {
    activoAhora.current = activo;
  }, [activo]);

  // 1 · Cerrar o recargar la pestaña.
  useEffect(() => {
    if (!activo) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      if (saliendo.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [activo]);

  // 2 · Un enlace de la página. En captura, en `document`: llega antes que el clic de Next y puede frenarlo.
  useEffect(() => {
    if (!activo) return;
    const alClic = (e: MouseEvent) => {
      if (saliendo.current) return;
      const ancla = (e.target as Element | null)?.closest?.("a[href]");
      if (!ancla) return;
      const destino = destinoQueSale(
        {
          href: ancla.getAttribute("href") ?? "",
          target: ancla.getAttribute("target"),
          descarga: ancla.hasAttribute("download"),
          button: e.button,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          defaultPrevented: e.defaultPrevented,
        },
        { origin: window.location.origin, pathname: window.location.pathname, search: window.location.search },
      );
      if (!destino) return;
      e.preventDefault();
      e.stopPropagation();
      setPendiente({ tipo: "enlace", href: destino });
    };
    document.addEventListener("click", alClic, true);
    return () => document.removeEventListener("click", alClic, true);
  }, [activo]);

  // 3 · El botón Atrás. La entrada extra se pone al primer cambio; el oyente vive toda la vida de la pantalla porque tiene
  // que atender también el caso «ya no hay cambios, pero la entrada extra sigue ahí».
  useEffect(() => {
    if (!activo || centinela.current) return;
    window.history.pushState(window.history.state, "", window.location.href);
    centinela.current = true;
  }, [activo]);

  useEffect(() => {
    const alAtras = () => {
      if (!centinela.current || saliendo.current) return;
      // «Atrás» acaba de gastar la entrada extra: la pantalla sigue en su dirección y con lo escrito.
      centinela.current = false;
      if (activoAhora.current) {
        setPendiente({ tipo: "atras" });
      } else {
        // Ya no hay nada que perder (se deshicieron los cambios): la entrada extra sobraba, se sigue hacia atrás.
        saliendo.current = true;
        window.history.back();
      }
    };
    window.addEventListener("popstate", alAtras);
    return () => window.removeEventListener("popstate", alAtras);
  }, []);

  const salirSinPreguntar = useCallback((destino: () => void) => {
    saliendo.current = true;
    if (!centinela.current) {
      destino();
      return;
    }
    // Se gasta la entrada extra primero y recién ahí se navega: si no, «Atrás» volvería a esta ficha ya vieja.
    centinela.current = false;
    let hecho = false;
    const seguir = () => {
      if (hecho) return;
      hecho = true;
      window.removeEventListener("popstate", seguir);
      destino();
    };
    window.addEventListener("popstate", seguir);
    window.history.back();
    window.setTimeout(seguir, 400);
  }, []);

  function seguirEditando() {
    // Si la pregunta vino del botón Atrás, la entrada extra ya se gastó: se vuelve a poner para el próximo.
    if (pendiente?.tipo === "atras" && !centinela.current) {
      window.history.pushState(window.history.state, "", window.location.href);
      centinela.current = true;
    }
    setPendiente(null);
  }

  function salir() {
    const destino = pendiente;
    setPendiente(null);
    if (destino?.tipo === "enlace") salirSinPreguntar(() => router.push(destino.href));
    else if (destino?.tipo === "atras") {
      saliendo.current = true;
      window.history.back();
    }
  }

  const texto = textoDeSalida(cantidad, nombre);
  const dialogo = pendiente ? (
    <Modal titulo={texto.titulo} subtitulo={texto.bajada} ancho="max-w-sm" onClose={seguirEditando}>
      {(cerrar) => (
        <div className="mt-5 flex gap-2">
          <Boton peso="primario" className="flex-1" onClick={cerrar}>
            Seguir editando
          </Boton>
          <Boton peso="fantasma" className="flex-1" onClick={salir}>
            Salir sin guardar
          </Boton>
        </div>
      )}
    </Modal>
  ) : null;

  return { dialogo, salirSinPreguntar };
}
