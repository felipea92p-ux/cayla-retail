import { SEDE_PRINCIPAL } from "./sede-elegida";

// La puerta de las páginas del catálogo (ADR-0696, T1 de la auditoría de SEO del 2026-11-23). Toda página del catálogo habla de UNA
// tienda (Felipe 2026-10-19) y la lleva en la dirección (`?sede=trujillo`). Antes, quien llegaba sin ella recibía un 200 con el esqueleto
// de la página y una redirección escondida (`<meta http-equiv="refresh" content="1;…">`): la página ya había empezado a salir cuando
// `sedeDeLaPagina` pedía redirigir. Google y cualquiera que no corra JavaScript veían una página sin prendas, y la portada eran tres saltos.
// Ahora el proxy responde un 307 de verdad ANTES de armar nada, con la tienda de la cookie o, sin ella, la principal. No le pregunta a la
// base: una clave que ya no existe la sigue corrigiendo la página (`sedeDeLaPagina`), que queda de respaldo. Lógica pura, con su prueba.

/** Las páginas que llaman `sedeDeLaPagina` (las que redirigen sin `?sede=`): el Inicio, el catálogo y cada ficha, los looks y la bolsa.
 *  Solo la página misma: lo que cuelga de ella (la imagen de WhatsApp de una ficha, `/catalogo/<id>/opengraph-image…`; la de un look
 *  guardado, `/looks/guardado/<id>/historia`) no elige tienda y no se redirige. */
const RUTAS_CON_SEDE = [/^\/(?:inicio|catalogo|looks|bolsa)$/, /^\/catalogo\/[^/]+$/, /^\/looks\/(?!guardado$)[^/]+$/, /^\/looks\/guardado\/[^/]+$/];
export const rutaConSede = (ruta: string): boolean => RUTAS_CON_SEDE.some((r) => r.test(ruta));

/** Una clave de tienda bien escrita (`claveDeSede`: minúsculas, números y guiones). Lo de la cookie lo escribe el navegador: no se le cree. */
const CLAVE_VALIDA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const claveValida = (texto: string | undefined): string | null => {
  const t = texto?.trim();
  return t && t.length <= 40 && CLAVE_VALIDA.test(t) ? t : null;
};

/**
 * La misma dirección con su tienda, o null si no hace falta (no es una página del catálogo o ya trae `?sede=`). La tienda va primero y
 * los demás parámetros siguen igual (las marcas `utm_*`, la categoría, la página); un `?sede=` vacío cuenta como ninguno.
 */
export function conSedeEnLaDireccion(ruta: string, busqueda: string, recordada: string | undefined): string | null {
  if (!rutaConSede(ruta)) return null;
  const actuales = new URLSearchParams(busqueda);
  if (actuales.getAll("sede").some((v) => v.trim() !== "")) return null;
  const query = new URLSearchParams({ sede: claveValida(recordada) ?? SEDE_PRINCIPAL });
  for (const [clave, valor] of actuales) if (clave !== "sede") query.append(clave, valor);
  return `${ruta}?${query.toString()}`;
}

/**
 * A dónde manda el proxy al final: lo que ya decidió la sesión (`destino`, de `redireccionDelProxy`) o la página pedida, con su tienda
 * si es del catálogo. Solo una navegación (GET/HEAD): una acción viaja como POST a la misma ruta. Una navegación de React dentro de la
 * tienda también pasa por aquí (Next no le muestra al proxy la cabecera `RSC`) y sigue el 307 como cualquier redirección del proxy.
 */
export function destinoConSede(
  destino: string | null,
  pedido: { ruta: string; busqueda: string; metodo: string },
  recordada: string | undefined,
): string | null {
  if (pedido.metodo !== "GET" && pedido.metodo !== "HEAD") return destino;
  if (destino === null) return conSedeEnLaDireccion(pedido.ruta, pedido.busqueda, recordada);
  const corte = destino.indexOf("?");
  const ruta = corte < 0 ? destino : destino.slice(0, corte);
  return conSedeEnLaDireccion(ruta, corte < 0 ? "" : destino.slice(corte), recordada) ?? destino;
}
