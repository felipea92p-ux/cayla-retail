"use client";

import { useSyncExternalStore } from "react";
import { tieneCookieDeSesion } from "@/lib/sesion";

const nadie = () => () => {};
const hayCookie = () => tieneCookieDeSesion(document.cookie.split(";").map((c) => c.split("=")[0].trim()));

/**
 * Lo que se ve MIENTRAS el servidor lee las cookies de una página armada por adelantado (`SegunSesion`, ADR-0432): la pieza de quien
 * no tiene cuenta o la de quien sí, según la cookie de esta sesión, que el navegador sí puede leer (no es `httpOnly`, ver
 * `OPCIONES_COOKIE_SESION`). Así quien navega dentro de la tienda no ve, por un instante, la cabecera o el pie del visitante: la página
 * que llegó de la caché ya sale con la forma que le toca. Es solo para pintar rápido; lo que se muestra de verdad lo decide el
 * servidor (`haySesion`) apenas contesta, y los datos de una cuenta se validan donde se muestran. Sin JavaScript, o al abrir la página
 * del servidor, vale la del visitante (es lo que tiene el HTML guardado).
 */
export function ElegirPorCookie({ visitante, conCuenta }: { visitante: React.ReactNode; conCuenta: React.ReactNode }) {
  const conSesion = useSyncExternalStore(nadie, hayCookie, () => false);
  return conSesion ? conCuenta : visitante;
}
