import "server-only";
import { esIdDePrenda, tallasRapidas } from "./ficha";
import { leerFicha } from "./ficha-servidor";
import type { RespuestaRapido } from "./rapido";
import { sedeDeLaUrl } from "./sede-elegida";
import { leerSesion } from "./sesion-servidor";
import { leerSedes } from "./tiendas-servidor";

// El «Agregar» rápido de la tarjeta (ADR-0408, actividad 7; maqueta v4, `rapidoHTML`). El catálogo no trae las tallas de cada modelo
// (y no se le cambia la forma: lo leen el Inicio, las listas, los looks y la cabecera), así que la tarjeta las pide recién cuando el
// mouse se queda sobre ella: se lee la FICHA de ese modelo en la tienda elegida (`tienda_ficha`, la misma de la página de la prenda) y
// se devuelven las tallas del primer color que tiene algo, cada una con su prenda. Solo lee: agregar lo hace `agregarALaBolsa`, que
// vuelve a preguntarle a la base. Sin sesión, o si la base no contesta, no hay «Agregar» (la tarjeta sigue llevando a la ficha).

/** Las tallas del «Agregar» rápido de un modelo. `sede`: la clave de la tienda elegida (`?sede=trujillo`), o null con «Todas». */
export async function leerTallasParaAgregar(productoId: string | null, sede: string | null): Promise<RespuestaRapido> {
  if (!productoId || !esIdDePrenda(productoId)) return { estado: "no_esta" };
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") return { estado: "sin_sesion" };
  if (sesion.estado !== "con_sesion") return { estado: "sin_respuesta" };
  const elegida = sede ? sedeDeLaUrl(sede, await leerSedes()) : null;
  const ficha = await leerFicha(productoId, elegida?.id ?? null);
  if (ficha === "no_esta") return { estado: "no_esta" };
  if (!ficha) return { estado: "sin_respuesta" };
  return { estado: "ok", rapido: { sedeId: ficha.sede, tallas: tallasRapidas(ficha, ficha.sede) } };
}
