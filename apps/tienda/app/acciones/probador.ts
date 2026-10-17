"use server";

import { esId } from "@/lib/bolsa";
import { tallasDelColor } from "@/lib/ficha";
import { leerFicha } from "@/lib/ficha-servidor";
import { piezasParaLasTallas, type TallasDeTuLook } from "@/lib/probador";
import { hayAlgo } from "@/lib/stock";

// Las tallas de «Arma el tuyo» (ADR-0434, actividad 6). El probador no las trae con la página (serían miles de filas para cada visita y
// solo se usan al llevar el look a la bolsa): se piden al tocar «Agregar a mi bolsa», y salen de la MISMA ficha que la tienda ya guarda
// medio minuto (`leerFicha`): las tallas que la ficha ofrece de ese color en la tienda elegida, cada una diciendo solo si hay o no en
// alguna tienda de la web (como los looks: lo que falta en la tienda de recojo se trae con un traslado). Solo lee: lo que se agrega lo
// decide la bolsa, que vuelve a preguntarle a la base.

/** Las tallas de cada prenda del look en su color. `null` si llegó algo raro o la base no responde (la barra lo dice y se vuelve a
 *  intentar); una prenda que ya no se ve en la web vuelve sin tallas (no se agrega). */
export async function tallasDeTuLook(piezas: unknown, sedeId: unknown): Promise<TallasDeTuLook | null> {
  const lista = piezasParaLasTallas(piezas);
  if (!lista) return null;
  const sede = esId(sedeId) ? sedeId : null;
  const fichas = await Promise.all(lista.map((p) => leerFicha(p.id, sede)));
  if (fichas.some((f) => f === null)) return null;
  return lista.map((p, i) => {
    const ficha = fichas[i];
    if (!ficha || ficha === "no_esta") return { ...p, tallas: [] };
    return {
      ...p,
      tallas: tallasDelColor(ficha, p.color).map(({ talla, variante }) => ({ varianteId: variante.id, talla: talla.nombre, hay: hayAlgo(variante.total) })),
    };
  });
}
