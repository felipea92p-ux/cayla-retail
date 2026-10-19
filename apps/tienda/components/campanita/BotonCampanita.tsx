"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
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
 * Los avisos, dentro del menú de la cuenta (ADR-0408; Felipe, 2026-10-17; 2026-10-19: «las notificaciones van dentro de cuenta»): una fila «Avisos» con su número que abre un panel con dos cosas, «la talla que
 * esperabas ya llegó» (cada una lleva a su prenda) y «lo nuevo desde tu última visita» (lleva a Lo nuevo). Vive dentro del
 * menú de la persona (que se cierra con Escape y al tocar fuera); si hay algo sin ver, un punto sobre «Cuenta» lo avisa aunque el menú esté cerrado.
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
  const idPanel = useId();

  useEffect(() => {
    if (!vistoAntes) anotarMirada(cookie);
  }, [vistoAntes, cookie]);

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
    <div className="t-avisos-menu">
      <button
        type="button"
        className="t-persona-op"
        aria-label={etiquetaCampanita(globo)}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={alternar}
      >
        <Icono nombre="campana" />
        Avisos{globo > 0 ? <small className="t-persona-n"> {textoGlobo(globo)}</small> : null}
      </button>
      {/* Para el punto sobre «Cuenta» (`:has`): existe aunque el menú esté cerrado. */}
      {globo > 0 && <span data-avisos-pendientes="" hidden />}
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
          {/* Lo nuevo, en UNA línea: «3 prendas nuevas →» que lleva a Lo nuevo, o «Nada nuevo» sin enlace (antes, un título, dos líneas y un enlace). */}
          {datos.novedades ? (
            <Link className="t-avisos-lo-nuevo" href={hrefNuevo} onClick={() => setAbierto(false)}>
              {textoNovedades(datos.novedades)} <Icono nombre="flecha" />
            </Link>
          ) : (
            <p className="t-avisos-nota">{textoNovedades(datos.novedades)}</p>
          )}
        </div>
      )}
    </div>
  );
}
