"use client";

import { usePathname } from "next/navigation";
import { Suspense, useLayoutEffect } from "react";
import { formaDeLaRuta, type FormaEsqueleto } from "@/lib/esqueleto";
import { Icono } from "./Icono";

/**
 * Lo que brilla mientras llega una página (lo arma `EsqueletoDePagina`, debajo de la cabecera). Sin `forma`, la saca de la dirección a
 * la que se va (`formaDeLaRuta`): el esqueleto del catálogo cubre el Inicio, la lista y la ficha, y al tocar una prenda desde el Inicio
 * tiene que anunciar una ficha, no una grilla. Cada forma usa las MISMAS clases de su página (`.t-pdp`, `.t-galeria`, `.pf-perfil`…):
 * la foto, el título y los botones caen donde van a caer y nada salta al llegar.
 */
export function FormaDelEsqueleto({ forma }: { forma?: FormaEsqueleto }) {
  // Leer la dirección en una página que se arma por adelantado (una ficha cuyo id aún no se sabe) frena el armado: se lee en su propio
  // <Suspense>, con la grilla mientras tanto (ADR-0432). Con la forma dicha de antemano no se lee nada.
  if (forma) return <FormaDicha la={forma} />;
  return (
    <Suspense fallback={<FormaDicha la="grilla" />}>
      <FormaSegunLaRuta />
    </Suspense>
  );
}

function FormaSegunLaRuta() {
  const ruta = usePathname();
  return <FormaDicha la={formaDeLaRuta(ruta ?? "")} />;
}

function FormaDicha({ la }: { la: FormaEsqueleto }) {
  // La página que viene empieza arriba. Next sube la página al llegar a otra, pero con el esqueleto propio de la ficha (un segmento
  // adentro del catálogo) dejaba de hacerlo: tocada una prenda de abajo del Inicio o de «Mi perfil», la ficha llegaba con la página
  // bajada, sin la cabecera ni la foto. El esqueleto solo sale al ir a otra página (cambiar la tienda o el color de una ficha no lo
  // muestra), así que subir aquí no le quita a nadie su lugar. Antes de pintar: no se ve el salto.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <>
      {/* La franja «Ver lo que hay en» de las páginas del catálogo: su alto, para que la página no baje al llegar. */}
      {(la === "grilla" || la === "ficha") && (
        <div className="t-ubic t-esqueleto-ubic" aria-hidden="true">
          <Icono nombre="tienda" />
          <span className="t-pildoras-tienda">
            {[56, 72, 50, 64].map((ancho) => (
              <i key={ancho} className="t-pildora-mini" style={{ width: ancho }} />
            ))}
          </span>
        </div>
      )}
      <div className="t-ancho t-esqueleto" data-forma={la} role="status">
        <span className="t-solo-lector">Cargando…</span>
        {la === "ficha" ? <Ficha /> : la === "perfil" ? <Perfil /> : la === "lista" ? <Lista /> : <Grilla />}
      </div>
    </>
  );
}

function Grilla() {
  return (
    <div className="t-grilla" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="t-card">
          <div className="t-card-foto" />
          <div className="t-esqueleto-linea" />
          <div className="t-esqueleto-linea" />
        </div>
      ))}
    </div>
  );
}

function Lista() {
  return (
    <div className="t-esqueleto-lista" aria-hidden="true">
      <div className="t-esqueleto-titulo" />
      {Array.from({ length: 4 }, (_, i) => (
        <Fila key={i} />
      ))}
    </div>
  );
}

function Fila() {
  return (
    <div className="t-esqueleto-fila">
      <div className="t-card-foto" />
      <div>
        <div className="t-esqueleto-linea" />
        <div className="t-esqueleto-linea" />
      </div>
    </div>
  );
}

/** La ficha de una prenda (`FichaPrenda`): la ruta, las fotos (en la computadora, la primera grande y dos debajo) y a su lado el nombre,
 *  el precio, los colores, las tallas y el botón (en el celular, en la barra de abajo). */
function Ficha() {
  return (
    <div aria-hidden="true">
      <div className="t-ruta">
        <i className="t-esqueleto-linea t-esq-ruta" />
      </div>
      <div className="t-pdp">
        <div>
          <div className="t-galeria">
            <div className="t-foto-g" />
            <div className="t-foto-g" />
            <div className="t-foto-g" />
          </div>
        </div>
        <div className="t-pdp-info">
          <div className="cp-pdp-cab">
            <i className="t-esq-chip" />
            <i className="t-esq-titulo" />
            <i className="t-esq-titulo corto" />
          </div>
          <i className="t-esq-precio" />
          <div className="t-bloque">
            <i className="t-esqueleto-linea t-esq-etq" />
            <div className="t-swatches">
              {Array.from({ length: 4 }, (_, i) => (
                <i key={i} className="t-esq-swatch" />
              ))}
            </div>
          </div>
          <div className="t-bloque">
            <i className="t-esqueleto-linea t-esq-etq" />
            <div className="t-tallas">
              {Array.from({ length: 5 }, (_, i) => (
                <i key={i} className="t-esq-talla" />
              ))}
            </div>
          </div>
          <i className="t-esq-boton" />
        </div>
      </div>
      {/* En el celular, el botón vive en la barra de abajo (`.t-pdp-barra`): la que brilla, en el mismo lugar. */}
      <div className="t-pdp-barra">
        <div className="t-esq-barra">
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

/** «Mi perfil» (`app/cuenta/page.tsx`): el saludo, los cuatro cuadros y sus dos primeras secciones (los pedidos y el Club, con su
 *  tarjeta), lado a lado en una pantalla ancha como en la página. */
function Perfil() {
  return (
    <div className="pf-perfil" aria-hidden="true">
      <div className="pf-cab">
        <i className="t-esqueleto-linea pf-esq-ceja" />
        <i className="pf-esq-hola" />
        <i className="t-esqueleto-linea pf-esq-linea" />
      </div>
      <div className="pf-atajos">
        <ul>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <div className="pf-atajo pf-esq-atajo">
                <i className="pf-atajo-ic" />
                <span className="pf-atajo-txt">
                  <i className="t-esqueleto-linea" />
                  <i className="t-esqueleto-linea" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="pf-cuerpo">
        <div className="pf-sec" data-mitad="">
          <i className="t-esqueleto-titulo" />
          <Fila />
        </div>
        <div className="pf-sec" data-mitad="">
          <i className="t-esqueleto-titulo" />
          <div className="pf-club">
            <div className="pf-club-fila">
              <i className="pf-esq-tarjeta" />
              <div className="pf-beneficios">
                <i className="pf-esq-beneficio" />
                <i className="pf-esq-beneficio" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
