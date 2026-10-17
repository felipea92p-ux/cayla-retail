"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cookieDelDia, etiquetaCampanita, textoGlobo, textoLlegadasMas, textoNovedades, type DatosCampanita } from "@/lib/campanita";
import { hoyLima } from "@/lib/cuentas";
import { Icono } from "../Icono";
// El globo rojo (`.t-globo`) y el panel que baja del ícono.
import "@/app/estilos/bolsa.css";
import "@/app/estilos/campanita.css";

/** Anota en ESTE aparato que hoy se miró la campanita (de ahí en adelante «nuevo» es lo que llegue después). Sin cookies, la campanita
 *  sigue funcionando y las novedades vuelven a empezar sin número. */
function anotarMirada(cookie: string) {
  try {
    document.cookie = cookieDelDia(cookie, hoyLima(), location.protocol === "https:");
  } catch {
    // El navegador no deja guardar: no pasa nada, solo no se cuenta lo nuevo.
  }
}

/**
 * La campanita de la cabecera (ADR-0408; Felipe, 2026-10-17): un botón con su globo que abre un panel con dos cosas, «la talla que
 * esperabas ya llegó» (cada una lleva a su prenda) y «lo nuevo desde tu última visita» (lleva a Lo nuevo). Es un desplegable como el
 * menú de la persona (el botón dice si está abierto; Escape y tocar fuera lo cierran), no un `role="menu"`.
 *
 * El globo suma las tallas que no cerró con «Entendido» y las prendas nuevas. Al abrir, lo nuevo se da por visto (se anota el día en la
 * cookie `cookie` y el globo baja); las tallas siguen contando mientras estén disponibles, porque son una cosa que hacer —separarla—,
 * no una noticia, y salen de la cuenta solas cuando la separa o quita el aviso. La primera vez en un aparato (`vistoAntes` falso) se
 * anota la mirada sin abrir nada: así lo que llegue desde mañana sí se cuenta, sin inventar un número de lo que ya estaba.
 */
export function BotonCampanita({
  cookie,
  vistoAntes,
  datos,
  hrefNuevo,
}: {
  /** El nombre de la cookie de esta persona (`nombreCookieCampanita`). */
  cookie: string;
  /** ¿Ya había mirado la campanita antes en este aparato? */
  vistoAntes: boolean;
  datos: DatosCampanita;
  hrefNuevo: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [miradoAhora, setMiradoAhora] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const idPanel = useId();

  useEffect(() => {
    if (!vistoAntes) anotarMirada(cookie);
  }, [vistoAntes, cookie]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  function alternar() {
    if (!abierto) {
      anotarMirada(cookie);
      setMiradoAhora(true);
    }
    setAbierto((a) => !a);
  }

  // Lo nuevo ya se vio al abrir: el globo queda solo con las tallas sin ver.
  const globo = miradoAhora ? datos.globo - (datos.novedades ?? 0) : datos.globo;
  const sinTallas = datos.llegadas.length === 0;

  return (
    <div className="t-avisos" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="t-ico"
        aria-label={etiquetaCampanita(globo)}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={alternar}
      >
        <Icono nombre="campana" />
        {globo > 0 ? <span className="t-globo">{textoGlobo(globo)}</span> : null}
      </button>
      {abierto && (
        <div className="t-avisos-panel" id={idPanel} role="region" aria-label="Tus avisos">
          {!sinTallas && (
            <section>
              <h3 className="t-avisos-sub">{datos.llegadas.length + datos.llegadasMas === 1 ? "La talla que esperabas" : "Las tallas que esperabas"}</h3>
              <ul>
                {datos.llegadas.map((f) => (
                  <li key={f.clave}>
                    <Link className="t-avisos-fila" href={f.href} onClick={() => setAbierto(false)}>
                      <span className="t-avisos-ic" aria-hidden="true">
                        <Icono nombre="campana" />
                      </span>
                      <span>
                        <b>{f.titulo}</b>
                        <small>{f.texto}</small>
                      </span>
                      {f.sinVer ? <span className="t-avisos-punto" role="img" aria-label="Sin ver" /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {datos.llegadasMas > 0 && (
                <Link className="t-avisos-nota t-avisos-mas" href="/cuenta" onClick={() => setAbierto(false)}>
                  {textoLlegadasMas(datos.llegadasMas)}
                </Link>
              )}
            </section>
          )}
          <section>
            <h3 className="t-avisos-sub">Lo nuevo</h3>
            <p className="t-avisos-nota">{textoNovedades(datos.novedades)}</p>
            <Link className="t-enlace t-avisos-ver" href={hrefNuevo} onClick={() => setAbierto(false)}>
              Ver lo nuevo <Icono nombre="flecha" />
            </Link>
          </section>
          {sinTallas && (
            <p className="t-avisos-ayuda">¿Una talla agotada? Toca «Avísame» en la prenda y te lo decimos aquí apenas llegue.</p>
          )}
        </div>
      )}
    </div>
  );
}
