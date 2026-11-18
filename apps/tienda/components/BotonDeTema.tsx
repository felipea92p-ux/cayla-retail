"use client";

import { useSyncExternalStore } from "react";
import { atributoDelTema, CLAVE_DEL_TEMA, colorDeLaBarra, NOMBRE_DEL_TEMA, temaGuardado, temaSiguiente, type Tema } from "@/lib/tema";
import { Icono } from "./Icono";

// Lo elegido vive en el almacén del navegador (fuera de React): se lee con `useSyncExternalStore`, que da «automático» al armar la página en el servidor y
// corrige al montar sin parpadeo. Los dos botones (cabecera y menú) se avisan entre sí con `suscriptores`.
const suscriptores = new Set<() => void>();
function suscribir(aviso: () => void) {
  suscriptores.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    suscriptores.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}
// Sin almacén (ventana privada) lo elegido vale solo mientras la página siga abierta.
let enMemoria: Tema | null = null;
function leer(): Tema {
  if (enMemoria) return enMemoria;
  try {
    return temaGuardado(window.localStorage.getItem(CLAVE_DEL_TEMA));
  } catch {
    return "auto";
  }
}
const alServidor = (): Tema => "auto";

/**
 * El botón del tema (claro, oscuro o el del aparato): cada toque pasa a la elección que sigue y la recuerda en este navegador. Promete que el ícono ya es el
 * correcto al pintar (las tres versiones van dibujadas y el CSS muestra la que corresponde a `data-theme` de `<html>`, que el `<head>` ya puso: nada
 * parpadea ni espera a React). Como ícono va en la cabecera de la computadora; como fila, en el menú del celular, donde la cabecera no tiene lugar.
 */
export function BotonDeTema({ forma = "icono" }: { forma?: "icono" | "fila" }) {
  const tema = useSyncExternalStore(suscribir, leer, alServidor);

  function alTocar() {
    const nuevo = temaSiguiente(tema);
    const atributo = atributoDelTema(nuevo);
    if (atributo) document.documentElement.setAttribute("data-theme", atributo);
    else document.documentElement.removeAttribute("data-theme");
    // La barra del navegador en el celular: lo elegido, o lo que el aparato dice si es automático.
    const color = colorDeLaBarra(nuevo);
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      if (!m.dataset.original) m.dataset.original = m.content;
      m.content = color ?? m.dataset.original;
    });
    enMemoria = nuevo;
    try {
      if (nuevo === "auto") window.localStorage.removeItem(CLAVE_DEL_TEMA);
      else window.localStorage.setItem(CLAVE_DEL_TEMA, nuevo);
    } catch {
      // Sin almacén: queda en memoria.
    }
    suscriptores.forEach((aviso) => aviso());
  }

  const dice = `Tema ${NOMBRE_DEL_TEMA[tema]}. Tocar para cambiarlo.`;
  const iconos = (
    <span className="t-tema-iconos" aria-hidden="true">
      <span className="t-tema-auto">
        <Icono nombre="contraste" />
      </span>
      <span className="t-tema-claro">
        <Icono nombre="sol" />
      </span>
      <span className="t-tema-oscuro">
        <Icono nombre="luna" />
      </span>
    </span>
  );
  if (forma === "fila")
    return (
      <button type="button" className="t-tema-fila" onClick={alTocar} aria-label={dice}>
        {iconos}
        <span>Tema: {NOMBRE_DEL_TEMA[tema]}</span>
      </button>
    );
  return (
    <button type="button" className="t-ico t-tema" onClick={alTocar} aria-label={dice} title={dice}>
      {iconos}
    </button>
  );
}
