// «Actualiza el navegador» (ADR-0674, Felipe 2026-11-17).
//
// EL PROBLEMA. El ERP pinta sus colores con `color-mix()` (los tokens, el vidrio, los textos tenues) y Next 16 arma su código para Chrome
// 111 o más nuevo. Un teléfono de gama baja con el Chrome sin actualizar (o un Android que ya no recibe versiones nuevas) abre el ERP sin
// colores, con piezas encimadas, o en blanco, y nadie sabe por qué: la vendedora cree que «el sistema está caído».
//
// QUÉ HACE. Si el navegador no entiende `color-mix()` (Chrome 111, Safari 16.2 y Firefox 113 lo entienden), el script del <head> marca
// <html> con `data-navegador-viejo` («android» o «si») y el aviso, que el servidor ya dibujó escondido arriba de todo
// (`components/AvisoNavegadorViejo.tsx`), se muestra con una regla de CSS simple (`app/estilos/navegador-viejo.css`). En Android suma el
// enlace para actualizar Chrome en la Play Store. No bloquea nada: el ERP sigue debajo, como pueda.
//
// POR QUÉ ASÍ Y NO UN COMPONENTE DE CLIENTE. Justo en ese navegador lo demás puede no correr: el código de React está armado para Chrome 111
// y Tailwind 4 pone sus reglas dentro de `@layer`, que antes de Chrome 99 se ignora entero. El aviso es HTML del servidor, su CSS va fuera
// de toda capa con los colores de la marca como respaldo, y el script es JavaScript de los viejos (`var`, sin flechas). Tampoco se inserta
// desde el script: React lo borraría al hidratar el <body> (visto el 2026-11-17: «Hydration failed»). Es una cadena a propósito:
// `navegador-viejo-reglas.test.ts` la ejecuta.

/** El atributo de <html>: «android» (con el enlace a la Play Store) o «si». Sin él, el navegador está al día. */
export const ATRIBUTO_NAVEGADOR_VIEJO = "data-navegador-viejo";

/** Lo que el aviso dice (CLAUDE.md, «Poco texto a la vista»: el nombre y una línea corta). */
export const TEXTOS_NAVEGADOR_VIEJO = {
  titulo: "Actualiza el navegador",
  linea: "Es muy antiguo: el ERP se verá roto.",
  accion: "Actualizar Chrome",
} as const;

/** Chrome en la Play Store: en Android, el lugar donde se actualiza. */
export const ENLACE_ACTUALIZAR_CHROME = "https://play.google.com/store/apps/details?id=com.android.chrome";

export const SCRIPT_NAVEGADOR_VIEJO =
  `(function(){try{if(window.CSS&&CSS.supports&&CSS.supports("color","color-mix(in srgb, red, blue)"))return}catch(e){}` +
  `document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_NAVEGADOR_VIEJO)},` +
  `/Android/i.test(navigator.userAgent||"")?"android":"si")})();`;
