"use server";

import { esIdDePrenda, tallasRapidas, type TallaRapida } from "@/lib/ficha";
import { leerFicha } from "@/lib/ficha-servidor";
import { sedeDeLaUrl } from "@/lib/sede-elegida";
import { leerSesion } from "@/lib/sesion-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";

// El «Agregar» rápido de la tarjeta (ADR-0408, actividad 7; maqueta v4, `rapidoHTML`). El catálogo no trae las tallas de cada modelo
// (y no se le cambia la forma: lo leen el Inicio, las listas, los looks y la cabecera), así que la tarjeta las pide recién cuando el
// mouse se queda sobre ella: esta acción lee la FICHA de ese modelo en la tienda elegida (`tienda_ficha`, la misma de la página de la
// prenda) y devuelve las tallas del primer color que tiene algo, cada una con su prenda. Solo lee: agregar lo hace `agregarALaBolsa`,
// que vuelve a preguntarle a la base. Sin sesión, o si la base no contesta, no hay «Agregar» (la tarjeta sigue llevando a la ficha).

export type Rapido = { sedeId: string | null; tallas: TallaRapida[] };

/** Las tallas del «Agregar» rápido de un modelo. `sede`: la clave de la tienda elegida (`?sede=trujillo`), o null con «Todas». */
export async function tallasParaAgregar(productoId: unknown, sede: unknown): Promise<Rapido | null> {
  if (typeof productoId !== "string" || !esIdDePrenda(productoId)) return null;
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return null;
  const elegida = typeof sede === "string" ? sedeDeLaUrl(sede, await leerSedes()) : null;
  const ficha = await leerFicha(productoId, elegida?.id ?? null);
  if (!ficha || ficha === "no_esta") return null;
  return { sedeId: ficha.sede, tallas: tallasRapidas(ficha, ficha.sede) };
}
