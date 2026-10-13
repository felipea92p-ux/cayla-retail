"use client";

/**
 * La entrada al ERP: «el colibrí se abre» (Felipe 2026-10-13; maqueta `docs/maquetas/login-entrada-2026-10/`).
 *
 * Una capa a pantalla completa, montada UNA vez en el layout raíz (como el loader, ADR-0149) para que no se pierda cuando el login
 * navega a la pantalla de destino. Al iniciar sesión: el fondo se oscurece, el colibrí del login cruza al centro y flota mientras la
 * pantalla de destino carga debajo; cuando está lista, en el centro se abre una ventana CON LA FORMA DEL COLIBRÍ que deja ver esa
 * pantalla de verdad (un agujero en el velo oscuro, no un dibujo), y el ave se agranda hasta salirse y la ventana cubre todo.
 * Una sola vez, sin rebote ni bucle (ADR-0136 act. 2026-10-13 (b)); con `prefers-reduced-motion` ni empieza (`iniciarEntrada`).
 * La geometría y la línea de tiempo viven en `lib/login-entrada.ts`; el aleteo, en `lib/login-vuelo.ts`; los estilos, en `login.css`.
 */

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { esperaOcupada } from "@/lib/espera-estado";
import { entradaEnCurso, suscribirEntrada, terminarEntrada, type EntradaEnCurso } from "@/lib/entrada-estado";
import {
  CABEZA_DEL_AVE,
  PECHO_DEL_AVE,
  debeCancelarse,
  estadoDeLaEntrada,
  msDelVuelo,
  revisarLaPantalla,
} from "@/lib/login-entrada";
import { TRAZOS_DEL_AVE, alaDelAve } from "@/lib/login-vuelo";

export function EntradaColibri() {
  const entrada = useSyncExternalStore(suscribirEntrada, entradaEnCurso, () => null);
  return entrada ? <Vuelo key={entrada.id} entrada={entrada} /> : null;
}

/** Cuánto tarda en irse el velo si la entrada se deshace (no se corta de golpe). */
const MS_SALIDA = 300;

function Vuelo({ entrada }: { entrada: EntradaEnCurso }) {
  const mascaraId = `entrada-${useId().replace(/:/g, "")}`;
  const lienzoRef = useRef<SVGSVGElement>(null);
  const veloRef = useRef<SVGRectElement>(null);
  const siluetaRef = useRef<SVGGElement>(null);
  const siluetaAlaRef = useRef<SVGPathElement>(null);
  const aveRef = useRef<SVGGElement>(null);
  const alaRef = useRef<SVGPathElement>(null);
  const alaBajoRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const lienzo = lienzoRef.current;
    const velo = veloRef.current;
    const silueta = siluetaRef.current;
    const siluetaAla = siluetaAlaRef.current;
    const ave = aveRef.current;
    const ala = alaRef.current;
    const alaBajo = alaBajoRef.current;
    if (!lienzo || !velo || !silueta || !siluetaAla || !ave || !ala || !alaBajo) return;

    let cuadro = 0;
    let inicio: number | null = null;
    let listoEn: number | null = null;
    let libreDesde: number | null = null;
    let saliendoDesde: number | null = null;
    let lista = false;

    const paso = (ahora: number) => {
      inicio ??= ahora;
      const ms = ahora - inicio;

      // Deshacer: te devolvieron al login con un motivo, o la pantalla tardó demasiado. El velo se va suave y el login queda como estaba.
      if (saliendoDesde === null && debeCancelarse({ ruta: location.pathname, busqueda: location.search }, ms, lista)) saliendoDesde = ms;
      if (saliendoDesde !== null) {
        const t = (ms - saliendoDesde) / MS_SALIDA;
        lienzo.style.opacity = String(Math.max(0, 1 - t));
        if (t >= 1) return terminarEntrada();
        cuadro = requestAnimationFrame(paso);
        return;
      }

      // ¿Ya cargó la pantalla de destino? Mientras no, el ave flota en el centro y la ventana no se abre.
      if (listoEn === null) {
        const revision = revisarLaPantalla({ ruta: location.pathname, ocupada: esperaOcupada() }, libreDesde, ms);
        libreDesde = revision.libreDesde;
        if (revision.lista) {
          lista = true;
          listoEn = ms;
        }
      }

      const medidas = { origen: entrada.origen, ancho: window.innerWidth, alto: window.innerHeight };
      const e = estadoDeLaEntrada(msDelVuelo(ms, listoEn), ms, medidas);
      if (e.terminado) return terminarEntrada();

      const [a, b] = alaDelAve(e.angulo, e.alargue);
      ala.setAttribute("d", a);
      alaBajo.setAttribute("d", b);
      siluetaAla.setAttribute("d", `${a} Z`);
      // Un mismo mapa lleva el dibujo del ave (cuyo pecho cae en `e.pecho`) y la silueta de la ventana, que nace del pecho.
      const lleva = (k: number) => `translate(${e.pecho.x - PECHO_DEL_AVE.x * k} ${e.pecho.y - PECHO_DEL_AVE.y * k}) scale(${k})`;
      ave.setAttribute("transform", lleva(e.k));
      silueta.setAttribute("transform", lleva(Math.max(e.kVentana, 1e-6)));
      silueta.style.visibility = e.kVentana > 0 ? "visible" : "hidden";
      velo.style.opacity = String(e.velo);
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [entrada]);

  // El ave nace en la pose del logo y exactamente donde está el del login (el primer cuadro la mueve; sin movimiento, así queda).
  const [alaInicial, alaBajoInicial] = alaDelAve(0, 1);
  const e0 = estadoDeLaEntrada(0, 0, { origen: entrada.origen, ancho: window.innerWidth, alto: window.innerHeight });
  const aveInicial = `translate(${e0.pecho.x - PECHO_DEL_AVE.x * e0.k} ${e0.pecho.y - PECHO_DEL_AVE.y * e0.k}) scale(${e0.k})`;

  return (
    <div className="entrada-colibri" aria-hidden>
      <svg ref={lienzoRef}>
        <defs>
          {/* Una máscara solo mide luz: lo claro tapa con el velo y lo oscuro lo deja abierto. Por eso aquí sí van blanco y negro. */}
          <mask id={mascaraId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="white" /> {/* tema-fijo: una máscara SVG solo mide luz */}
            <g ref={siluetaRef} fill="black" style={{ visibility: "hidden" }}> {/* tema-fijo: una máscara SVG solo mide luz */}
              <path ref={siluetaAlaRef} d={`${alaInicial} Z`} />
              <path d={CABEZA_DEL_AVE} />
            </g>
          </mask>
        </defs>
        <rect ref={veloRef} className="entrada-velo" width="100%" height="100%" mask={`url(#${mascaraId})`} style={{ opacity: 0 }} />
        <g ref={aveRef} className="entrada-ave" transform={aveInicial}>
          <path ref={alaRef} d={alaInicial} />
          <path ref={alaBajoRef} d={alaBajoInicial} />
          <path d={TRAZOS_DEL_AVE[2]} />
          <path d={TRAZOS_DEL_AVE[3]} />
        </g>
      </svg>
    </div>
  );
}
