import "server-only";
import type { RespuestaBuscador } from "./buscador";
import { leerCatalogo } from "./catalogo-servidor";
import { indiceDelBuscador } from "./inicio";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "./sede-elegida";
import { leerSesion } from "./sesion-servidor";
import { hayEnTienda } from "./stock";
import { leerSedes } from "./tiendas-servidor";

// La lista del buscador de la cabecera (2026-10-17). Antes viajaba con CADA página con cuenta (~530 bytes por prenda: con las 298 de
// producción, unos 160 KB por navegación, aunque nadie abriera el buscador); ahora la cabecera la pide recién cuando el cliente va a
// buscar (`GET /api/buscador`). Es lo mismo que la página ya mostraba: lo publicado en la tienda elegida, de la lectura compartida del
// catálogo (`leerCatalogo`, 30 s), así que no le cuesta nada a la base. Lleva precios, que solo ve quien tiene cuenta: sin sesión no
// responde nada. No confía en lo que llega: la tienda se busca entre las de la web (`sedeDeLaUrl`), como en la página.
export async function leerIndiceDelBuscador(sede: string | null): Promise<RespuestaBuscador> {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return { estado: sesion.estado };
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sede ? sedeDeLaUrl(sede, sedes) : null;
  const catalogo = await leerCatalogo(pedida?.id ?? null);
  if (!catalogo) return { estado: "sin_respuesta" };
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base respondió con «Todas»), como el marco de cada página.
  const elegida = catalogo.sede ? sedes.find((s) => s.id === catalogo.sede) ?? null : null;
  const prendas = catalogo.prendas.filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  return { estado: "ok", indice: indiceDelBuscador(prendas, elegida ? claveDeSede(elegida.nombre) : null, process.env.TIENDA_FOTOS_ORIGEN) };
}
