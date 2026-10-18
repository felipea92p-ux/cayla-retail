import Link from "next/link";
import { Icono } from "../Icono";
import { Isotipo } from "../Isotipo";
import { Logo } from "../Marca";
import type { TemaDeAyuda } from "./temas";
import "@/app/estilos/ayuda.css";

/**
 * La cabecera de una página que no lee la sesión (la que no está, la que falló): solo el logo, que lleva a «/» (el proxy manda al Inicio a
 * quien tiene sesión). Sin «Entrar» ni «Crear mi cuenta»: a quien ya entró le haría dudar de si salió. Y sin leer la sesión: la página
 * «no existe» de la raíz es el límite de TODAS las rutas, y leer cookies ahí volvería dinámica a toda la tienda (sesión principal,
 * 2026-10-16). `recargar`: un enlace de siempre en vez de `Link` (después de un fallo, mejor una carga nueva).
 */
export function CabeceraNeutra({ recargar = false }: { recargar?: boolean }) {
  const marca = <Logo />;
  return (
    <header className="t-cab">
      <div className="t-cab-fila">
        {recargar ? (
          // Una carga nueva a propósito: lo que falló puede seguir en la memoria de la página.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a className="t-logo" href="/" aria-label="CAYLA, ir a la tienda">
            {marca}
          </a>
        ) : (
          <Link className="t-logo" href="/" aria-label="CAYLA, ir a la tienda">
            {marca}
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * Una página que no está (o que falló), con la marca y por dónde seguir (revisión «a nivel mundial», 2026-10-16): el colibrí, la ceja,
 * el título grande con su cursiva roja, la frase en palabras de tienda y siempre una acción principal y otra al lado; en la computadora,
 * los caminos a la derecha (cada uno con lo que promete), y debajo lo que la página quiera sumar (`children`: las prendas que hay ahora).
 * Nunca un callejón sin salida. Sirve en el servidor y en el navegador (la página de error es del navegador): no lee nada.
 */
export function PorDondeSeguir({
  ceja,
  titulo,
  texto,
  acciones,
  caminos = [],
  alerta = false,
  recargar = false,
  children,
}: {
  ceja: string;
  titulo: React.ReactNode;
  texto: string;
  acciones: React.ReactNode;
  caminos?: readonly TemaDeAyuda[];
  /** La página que falló: el lector la anuncia apenas aparece. */
  alerta?: boolean;
  /** Los caminos como enlaces de siempre (una carga nueva), para después de un fallo. */
  recargar?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="t-ancho ay-sin-salida">
      <div className="ay-sin-salida-in" data-con-caminos={caminos.length > 0 ? "" : undefined}>
        <div className="ay-sin-salida-cab" role={alerta ? "alert" : undefined}>
          {/* El colibrí del logo, pintado con el rojo de la paleta: en oscuro se aclara como el resto. */}
          <Isotipo className="ay-sin-salida-colibri" />
          <span className="t-ceja">{ceja}</span>
          <h1 className="ay-titulo ay-sin-salida-t">{titulo}</h1>
          <p className="ay-bajada">{texto}</p>
          <div className="ay-sin-salida-acc">{acciones}</div>
        </div>
        {caminos.length > 0 && (
          <nav className="ay-caminos" aria-labelledby="ay-caminos-t">
            <h2 id="ay-caminos-t" className="ay-caminos-t">
              Por dónde seguir
            </h2>
            <ul>
              {caminos.map((c) => {
                const dentro = (
                  <>
                    <span className="ay-camino-ic" aria-hidden="true">
                      <Icono nombre={c.icono} />
                    </span>
                    <span className="ay-camino-tx">
                      <b>{c.titulo}</b>
                      <small>{c.texto}</small>
                    </span>
                    <Icono nombre="flecha" />
                  </>
                );
                return (
                  <li key={c.href}>
                    {recargar ? (
                      <a className="ay-camino" href={c.href}>
                        {dentro}
                      </a>
                    ) : (
                      <Link className="ay-camino" href={c.href}>
                        {dentro}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
      {children}
    </div>
  );
}
