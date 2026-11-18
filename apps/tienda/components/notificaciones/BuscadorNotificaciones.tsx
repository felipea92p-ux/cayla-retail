"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PAUSA_BUSQUEDA_MS, terminoParaBuscar } from "@cayla-retail/shared/busqueda";

/** Largo máximo de la búsqueda (lo mismo que acepta la página). */
const LARGO_MAXIMO = 80;

/**
 * El buscador de «Tus notificaciones» (Felipe, 2026-10-19): busca MIENTRAS se escribe, sin botón ni Enter. Lo escrito va a la dirección
 * (`?q=`, así se puede compartir) tras una pausa corta: cada búsqueda vuelve a pedir la página en el servidor, y no se cancela la anterior.
 * Una letra sola todavía no busca, y sin texto vuelve la lista completa.
 */
export function BuscadorNotificaciones({ inicial }: { inicial: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial);
  const [buscando, iniciar] = useTransition();
  const ultimoEnviado = useRef(inicial);

  useEffect(() => {
    const termino = terminoParaBuscar(texto, LARGO_MAXIMO);
    if (termino === terminoParaBuscar(ultimoEnviado.current, LARGO_MAXIMO)) return;
    const reloj = window.setTimeout(() => {
      ultimoEnviado.current = termino;
      const destino = termino ? `/notificaciones?q=${encodeURIComponent(termino)}` : "/notificaciones";
      iniciar(() => router.replace(destino, { scroll: false }));
    }, PAUSA_BUSQUEDA_MS);
    return () => window.clearTimeout(reloj);
  }, [texto, router]);

  return (
    <form className="n-buscar" role="search" action="/notificaciones" onSubmit={(e) => e.preventDefault()}>
      <input
        type="search"
        name="q"
        value={texto}
        maxLength={LARGO_MAXIMO}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar en tus notificaciones"
        aria-label="Buscar en tus notificaciones"
        autoComplete="off"
        aria-busy={buscando || undefined}
      />
    </form>
  );
}
