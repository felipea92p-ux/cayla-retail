"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

// El buscador de Ventas ▸ Historial (ADR-0229): un solo campo para encontrar la venta de una clienta que vuelve —por el
// número del comprobante (B004-31), su DNI o RUC, su nombre, la prenda, el código de la etiqueta o el nº de operación
// de su Yape—. Busca en TODAS las fechas (lo dice la página al mostrar el resultado) con la misma búsqueda que Cambios y
// Devoluciones (`idsDeVentasBuscadas`), así que una clienta se encuentra igual en las tres pantallas.
//
// Vive en la URL (`?q=`) como el resto de filtros: se escribe con una pausa corta para no pedir a la base en cada letra,
// y `replace` (no `push`) para que «atrás» no recorra letra por letra. En el celular queda fijo bajo la cabecera.
// «/» lo enfoca desde cualquier parte de la pantalla (como en Shopify o GitHub).

const PAUSA_MS = 400;

export function BuscadorHistorial({ valor }: { valor: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState(valor);
  const campo = useRef<HTMLInputElement>(null);
  const ultimoEnviado = useRef(valor);

  // Si la URL cambia desde afuera («Limpiar todo», atrás del navegador), el campo la sigue.
  useEffect(() => {
    if (valor !== ultimoEnviado.current) {
      ultimoEnviado.current = valor;
      setTexto(valor);
    }
  }, [valor]);

  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === ultimoEnviado.current) return;
    const t = window.setTimeout(() => {
      ultimoEnviado.current = limpio;
      const p = new URLSearchParams(params.toString());
      if (limpio) p.set("q", limpio);
      else p.delete("q");
      p.delete("cursor");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, PAUSA_MS);
    return () => window.clearTimeout(t);
  }, [texto, params, pathname, router]);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const destino = e.target as HTMLElement | null;
      if (destino?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      e.preventDefault();
      campo.current?.focus();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  return (
    <label className="group flex h-12 items-center gap-2.5 rounded-2xl border-[1.5px] border-transparent bg-hueso px-4 transition-colors focus-within:border-taupe focus-within:bg-papel">
      <Search className="h-4 w-4 shrink-0 text-tinta/55" aria-hidden />
      <input
        ref={campo}
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // El Escape de este campo borra lo escrito; si ya está vacío, lo deja pasar (regla de ADR-0136).
          if (e.key === "Escape" && texto) {
            e.stopPropagation();
            setTexto("");
          }
        }}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        aria-label="Buscar una venta"
        // Corto para que quepa a 375 px; el nº de operación y el código de etiqueta también se buscan (lo dice el título).
        placeholder="Boleta, DNI, clienta o prenda"
        title="Busca por comprobante, DNI o RUC, clienta, prenda, código de etiqueta o nº de operación de Yape o Plin"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-tinta outline-none placeholder:text-tinta/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {texto ? (
        <button type="button" onClick={() => setTexto("")} aria-label="Borrar la búsqueda" className="grid h-8 w-8 place-items-center rounded-full text-tinta/55 hover:bg-sand hover:text-rojo">
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <kbd aria-hidden className="hidden rounded border border-sand bg-papel px-1.5 text-[11px] text-tinta/55 sm:inline">
          /
        </kbd>
      )}
    </label>
  );
}
