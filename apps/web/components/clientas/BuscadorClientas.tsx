"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { SenalBuscando, useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { hrefLista, MAX_TERMINO, type ParamsLista } from "@/lib/clientas-lista-reglas";

// El buscador de /clientas (ADR-0288 tanda 1f, como el spike del club: busca al escribir, sin botón «Buscar», y ocupa el
// ancho de la tarjeta). Lo escrito va a la URL (`?q=`) con una pausa corta y `replace` (así «atrás» no recorre letra por
// letra), y la base busca como `buscar_clienta`: documento, celular (con +51 o espacios), código de socia o parte del nombre.
// Va por `useBusquedaEnUrl` (CLAUDE.md, ADR-0149): lo tipeado no abre el loader; el campo dice «Buscando…» y la lista se
// atenúa (`data-resultados`) mientras la base responde.

const PAUSA_MS = 350;

export function BuscadorClientas({ params }: { params: ParamsLista }) {
  const [texto, setTexto] = useState(params.termino);
  const ultimoEnviado = useRef(params.termino);
  const { buscando, buscar } = useBusquedaEnUrl();

  // Si la URL cambia desde afuera (atrás del navegador, «Ficha de la clienta» desde Historial), el campo la sigue.
  useEffect(() => {
    if (params.termino !== ultimoEnviado.current) {
      ultimoEnviado.current = params.termino;
      setTexto(params.termino);
    }
  }, [params.termino]);

  useEffect(() => {
    const limpio = texto.trim().slice(0, MAX_TERMINO);
    if (limpio === ultimoEnviado.current) return;
    const t = window.setTimeout(() => {
      ultimoEnviado.current = limpio;
      buscar(hrefLista(params, { termino: limpio }), { reemplazar: true });
    }, PAUSA_MS);
    return () => window.clearTimeout(t);
  }, [texto, params, buscar]);

  return (
    <label className="caja-cayla flex h-10 w-full min-w-0 items-center gap-2 px-3">
      <Search className="h-4 w-4 shrink-0 text-tinta/50" aria-hidden />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // El Escape de este campo borra lo escrito; si ya está vacío, lo deja pasar (ADR-0136).
          if (e.key === "Escape" && texto) {
            e.stopPropagation();
            setTexto("");
          }
        }}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        aria-label="Buscar cliente"
        placeholder="DNI, celular o nombre…" // sugerir-fijo: dice qué se puede buscar en la libreta; no depende de nada elegido antes
        title="Busca por documento (DNI, carné o pasaporte), celular, código de miembro (C-0142) o parte del nombre"
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/55 [&::-webkit-search-cancel-button]:hidden"
      />
      <SenalBuscando activo={buscando} className="shrink-0" />
      {texto && (
        <button type="button" onClick={() => setTexto("")} aria-label="Borrar la búsqueda" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-tinta/55 hover:bg-sand hover:text-rojo">
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </label>
  );
}
