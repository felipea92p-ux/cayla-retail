"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { esMesValido, hrefPestana, PESTANAS, pestanaDeRuta, type ConteoPestana, type ConteosPestanas } from "@/lib/facturacion-reglas";

// Contador de cada pestaña. Ámbar = hay algo por enviar; rojo = SUNAT rechazó alguno;
// neutro = solo informa. El texto va como `sr-only` (y como `title`) porque el número solo
// no dice qué cuenta, y el color solo no alcanza.
const TONO_CONTEO: Record<ConteoPestana["tono"], string> = {
  neutro: "bg-tinta/10 text-tinta",
  ambar: "bg-ambar/15 text-ambar-profundo",
  rojo: "bg-rojo/15 text-rojo-profundo",
};

// Las cuatro vistas de Facturación. La URL es la fuente de verdad (son enlaces: «atrás» del
// navegador funciona y una vista se puede compartir); la activa lleva `aria-current`.
// Usa `useSearchParams` para conservar `?m=` entre Proformas y Comprobantes, y por eso el
// shell la envuelve en <Suspense>.
export function FacturacionPestanas({ conteos }: { conteos: ConteosPestanas }) {
  const pathname = usePathname();
  const m = useSearchParams().get("m");
  const activa = pestanaDeRuta(pathname);
  const mes = esMesValido(m) ? m : null;
  const nav = useRef<HTMLElement>(null);

  // La píldora se coloca midiendo el DOM y escribiendo la posición en variables CSS del
  // propio <nav>. Se escribe directo en el estilo y no en estado (mismo patrón que
  // `Ayuda.tsx`): en `useLayoutEffect` el primer cuadro ya sale bien puesto, sin parpadeo
  // ni re-render, y no dispara `react-hooks/set-state-in-effect`. Se vuelve a medir cuando
  // cambia la pestaña activa o un contador (cambia el ancho de la etiqueta tras un
  // `router.refresh()`): por eso `activa` y `conteos` están en las dependencias aunque el
  // cuerpo no los lea — no los quites por «no usados».
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const colocar = () => {
      const activo = el.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activo) return;
      el.style.setProperty("--pildora-x", `${activo.offsetLeft}px`);
      el.style.setProperty("--pildora-w", `${activo.offsetWidth}px`);
      el.dataset.medido = "";
    };
    colocar();
    // Las fuentes web y el ancho de la ventana cambian el ancho de las etiquetas.
    const observador = new ResizeObserver(colocar);
    observador.observe(el);
    return () => observador.disconnect();
  }, [activa, conteos]);

  // Por debajo de 1024 px (celular y tablet vertical) las cuatro pestañas no caben y el
  // contenedor se desplaza: al abrir la página y al cambiar de vista se centra la activa, si no
  // la píldora queda fuera de pantalla y no se ve dónde estás. Solo depende de `activa` (no de
  // `conteos`): si la persona desliza la tira para mirar las otras, un contador que cambia no
  // se la devuelve.
  useLayoutEffect(() => {
    const el = nav.current;
    const activo = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !activo || el.scrollWidth <= el.clientWidth) return;
    const suave = el.dataset.listo !== undefined && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: activo.offsetLeft - (el.clientWidth - activo.offsetWidth) / 2, behavior: suave ? "smooth" : "auto" });
  }, [activa]);

  // La transición se habilita recién después de la primera pintura: la píldora nace en su
  // lugar y solo se desliza cuando cambia la pestaña.
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => {
      if (nav.current) nav.current.dataset.listo = "";
    });
    return () => cancelAnimationFrame(cuadro);
  }, []);

  return (
    <nav ref={nav} aria-label="Vistas de Facturación" className="vidrio-cayla pestanas-vidrio">
      {/* Decorativa: la información está en las etiquetas y en `aria-current`. */}
      <span aria-hidden className="pestanas-vidrio__pildora" />
      {PESTANAS.map((p) => {
        const esActiva = p.clave === activa;
        const conteo = conteos[p.clave];
        return (
          <Link
            key={p.clave}
            href={hrefPestana(p, mes)}
            aria-current={esActiva ? "page" : undefined}
            className={`relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-[15px] py-2 text-[14px] leading-5 outline-none transition-colors duration-200 focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 ${
              esActiva ? "font-semibold text-crema" : "font-normal text-tinta"
            }`}
          >
            {p.etiqueta}
            {conteo && (
              <span
                title={`${conteo.valor} ${conteo.texto}`}
                className={`rounded-full px-1.5 py-[3px] text-[10.5px] font-semibold leading-none tabular-nums ${
                  esActiva ? "bg-crema/15 text-crema" : TONO_CONTEO[conteo.tono]
                }`}
              >
                {conteo.valor}
                <span className="sr-only"> {conteo.texto}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
