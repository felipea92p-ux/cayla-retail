import "server-only";
import { fotoOptimizable } from "./catalogo";
import { leerCatalogo } from "./catalogo-servidor";
import { armarProbador, type PrendaDelProbador } from "./probador";
import { leerProbador } from "./probador-servidor";
import { sedesEnOrden } from "./sede-elegida";
import { leerSedes } from "./tiendas-servidor";

/**
 * Las prendas del probador de todas las tiendas de la web (ADR-0434, actividad 9), para lo que se comparte: la página pública del look
 * y sus dos imágenes no eligen tienda (no muestran precio ni cuánto hay). Las mismas lecturas guardadas del catálogo y del probador.
 * null si la base no contestó.
 */
export async function prendasParaCompartir(): Promise<PrendaDelProbador[] | null> {
  const [catalogo, lectura, sedes] = await Promise.all([leerCatalogo(null), leerProbador(null), leerSedes()]);
  if (!catalogo || !lectura) return null;
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  return armarProbador(catalogo.prendas, lectura, { elegida: null, tiendas: sedesEnOrden(sedes), optimizable: (url) => fotoOptimizable(url, origenFotos) });
}
