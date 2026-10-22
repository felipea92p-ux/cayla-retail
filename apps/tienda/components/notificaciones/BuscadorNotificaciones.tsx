"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Largo máximo de la búsqueda (lo mismo que acepta la página). */
const LARGO_MAXIMO = 80;

/**
 * El buscador de «Tus notificaciones» (Felipe, 2026-10-19): busca MIENTRAS se escribe. Cada tecla que entra o sale del texto vuelve a
 * pedir la lista con esa búsqueda (la dirección lleva `?q=`, así se puede compartir y «Atrás» vuelve a la búsqueda anterior). Sin texto,
 * vuelve la lista completa. No hay botón de buscar ni hace falta Enter.
 */
export function BuscadorNotificaciones({ inicial }: { inicial: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial);
  const [buscando, iniciar] = useTransition();

  function cambiar(valor: string) {
    setTexto(valor);
    const limpio = valor.trim().slice(0, LARGO_MAXIMO);
    const destino = limpio ? `/notificaciones?q=${encodeURIComponent(limpio)}` : "/notificaciones";
    iniciar(() => router.replace(destino, { scroll: false }));
  }

  return (
    <form className="n-buscar" role="search" action="/notificaciones" onSubmit={(e) => e.preventDefault()}>
      <input
        type="search"
        name="q"
        value={texto}
        maxLength={LARGO_MAXIMO}
        onChange={(e) => cambiar(e.target.value)}
        placeholder="Buscar en tus notificaciones"
        aria-label="Buscar en tus notificaciones"
        autoComplete="off"
        aria-busy={buscando || undefined}
      />
    </form>
  );
}
