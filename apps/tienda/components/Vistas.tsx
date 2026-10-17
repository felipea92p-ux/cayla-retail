"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { claveDeVista } from "@/lib/esqueleto";

/**
 * El fundido entre vistas (2026-10-17, Felipe: «cuando cambia de vista es muy abrupto»). Next navega dentro de una transición de React;
 * si en ella aparece o se va un `<ViewTransition>`, React le pide al navegador una transición de vista y la pantalla se funde de la
 * página de antes a la que llega (o a su esqueleto, y del esqueleto al contenido), en vez de cambiar de golpe en un cuadro. La cabecera,
 * la franja de anuncios y la de las tiendas quedan quietas (`vistas.css`). Esta marca es un punto de 1 px que no se ve: lo único que
 * hace es decirle a React «esta es otra vista». Su clave (`claveDeVista`) cambia con la página, la lista o el menú, no con un filtro: un
 * filtro apaga la lista mientras llega la nueva y no funde toda la pantalla. Sin soporte del navegador, nada cambia: se ve como antes.
 *
 * Va ANTES de cualquier elemento de la vista (lo primero que dibuja `MarcoCatalogo`, `MarcoCuenta` y el esqueleto): React solo anima la
 * entrada o la salida de una `<ViewTransition>` que no tiene ningún elemento encima en lo que aparece o se va. Dentro de `<main>` no
 * contaba, y la pantalla cambiaba de golpe al pasar a otra sección.
 */
export function MarcaDeVista() {
  return (
    <Suspense fallback={null}>
      <MarcaConClave />
    </Suspense>
  );
}

function MarcaConClave() {
  const clave = claveDeVista(usePathname() ?? "", new URLSearchParams(useSearchParams().toString()));
  return <Marca key={clave} />;
}

/** La del esqueleto: siempre nueva (el esqueleto solo sale al llegar a otra página). */
export function MarcaDeEspera() {
  return <Marca />;
}

function Marca() {
  return (
    <ViewTransition enter="t-vista" exit="t-vista" update="none" default="none">
      <span className="t-vista-marca" aria-hidden="true" />
    </ViewTransition>
  );
}

/**
 * La foto de una prenda que viaja (2026-10-17): al tocar una tarjeta, su foto vuela a donde va la foto grande de la ficha (primero la
 * del esqueleto, después la de la ficha). Las tres llevan el mismo nombre de transición en su estilo: la tarjeta, recién al tocarla
 * (`RecordarPrendaTocada`, y se le quita al rato); la foto grande de la ficha y la de su esqueleto, siempre. El navegador junta las dos
 * que tienen el mismo nombre en la vista de antes y en la que llega. Solo una foto a la vista lleva cada nombre.
 */
export const nombreDeFoto = (id: string) => `t-foto-${id.toLowerCase()}`;

/** El estilo con el nombre de la foto de una prenda (la foto grande de la ficha y la de su esqueleto). */
export const fotoQueViaja = (id: string): React.CSSProperties => ({ viewTransitionName: nombreDeFoto(id), viewTransitionClass: "t-viaja" });
