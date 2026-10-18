import { Suspense } from "react";
import { cookies } from "next/headers";
import { armarCampanita, leerDia, nombreCookieCampanita, novedadesDesde } from "@/lib/campanita";
import type { Prenda } from "@/lib/catalogo";
import { hoyLima } from "@/lib/cuentas";
import { avisosVistos, leerAvisosDelClub } from "@/lib/inicio-aviso-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { BotonCampanita } from "./BotonCampanita";
import { CampanitaApagada } from "./CampanitaApagada";

// La campanita de la cabecera (ADR-0408; Felipe, 2026-10-17), la parte de servidor: junta lo que la persona tiene a su favor en el Club (la
// talla que esperaba con «Avísame» y ya llegó: `tienda_mis_avisos_del_club`, la misma lectura del aviso al entrar, una sola por petición),
// lo que ya cerró con «Entendido» (sus cookies), y cuántas prendas de Lo nuevo llegaron desde la última vez que miró la campanita (el
// catálogo que la página ya leyó + la cookie de ESTE aparato). Todo el cálculo es de `lib/campanita.ts`.
//
// SI LA BASE NO RESPONDE: la lectura devuelve null y la campanita se dibuja sin tallas, con las novedades (que no necesitan la base). Si
// ni la sesión se pudo leer, no se dibuja y la cabecera queda como estaba. Nunca tumba la página (principio 9).

async function Campanita({ prendas, hrefNuevo }: { prendas: readonly Prenda[]; hrefNuevo: string }) {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return null;
  const cookie = nombreCookieCampanita(sesion.usuarioId);
  const [avisos, vistos, almacen] = await Promise.all([leerAvisosDelClub(sesion.usuarioId), avisosVistos(), cookies()]);
  const visto = leerDia(almacen.get(cookie)?.value);
  const datos = armarCampanita(avisos, vistos, novedadesDesde(prendas, visto, hoyLima()));
  return <BotonCampanita cookie={cookie} vistoAntes={visto !== null} datos={datos} hrefNuevo={hrefNuevo} />;
}

/**
 * La campanita lista para la cabecera: llega por detrás, sin atrasar la página (`Suspense`), y mientras tanto ocupa su lugar apagada.
 * `prendas`: lo publicado en la tienda elegida (el mismo catálogo del menú). `hrefNuevo`: a dónde lleva «Ver lo nuevo» (conserva la tienda).
 */
export function CampanitaConEspera({ prendas, hrefNuevo }: { prendas: readonly Prenda[]; hrefNuevo: string }) {
  return (
    <Suspense fallback={<CampanitaApagada />}>
      <Campanita prendas={prendas} hrefNuevo={hrefNuevo} />
    </Suspense>
  );
}
