import Link from "next/link";
import { hrefDelProbador, type Look, type PrendaDelProbador } from "@/lib/probador";
import { Icono } from "../Icono";
import { FiguraQuieta } from "./FiguraQuieta";

/**
 * La entrada a «Arma el tuyo» desde «Arma tu look» (ADR-0434, actividad 10; lienzo v3, «la idea en una lámina»): arriba de los looks de
 * CAYLA, una tarjeta con el probador abierto en lo primero que hay en la tienda elegida (la misma figura quieta, con prendas de verdad) y
 * «Abrir el probador». Toda la tarjeta lleva ahí.
 */
export function EntradaProbador({ look, indice, sede }: { look: Look; indice: ReadonlyMap<string, PrendaDelProbador>; sede: string | null }) {
  return (
    <Link className="ae" href={hrefDelProbador(sede)}>
      <span className="ae-txt">
        <span className="t-ceja">Nuevo · el probador</span>
        <span className="ae-titulo">
          Arma el <em>tuyo</em>
        </span>
        <span className="ae-bajada">Combina prendas que hay en tu tienda, míralas juntas a su tamaño y lleva el look entero de una vez.</span>
      </span>
      {/* En el celular, a lo ancho bajo el texto y la figura; en la computadora, bajo el texto. */}
      <span className="t-btn ae-btn">
        Abrir el probador <Icono nombre="flecha" />
      </span>
      <span className="ae-figura">
        <FiguraQuieta look={look} indice={indice} ancho={280} pronto />
      </span>
    </Link>
  );
}
