"use client";

/**
 * La entrada y la salida del ERP: «el colibrí se abre» (Felipe 2026-10-13; maqueta `docs/maquetas/login-entrada-2026-10/`; la salida es la B).
 *
 * Una capa a pantalla completa, montada UNA vez en el layout raíz (como el loader, ADR-0149) para que no se pierda cuando la página cambia.
 *
 * ENTRAR (al iniciar sesión): el fondo se oscurece, el colibrí del login cruza al centro y flota mientras la pantalla de destino carga debajo; cuando está
 * lista, en el centro se abre una ventana CON LA FORMA DEL COLIBRÍ que deja ver esa pantalla de verdad (un agujero en el velo oscuro, no un dibujo), y el ave
 * se agranda hasta salirse y la ventana cubre todo. «Debajo» de verdad: la pantalla de destino se pide de inmediato pero no se muestra hasta que esta
 * capa avisa que el velo ya tapa la pantalla (`marcarVeloCubierto` → `EsperaAlVelo`, ADR-0136 act. 2026-10-13 (e)); antes se alcanzaba a ver a través
 * del velo todavía transparente.
 * SALIR (al apretar Salir): lo mismo al revés y más rápido: la ventana, que cubre la pantalla que se deja, se encoge sobre el colibrí; con la ventana
 * cerrada y el fondo oscuro, el colibrí flota en el centro mientras se cierra la sesión y carga el login (`alLlegarAlCentro`); cuando el login está
 * listo, el colibrí vuela a su lugar (se mide en ese momento) y el fondo oscuro se va.
 *
 * Una sola vez, sin rebote ni bucle (ADR-0136 act. 2026-10-13 (b) y (c)); con `prefers-reduced-motion` ni empieza (`iniciarEntrada`/`iniciarSalida`).
 * La geometría y la línea de tiempo viven en `lib/login-entrada.ts`; el aleteo, en `lib/login-vuelo.ts`; los estilos, en `login.css`.
 */

import { use, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { esperaOcupada } from "@/lib/espera-estado";
import {
  entradaEnCurso,
  marcarVeloCubierto,
  medirAveDelLogin,
  suscribirEntrada,
  terminarEntrada,
  veloPendiente,
  type EntradaEnCurso,
} from "@/lib/entrada-estado";
import {
  CABEZA_DEL_AVE,
  LIENZO_DEL_AVE,
  MS_DE_LA_SALIDA_EN_EL_CENTRO,
  PECHO_DEL_AVE,
  TOPE_DE_ESPERA,
  debeCancelarse,
  estadoDeLaEntrada,
  estadoDeLaSalida,
  geometriaDeLaEntrada,
  instanteParaSeguir,
  msCorridosDeLaSalida,
  msDelVuelo,
  opacidadDelSaludo,
  revisarLaPantalla,
  veloCubre,
  type Caja,
} from "@/lib/login-entrada";
import { TRAZOS_DEL_AVE, alaDelAve } from "@/lib/login-vuelo";

export function EntradaColibri() {
  const entrada = useSyncExternalStore(suscribirEntrada, entradaEnCurso, () => null);
  return entrada ? <Vuelo key={entrada.id} entrada={entrada} /> : null;
}

/**
 * La app recién abierta no se muestra hasta que el velo de la entrada tape la pantalla (Felipe 2026-10-13: «se ve el inicio» antes de que el colibrí lo
 * abra). Va UNA vez, en el layout de la app (`app/(app)/layout.tsx`), por encima de todo `loading.tsx`: mientras el velo no tapa, suspende, y como la
 * navegación del login es una transición, React deja el login a la vista y no cambia nada todavía. La pantalla de destino se pide al servidor igual de
 * inmediato y carga en paralelo con el vuelo: la entrada no se alarga. Sin entrada en curso (recargar, navegar, menos movimiento) no hace nada; la
 * espera se suelta sola al tope (`MS_TOPE_DEL_VELO`), así que nunca retiene la app más que eso.
 */
export function EsperaAlVelo() {
  const pendiente = veloPendiente();
  if (pendiente) use(pendiente);
  return null;
}

/** Cuánto tarda en irse el velo si el vuelo se deshace (no se corta de golpe). */
const MS_SALIDA_DEL_VELO = 300;

function Vuelo({ entrada }: { entrada: EntradaEnCurso }) {
  const mascaraId = `entrada-${useId().replace(/:/g, "")}`;
  const lienzoRef = useRef<SVGSVGElement>(null);
  const veloRef = useRef<SVGRectElement>(null);
  const siluetaRef = useRef<SVGGElement>(null);
  const siluetaAlaRef = useRef<SVGPathElement>(null);
  const aveRef = useRef<SVGGElement>(null);
  const alaRef = useRef<SVGPathElement>(null);
  const alaBajoRef = useRef<SVGPathElement>(null);
  const saludoRef = useRef<HTMLParagraphElement>(null);
  const fraseRef = useRef<HTMLSpanElement>(null);
  const nombreRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const lienzo = lienzoRef.current;
    const velo = veloRef.current;
    const silueta = siluetaRef.current;
    const siluetaAla = siluetaAlaRef.current;
    const ave = aveRef.current;
    const ala = alaRef.current;
    const alaBajo = alaBajoRef.current;
    const saludo = saludoRef.current;
    const frase = fraseRef.current;
    const nombre = nombreRef.current;
    if (!lienzo || !velo || !silueta || !siluetaAla || !ave || !ala || !alaBajo || !saludo || !frase || !nombre) return;

    const saliendo = entrada.modo === "salir";
    let cuadro = 0;
    let inicio: number | null = null;
    let listoEn: number | null = null;
    let libreDesde: number | null = null;
    let deshaciendoDesde: number | null = null;
    let lista = false;
    let cerrando = false;
    let fallo = false;
    let origen: Caja = entrada.origen; // en la salida se reemplaza por el lugar real cuando el login carga

    const paso = (ahora: number) => {
      inicio ??= ahora;
      const ms = ahora - inicio;

      // Deshacer: la entrada, si te devolvieron al login con un motivo o la pantalla tardó demasiado; la salida, si no se pudo cerrar la sesión o el login tardó.
      if (deshaciendoDesde === null) {
        const deshacer = saliendo ? fallo || (ms > TOPE_DE_ESPERA && !lista) : debeCancelarse({ ruta: location.pathname, busqueda: location.search }, ms, lista);
        if (deshacer) deshaciendoDesde = ms;
      }
      if (deshaciendoDesde !== null) {
        const t = (ms - deshaciendoDesde) / MS_SALIDA_DEL_VELO;
        lienzo.style.opacity = String(Math.max(0, 1 - t));
        saludo.style.opacity = "0";
        if (t >= 1) return terminarEntrada();
        cuadro = requestAnimationFrame(paso);
        return;
      }

      // La salida: con la ventana ya cerrada se cierra la sesión (y se navega al login) UNA vez; si falla, no pasó nada y se deshace.
      if (saliendo && !cerrando && ms >= MS_DE_LA_SALIDA_EN_EL_CENTRO) {
        cerrando = true;
        entrada.alLlegarAlCentro?.().catch(() => {
          fallo = true;
        });
      }

      // ¿Ya cargó la pantalla de destino? Mientras no, el ave flota en el centro y no sigue.
      if (listoEn === null && (!saliendo || cerrando)) {
        const revision = revisarLaPantalla({ ruta: location.pathname, ocupada: esperaOcupada() }, libreDesde, ms, saliendo ? entrada.rutaEsperada : undefined);
        libreDesde = revision.libreDesde;
        if (revision.lista) {
          // En la salida, el login ya está: se mide dónde quedó su colibrí y ahí aterriza. Sin colibrí a la vista no hay dónde: se deshace.
          const real = saliendo ? medirAveDelLogin() : origen;
          if (!real) fallo = true;
          else {
            origen = real;
            lista = true;
            // Aunque la pantalla ya esté lista, el colibrí flota un mínimo en el centro para que el saludo alcance a leerse.
            listoEn = instanteParaSeguir(ms, entrada.modo);
          }
        }
      }

      const medidas = { origen, ancho: window.innerWidth, alto: window.innerHeight };
      const vms = msDelVuelo(ms, listoEn);
      const e = saliendo ? estadoDeLaSalida(ms, listoEn, medidas) : estadoDeLaEntrada(vms, ms, medidas);
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
      // Con el velo ya tapando la pantalla, la de destino puede mostrarse (`EsperaAlVelo`, Felipe 2026-10-13): debajo, y solo se ve por la ventana.
      if (!saliendo && veloCubre(vms)) marcarVeloCubierto(entrada.id);

      // El saludo (diseño B): bajo el colibrí cuando flota en el centro; asoma al llegar, se queda mientras espera y se va cuando el vuelo sigue.
      const g = geometriaDeLaEntrada(medidas);
      saludo.style.top = `${window.innerHeight / 2 + (LIENZO_DEL_AVE.alto - PECHO_DEL_AVE.y) * g.k0 * g.escalaAlFlotar + 30}px`;
      saludo.style.opacity = String(opacidadDelSaludo(entrada.modo, saliendo ? msCorridosDeLaSalida(ms, listoEn) : msDelVuelo(ms, listoEn)));
      if (frase.textContent !== entrada.saludo.frase) frase.textContent = entrada.saludo.frase;
      const textoNombre = entrada.saludo.nombre ?? "";
      if (nombre.textContent !== textoNombre) nombre.textContent = textoNombre;
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [entrada]);

  // Primer cuadro, ya puesto: la entrada nace con el ave en el lugar del login y sin ventana; la salida, con la ventana cubriendo toda la pantalla
  // (y el ave afuera). Sin esto, un cuadro saldría con el dibujo sin mover.
  const medidasIniciales = { origen: entrada.origen, ancho: window.innerWidth, alto: window.innerHeight };
  const e0 = entrada.modo === "salir" ? estadoDeLaSalida(0, null, medidasIniciales) : estadoDeLaEntrada(0, 0, medidasIniciales);
  const lleva0 = (k: number) => `translate(${e0.pecho.x - PECHO_DEL_AVE.x * k} ${e0.pecho.y - PECHO_DEL_AVE.y * k}) scale(${k})`;
  const [alaInicial, alaBajoInicial] = alaDelAve(0, 1);

  return (
    <div className="entrada-colibri" aria-hidden>
      {/* El saludo se escribe con textContent (nunca como HTML): el nombre viene de la base. */}
      <p ref={saludoRef} className="entrada-saludo" style={{ opacity: 0 }}>
        <span ref={fraseRef} className="entrada-saludo-frase" />
        <em ref={nombreRef} className="entrada-saludo-nombre" />
      </p>
      <svg ref={lienzoRef}>
        <defs>
          {/* Una máscara solo mide luz: lo claro tapa con el velo y lo oscuro lo deja abierto. Por eso aquí sí van blanco y negro. */}
          <mask id={mascaraId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="white" /> {/* tema-fijo: una máscara SVG solo mide luz */}
            <g ref={siluetaRef} fill="black" transform={lleva0(Math.max(e0.kVentana, 1e-6))} style={{ visibility: e0.kVentana > 0 ? "visible" : "hidden" }}> {/* tema-fijo: una máscara SVG solo mide luz */}
              <path ref={siluetaAlaRef} d={`${alaInicial} Z`} />
              <path d={CABEZA_DEL_AVE} />
            </g>
          </mask>
        </defs>
        <rect ref={veloRef} className="entrada-velo" width="100%" height="100%" mask={`url(#${mascaraId})`} style={{ opacity: e0.velo }} />
        <g ref={aveRef} className="entrada-ave" transform={lleva0(e0.k)}>
          <path ref={alaRef} d={alaInicial} />
          <path ref={alaBajoRef} d={alaBajoInicial} />
          <path d={TRAZOS_DEL_AVE[2]} />
          <path d={TRAZOS_DEL_AVE[3]} />
        </g>
      </svg>
    </div>
  );
}
