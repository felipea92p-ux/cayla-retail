// El rediseño de la tienda (ADR-0615) se construye oculto: el cliente sigue viendo la tienda actual hasta que Felipe lo active. Quien entra con
// `?diseno=nuevo` lo ve, y su navegador lo recuerda; `?diseno=actual` vuelve atrás. Decide un script en el <head>, como el tema (lib/tema.ts), para no
// leer una cookie en el servidor: eso volvería dinámicas las páginas que hoy se guardan en caché. Es solo apariencia: los datos son los mismos.

/** @internal La prueba mira qué se guarda en el navegador. */
export const CLAVE_DEL_DISENO = "cayla-diseno";

/** Corre antes de pintar. Un almacén roto o una dirección rara dejan la tienda actual, nunca una página rota. */
export const SCRIPT_DEL_DISENO = `(function(){try{var p=new URLSearchParams(location.search).get("diseno");if(p==="nuevo"||p==="actual")localStorage.setItem("${CLAVE_DEL_DISENO}",p);var v=p||localStorage.getItem("${CLAVE_DEL_DISENO}");if(v==="nuevo")document.documentElement.setAttribute("data-diseno","nuevo")}catch(e){}})();`;
