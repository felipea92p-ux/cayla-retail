"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PAUSA_BUSQUEDA_MS, terminoParaBuscar } from "@cayla-retail/shared/busqueda";
import { navegacionSinEspera } from "@/components/ui/Espera";

/* ====================================================================
   Buscar escribiendo, sin el loader general (ADR-0149, «Actualización 2026-09-28»).

   Productos, Movimientos, Compras, Recibidas y el Historial de ventas filtran en la base: lo escrito va a la
   URL (`?q=`) y la página se vuelve a pedir. Para el loader eso era «abrir una pantalla» y cubría todo a
   mitad de palabra, quitándole el foco al campo. Vender y Apartados no lo sufren porque filtran en el
   navegador; aquí la base es inevitable, así que se cambia la señal, no el camino:

   · `buscar(href)` anuncia la dirección al loader (`navegacionSinEspera`) y navega en una transición.
   · Mientras la base responde, `buscando` es true: el campo dice «Buscando…» (`<Buscador buscando>`) y todo lo
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

/** A dónde lleva lo escrito. Con `vaciar`, la caja queda en blanco al mandarlo (Movimientos: lo escrito era un filtro, no una búsqueda). */
type Destino = string | { href: string; vaciar: true };

/* ====================================================================
   El buscador que va a la URL, entero: lo que dice la caja, la pausa, y seguir a la URL cuando cambia desde afuera.

   · Se manda solo tras `PAUSA_BUSQUEDA_MS` sin teclear, nunca por letra: cada búsqueda vuelve a pedir la pantalla completa.
   · Una letra sola no se manda (`terminoParaBuscar`); borrar hasta quedar con una vuelve a la lista sin buscar.
   · Siempre reemplaza la entrada del historial: «Atrás» no recorre lo que se fue escribiendo.
   · `hrefDe` se lee al momento de mandar: si mientras se tecleaba cambió otro filtro, se parte de la URL de ahora.

   Un cambio que NO es teclear (un chip, «Limpiar», un código escaneado) pasa por `fijar`: la caja cambia y la pausa no vuelve a mandarlo.
   ==================================================================== */
export function useBuscarAlEscribir(
  valorUrl: string,
  hrefDe: (termino: string) => Destino,
  { largoMaximo }: { largoMaximo?: number } = {},
) {
  const { buscando, buscar } = useBusquedaEnUrl();
  const [texto, setTexto] = useState(valorUrl);
  const ultimoEnviado = useRef(valorUrl);
  const hrefVigente = useRef(hrefDe);
  useEffect(() => {
    hrefVigente.current = hrefDe;
  });

  // Si la URL cambia desde afuera («Limpiar todo», atrás del navegador), la caja la sigue.
  useEffect(() => {
    if (valorUrl !== ultimoEnviado.current) {
      ultimoEnviado.current = valorUrl;
      setTexto(valorUrl);
    }
  }, [valorUrl]);

  const mandar = useCallback(
    (termino: string) => {
      const destino = hrefVigente.current(termino);
      const conVaciar = typeof destino !== "string";
      ultimoEnviado.current = conVaciar ? "" : termino;
      if (conVaciar) setTexto("");
      buscar(conVaciar ? destino.href : destino, { reemplazar: true });
    },
    [buscar],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      const termino = terminoParaBuscar(texto, largoMaximo);
      // Comparado por la misma regla: un enlace viejo con `?q=a` no se manda solo al entrar.
      if (termino !== terminoParaBuscar(ultimoEnviado.current, largoMaximo)) mandar(termino);
    }, PAUSA_BUSQUEDA_MS);
    return () => window.clearTimeout(t);
  }, [texto, largoMaximo, mandar]);

  /** La caja cambia por algo que no es teclear: lo que traiga ya viaja por su cuenta, la pausa no lo manda de nuevo. */
  const fijar = useCallback((nuevo: string) => {
    ultimoEnviado.current = nuevo.trim();
    setTexto(nuevo);
  }, []);

  /** Enter: se manda ya lo que diga la caja, una letra incluida (ahí la persona lo pidió). */
  const enviarYa = useCallback(() => {
    const termino = texto.trim().slice(0, largoMaximo);
    if (termino !== ultimoEnviado.current) mandar(termino);
  }, [texto, largoMaximo, mandar]);

  return { texto, setTexto, buscando, fijar, enviarYa };
}
