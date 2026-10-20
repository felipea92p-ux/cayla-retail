import { Suspense } from "react";
import { cookies } from "next/headers";
import { armarCampanita, leerDia, nombreCookieCampanita, NOTIFICACIONES_EN_EL_PANEL, novedadesDesde } from "@/lib/campanita";
import type { Prenda } from "@/lib/catalogo";
import { hoyLima } from "@/lib/cuentas";
import { listarAvisos, sincronizarAvisos, type EntradaAviso } from "@/lib/avisos-tienda-servidor";
import { avisosEnPanel, avisosVistos, leerAvisosDelClub, leerRespuestasDelClub } from "@/lib/inicio-aviso-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { BotonCampanita } from "./BotonCampanita";
import { CampanitaApagada } from "./CampanitaApagada";

// La campanita de la cabecera (ADR-0408; Felipe, 2026-10-17; historial y «Ver todas», 2026-10-19), la parte de servidor. Primero anota en el
// historial de la cuenta lo que hoy está a favor (tallas que llegaron y respuestas de CAYLA), con la hora en que la cuenta lo recibió; luego
// lee las 5 notificaciones más recientes y el total. Lo leído en profundidad y lo visto al abrir el panel son cookies de ESTE aparato.
//
// SI LA BASE NO RESPONDE: no se anota nada y el panel queda sin notificaciones; las novedades de Lo nuevo se ven igual. Si ni la sesión
// se pudo leer, no se dibuja la campanita. Nunca tumba la página (principio 9).

async function Campanita({ prendas, hrefNuevo }: { prendas: readonly Prenda[]; hrefNuevo: string }) {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return null;
  const cookie = nombreCookieCampanita(sesion.usuarioId);
  const [avisos, respuestas, leidas, enPanel, almacen] = await Promise.all([
    leerAvisosDelClub(sesion.usuarioId),
    leerRespuestasDelClub(sesion.usuarioId),
    avisosVistos(),
    avisosEnPanel(),
    cookies(),
  ]);
  const visto = leerDia(almacen.get(cookie)?.value);

  // Lo que hoy está a favor: las tallas que llegaron y las respuestas de CAYLA. Se anota en el historial; la hora de recepción se queda con
  // la primera vez que la cuenta lo vio (una talla que vuelve a llegar, después de estar agotada, cuenta desde ese momento).
  if (avisos !== null) {
    const entradas: EntradaAviso[] = [
      ...avisos.filter((a) => a.tipo === "llego").map((a) => ({ clave: a.clave, tipo: "llego" as const, titulo: a.titulo, texto: a.texto, href: a.href ?? "/cuenta" })),
      ...respuestas.map((a) => ({ clave: a.clave, tipo: "respuesta" as const, titulo: a.titulo, texto: a.texto, href: a.href ?? "/recomendaciones", cuando: a.cuando })),
    ];
    await sincronizarAvisos(sesion.usuarioId, entradas, true);
  }

  // La primera página del historial (la más reciente primero), el total y todas las claves no borradas (para el globo y el aviso en vivo).
  // Solo la bandeja: lo que no se vació del panel (lo vaciado sigue en «Todas las notificaciones»).
  const lista = await listarAvisos(sesion.usuarioId, { pagina: 1, tamano: NOTIFICACIONES_EN_EL_PANEL, soloBandeja: true });
  const datos = armarCampanita(
    lista?.items ?? [],
    lista?.claves ?? [],
    lista?.total ?? 0,
    leidas,
    novedadesDesde(prendas, visto, hoyLima()),
    enPanel,
  );

  // Las tallas que llegaron hoy: el navegador quita las cookies de las que ya no están (una talla que se volvió a acabar). Si la base no
  // contestó, no se quita nada.
  const tallasActivas = avisos === null ? null : avisos.filter((a) => a.tipo === "llego").map((a) => a.clave);
  return <BotonCampanita cookie={cookie} vistoAntes={visto !== null} datos={datos} hrefNuevo={hrefNuevo} tallasActivas={tallasActivas} />;
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
