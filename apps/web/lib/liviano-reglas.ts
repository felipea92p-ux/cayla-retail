// El modo liviano (ADR-0674, Felipe 2026-11-17): las reglas PURAS. Nada de DOM ni de almacenamiento aquí: eso vive en
// `liviano-cliente.ts`. Esto es lo que se prueba sin navegador.
//
// EL PROBLEMA. El vidrio del ERP (ADR-0596) se dibuja desenfocando lo que hay detrás, y eso lo hace la tarjeta gráfica. En un teléfono de
// gama baja (2–3 GB de RAM, gráfica débil), con 240 desenfoques y las nubes del fondo, la pantalla se traba al abrir una hoja o al
// desplazarse. La cara maciza del mismo vidrio ya existe y ya está aprobada: «el vidrio que aguanta» (ADR-0611, mejora 7), pero solo se
// enciende si el aparato pide «menos transparencia», un ajuste que Android casi nunca manda.
//
// QUÉ HACE. Con `data-liviano="si"` en <html>, el ERP se dibuja con esa cara maciza, sin desenfoque y sin las nubes del fondo
// (`app/estilos/liviano.css`). Es una preferencia del APARATO, como el modo oscuro y las animaciones: una cuenta de mostrador se comparte.
//
// CUÁNDO SE ENCIENDE SOLO (Felipe eligió «automático + botón»). Solo con lo que Chrome dice de la memoria, porque Safari y Firefox no la
// dan (y en el iPhone el vidrio anda bien, ADR-0479):
//   · 2 GB o menos, en cualquier equipo.
//   · 4 GB o menos con pantalla táctil: el teléfono barato que más se vende en 2026 (Galaxy A05, Redmi A3) tiene 3 o 4 GB, 8 núcleos y
//     una gráfica débil. Por eso no se mira la cantidad de núcleos: «4 o menos» casi no atrapa teléfonos (todos tienen 8) y sí
//     computadores de escritorio viejos, que no eran el pedido. Y Safari en el iPhone dice 2 núcleos a propósito (WebKit,
//     `NavigatorBase.cpp`): por núcleos, todo iPhone caería aquí.
//   · O la persona pidió «ahorro de datos» en su navegador.
// Una vez que alguien lo cambia a mano (en «Apariencia», al pie del menú), manda lo que eligió en ese aparato («si» o «no»), hasta que
// toque «Volver a automático» (Felipe 2026-11-17). Los umbrales son una apuesta inicial: el cronómetro del clic (ADR-0654) ya anota la
// clase del equipo, y con esos datos se mueven.

import type { Equipo } from "./clase-de-equipo";

export type Liviano = "si" | "no";

/** Dónde se guarda lo que la persona eligió en «Apariencia» (localStorage del aparato). Sin nada guardado, decide el equipo. */
export const CLAVE_LIVIANO = "cayla-liviano";

/** El atributo de `<html>` del que cuelga el CSS macizo (`app/estilos/liviano.css`). Siempre vale «si» o «no». */
export const ATRIBUTO_LIVIANO = "data-liviano";

/** Hasta cuánta memoria (GB, como la redondea Chrome) un equipo cuenta como lento. */
const RAM_LENTA = 2;
/** Hasta cuánta memoria cuenta como lento un equipo con pantalla táctil (un teléfono o una tablet). */
const RAM_LENTA_TACTIL = 4;

function esLiviano(valor: unknown): valor is Liviano {
  return valor === "si" || valor === "no";
}

/** ¿Este equipo pide el modo liviano por sí solo? */
export function equipoEsLento(e: Equipo): boolean {
  if (e.ahorroDeDatos) return true;
  if (e.ram === null) return false;
  return e.ram <= RAM_LENTA || (e.tactil && e.ram <= RAM_LENTA_TACTIL);
}

/** Lo que queda puesto: lo que eligió la persona en «Apariencia», o si no, lo que pide el equipo. Lo guardado corrupto no cuenta. */
export function resolverLiviano(guardado: unknown, equipo: Equipo): Liviano {
  if (esLiviano(guardado)) return guardado;
  return equipoEsLento(equipo) ? "si" : "no";
}

/**
 * ¿Lo decide el equipo? Sí mientras nadie lo cambió a mano en este aparato (lo guardado corrupto tampoco cuenta como elección). Es el
 * tercer estado de «Apariencia» (Felipe 2026-11-17): «Automático», con «Volver a automático» para salir de una elección vieja. Volver es
 * BORRAR lo guardado, no guardar «auto»: así el script del `<head>` no cambia y sigue diciendo lo mismo que `resolverLiviano`.
 */
export function livianoEsAutomatico(guardado: unknown): boolean {
  return !esLiviano(guardado);
}

/**
 * El script que corre ANTES de la primera pintura (va en el `<head>` de `app/layout.tsx`, junto a los del tema y las animaciones): sin
 * él, la pantalla se pintaría primero con vidrio y después se volvería maciza. Repite `resolverLiviano` con `leerEquipo`: es una cadena a
 * propósito, y `liviano-reglas.test.ts` la ejecuta contra una tabla de equipos y exige que dé lo mismo. Siempre deja un valor puesto y
 * nunca lanza: sin almacenamiento, decide el equipo; sin nada que leer, «no».
 */
export const SCRIPT_LIVIANO_ANTES_DE_PINTAR =
  `(function(){var d=document.documentElement,v=null;try{v=localStorage.getItem(${JSON.stringify(CLAVE_LIVIANO)})}catch(e){}` +
  `if(v!=="si"&&v!=="no"){v="no";try{var n=navigator,r=n.deviceMemory,c=null,t=false;try{c=n.connection}catch(e){}` +
  `try{t=matchMedia("(pointer: coarse)").matches===true}catch(e){}` +
  `var ram=typeof r==="number"&&r>=0.25&&r<=64&&Math.log2(r)%1===0?r:null;` +
  `if((c&&c.saveData===true)||(ram!==null&&(ram<=${RAM_LENTA}||(t&&ram<=${RAM_LENTA_TACTIL}))))v="si"}catch(e){}}` +
  `d.setAttribute(${JSON.stringify(ATRIBUTO_LIVIANO)},v)})();`;
