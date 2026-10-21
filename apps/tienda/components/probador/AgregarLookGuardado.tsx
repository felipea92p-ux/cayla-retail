"use client";

import { useMemo } from "react";
import { indizar, type Look, type PrendaDelProbador } from "@/lib/probador";
import { AgregarTuLook } from "./AgregarTuLook";

/**
 * «Agregar el look a mi bolsa» de un look guardado: el mismo botón del probador (las tallas de cada prenda en su color, la hoja de los
 * looks y la acción de la bolsa), a lo ancho. Recibe solo las prendas del look: el índice se arma aquí, en el navegador.
 */
export function AgregarLookGuardado({
  look,
  prendas,
  sedeId,
  origenFotos,
}: {
  look: Look;
  prendas: PrendaDelProbador[];
  sedeId: string | null;
  origenFotos: string | undefined;
}) {
  const indice = useMemo(() => indizar(prendas), [prendas]);
  return <AgregarTuLook look={look} indice={indice} sedeId={sedeId} origenFotos={origenFotos} className="lg-agregar" texto="Agregar el look a mi bolsa" />;
}
