"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { letrasDelTitulo, RITMO, salidaTexto, siguienteSalida, type PiezaDelDesfile } from "@/lib/desfile";
import { FotoTarjeta } from "../FotoTarjeta";
import "@/app/estilos/desfile.css";

// El escenario del desfile (ADR-0524, «G · Pasarela»): un escenario negro con un círculo de luz; cada prenda de «Lo nuevo» entra desde la derecha hacia la
// luz, estalla el flash y sale por la izquierda; el programa dice cuál va. Es la única pieza de la tienda que corre en bucle, por decisión de Felipe
// (2026-10-26; la regla general es «una vez, sin bucle», ADR-0430): por eso se puede pausar, se detiene cuando sale de la pantalla o la pestaña
// está oculta, y con «reducir movimiento» no corre —queda una prenda quieta y el programa deja elegir cuál—. La primera prenda ya está en la luz al
// cargar: la portada no espera al desfile para tener su foto.

type Props = {
  piezas: PiezaDelDesfile[];
  /** «portada»: es el título de la página (h1). «seccion»: va debajo de la portada de una campaña (h2). */
  modo: "portada" | "seccion";
  ceja: string;
  titulo: string;
  /** El botón de la leyenda: a dónde lleva (null mientras la página aún no llega: se dibuja igual, sin ir a ningún lado). */
  boton: { texto: string; href: string | null };
  /** El esqueleto del Inicio: el mismo escenario y el mismo título, sin prendas ni enlaces. */
  enEspera?: boolean;
};

export function EscenarioDelDesfile({ piezas, modo, ceja, titulo, boton, enEspera = false }: Props) {
  const n = piezas.length;
  const caja = useRef<HTMLElement>(null);
  const [actual, setActual] = useState(0);
  const [arrancado, setArrancado] = useState(false);
  const [pausado, setPausado] = useState(false);
  // null hasta saber si la persona pidió «reducir movimiento»: hasta entonces no arranca nada.
  const [calma, setCalma] = useState<boolean | null>(null);
  const pausa = useRef(false);
  const aLaVista = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const leer = () => setCalma(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);

  const alternar = useCallback(() => {
    pausa.current = !pausa.current;
    setPausado(pausa.current);
  }, []);

  useEffect(() => {
    const escenario = caja.current;
    if (calma !== false || enEspera || n < 2 || !escenario) return;
    const modelos = [...escenario.querySelectorAll<HTMLElement>("[data-modelo]")];
    const flash = escenario.querySelector<HTMLElement>("[data-flash]");
    const viva = { v: true };
    const espera = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    const io = new IntersectionObserver((es) => (aLaVista.current = es[0]?.isIntersecting ?? true), { threshold: 0.2 });
    io.observe(escenario);
    // Quieto mientras está en pausa, fuera de la pantalla o con la pestaña oculta: nadie ve el desfile, no hay por qué moverlo.
    const vigilar = async () => {
      while (viva.v && (pausa.current || !aLaVista.current || document.hidden)) await espera(RITMO.vigilia);
    };
    (async () => {
      try {
        let i = 0;
        let primera = true;
        while (viva.v) {
          await vigilar();
          if (!viva.v) return;
          const m = modelos[i];
          const ancho = escenario.clientWidth * 0.62;
          setActual(i);
          if (primera) {
            // La primera ya está en la luz: se queda un momento y se va.
            await espera(RITMO.primera);
            primera = false;
            setArrancado(true);
          } else {
            await m.animate(
              [
                { transform: `translateX(${ancho}px) scale(.8)`, opacity: 0 },
                { transform: `translateX(${ancho * 0.45}px) scale(.88)`, opacity: 1, offset: 0.35 },
                { transform: "translateX(0) scale(1)", opacity: 1 },
              ],
              { duration: RITMO.entra, easing: "cubic-bezier(.25,.6,.3,1)", fill: "forwards" },
            ).finished;
            flash?.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.12 }, { opacity: 0 }], { duration: RITMO.flash, easing: "ease-out" });
            await espera(RITMO.queda);
          }
          await vigilar();
          if (!viva.v) return;
          await m.animate(
            [
              { transform: "translateX(0) scale(1)", opacity: 1 },
              { transform: `translateX(${-ancho}px) scale(.82)`, opacity: 0 },
            ],
            { duration: RITMO.sale, easing: "cubic-bezier(.6,0,.75,.4)", fill: "forwards" },
          ).finished;
          // Ya se fue (opacidad 0): se sueltan sus animaciones para que no se amontonen vuelta tras vuelta.
          m.getAnimations().forEach((a) => a.cancel());
          i = siguienteSalida(i, n);
        }
      } catch {
        // Una animación cancelada (la pantalla cambió o «reducir movimiento» se prendió) corta el desfile sin ruido.
      }
    })();
    return () => {
      viva.v = false;
      io.disconnect();
      modelos.forEach((m) => m.getAnimations().forEach((a) => a.cancel()));
    };
  }, [calma, enEspera, n]);

  const en = enEspera ? null : (piezas[actual] ?? piezas[0] ?? null);
  const conPrendas = en !== null;
  const palabras = letrasDelTitulo(titulo);
  const Titulo = modo === "portada" ? "h1" : "h2";
  // La prenda a la vista: con «reducir movimiento», la elegida en el programa; si no, la primera hasta que arranca, y luego ninguna (cada una
  // se pinta con su animación).
  const quieta = (i: number) => (calma ? i === actual : !arrancado && i === 0);

  return (
    <section ref={caja} className="t-escenario" data-modo={modo} data-sin-prendas={conPrendas || enEspera ? undefined : ""} data-espera={enEspera ? "" : undefined} aria-label={conPrendas ? "Desfile de lo nuevo" : undefined}>
      <div className="t-escenario-cab t-cap">
        <span className="t-entra">{ceja}</span>
        {en && n > 1 && (
          <span className="t-entra" style={{ "--s": 1 } as React.CSSProperties}>
            <span>{en.salida}</span> / {salidaTexto(n)}
          </span>
        )}
      </div>
      <div className="t-escena">
        <Titulo className="t-escena-tit" aria-label={titulo}>
          {palabras.map((p, k) => (
            // El espacio va fuera de la palabra: dentro de un `inline-block` se lo come y las palabras quedan pegadas si caben en un renglón.
            <Fragment key={k}>
              <span className="t-palabra" aria-hidden="true">
                {p.letras.map((l) => (
                  <span key={l.n} className="t-letra" style={{ "--l": l.n } as React.CSSProperties}>
                    {l.c}
                  </span>
                ))}
              </span>
              {k < palabras.length - 1 ? " " : ""}
            </Fragment>
          ))}
        </Titulo>
        {(conPrendas || enEspera) && <i className="t-luz" aria-hidden="true" />}
        {conPrendas &&
          piezas.map((p, i) => (
            <figure key={p.id} className={`t-modelo${quieta(i) ? " quieta" : ""}`} data-modelo={i} aria-hidden={i === actual ? undefined : true}>
              <FotoTarjeta foto={p.foto} segunda={null} optimizar={[p.optimizar, false]} nombre={p.nombre} forma={p.forma} color={p.color} tamanos="(min-width: 960px) 520px, 80vw" pronto={i === 0} />
            </figure>
          ))}
        {conPrendas && <i className="t-flash" data-flash aria-hidden="true" />}
      </div>
      <div className="t-pie-escena">
        {en && n > 1 && calma === false ? (
          <button type="button" className="t-pausa t-cap t-entra" style={{ "--s": 2 } as React.CSSProperties} aria-pressed={pausado} onClick={alternar}>
            {pausado ? "Seguir el desfile" : "Pausar el desfile"}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="t-leyenda t-entra" style={{ "--s": 3 } as React.CSSProperties}>
          {en && (
            <>
              <span className="t-cap t-leyenda-precio">
                Salida {en.salida} · {en.anterior && <s>{en.anterior}</s>}
                <b className="num">{en.precio}</b>
              </span>
              <Link
                className="t-leyenda-nombre"
                href={en.href}
                data-prenda={en.id}
                data-nombre={en.datos.nombre}
                data-precio={en.datos.precio}
                data-antes={en.datos.antes}
                data-oferta={en.datos.oferta}
                data-categoria={en.datos.categoria}
              >
                {en.nombre}
              </Link>
            </>
          )}
          <div className="t-leyenda-acciones">
            {enEspera || !boton.href ? (
              <span className="t-btn" aria-hidden="true">
                {boton.texto}
              </span>
            ) : (
              <Link className="t-btn" href={boton.href}>
                {boton.texto}
              </Link>
            )}
          </div>
        </div>
        {en && n > 1 ? (
          <ol className="t-programa t-cap t-entra" style={{ "--s": 4 } as React.CSSProperties} aria-label="Programa del desfile">
            {piezas.map((p, i) => (
              <li key={p.id} className={i === actual ? "ahora" : undefined}>
                {calma ? (
                  <button type="button" onClick={() => setActual(i)} aria-current={i === actual ? "true" : undefined}>
                    <span>{p.salida}</span>
                    <span>{p.nombre}</span>
                  </button>
                ) : (
                  <>
                    <span>{p.salida}</span>
                    <span>{p.nombre}</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </section>
  );
}
