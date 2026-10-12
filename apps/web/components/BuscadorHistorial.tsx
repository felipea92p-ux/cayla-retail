"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";

// El buscador de Ventas ▸ Historial (ADR-0230): un solo campo para encontrar la venta de una clienta que vuelve —por el
// número del comprobante (B004-31), su DNI o RUC, su nombre, la prenda o el código de la etiqueta—. El nº de operación de
// Yape o Plin ya no se busca (ADR-0307: la caja dejó de pedirlo). Busca en TODAS las fechas (lo dice la página al mostrar el resultado) con la misma búsqueda que Cambios y
// Devoluciones (`idsDeVentasBuscadas`), así que una clienta se encuentra igual en las tres pantallas.
//
// Vive en la URL (`?q=`) como el resto de filtros: se escribe con una pausa corta para no pedir a la base en cada letra,
// y `replace` (no `push`) para que «atrás» no recorra letra por letra. En el celular queda fijo bajo la cabecera.
// «/» lo enfoca desde cualquier parte de la pantalla (como en Shopify o GitHub).

const PAUSA_MS = 400;

export function BuscadorHistorial({ valor }: { valor: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState(valor);
  const campo = useRef<HTMLInputElement>(null);
  const ultimoEnviado = useRef(valor);
  const { buscando, buscar } = useBusquedaEnUrl();

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
      buscar(qs ? `${pathname}?${qs}` : pathname, { reemplazar: true });
    }, PAUSA_MS);
    return () => window.clearTimeout(t);
  }, [texto, params, pathname, buscar]);


  // La pieza única de buscar (ADR-0358, ronda 5): filtra mientras se escribe; «Buscando…» solo si la base tarda.
  return (
    <Buscador
      ref={campo}
      valor={texto}
      onCambio={setTexto}
      buscando={buscando}
      atajo
      enterKeyHint="search"
      etiqueta="Buscar una venta"
      // Corto para que quepa a 375 px; el código de etiqueta también se busca (lo dice el título).
      placeholder="Boleta, DNI, cliente o prenda"
      title="Busca por comprobante, DNI o RUC, cliente, prenda o código de etiqueta"
    />
  );
}
