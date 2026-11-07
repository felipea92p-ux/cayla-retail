import { rutaActiva } from "./menu";

// ADR-0628 · «Entrar al módulo al instante» (Felipe 2026-11-07: «queda cargando pero no me ingresa… si aún no ha cargado que te
// muestre un esqueleto, pero no debería dejarte fuera del módulo»).
//
// EL PROBLEMA. Medido en producción: entre el clic en el menú y el primer cambio en pantalla pasaban ~250 ms sin NADA (Next espera la
// primera respuesta del servidor para montar el `loading.tsx`), y después un esqueleto que no decía a qué módulo se entraba, hasta que el
// módulo llegaba (0,8 s Historial, 1,4 s Caja, 3 s Existencias). Sin una señal en el mismo instante, el clic parece perdido y se vuelve a tocar.
//
// QUÉ HACE. El clic en una fila del menú anota aquí el DESTINO en ese mismo instante. Con eso el marco (AppShell) marca la fila como activa y
// muestra el esqueleto con el nombre del módulo, sin esperar al servidor; cuando la ruta cambia, el `loading.tsx` (`EsperaPantalla`) sigue
// con el MISMO título hasta que el módulo llega. La pantalla anterior queda montada y escondida: si la navegación no llega (un error, «atrás»),
// a los 15 s o con «atrás» vuelve tal cual. Nada de esto cambia adónde lleva cada enlace: solo lo que se ve mientras llega.

/** Lo que tarda como máximo en llegar una pantalla antes de devolver la anterior a la vista (la base corta a los 8 s; el doble, de sobra). */
export const MS_TOPE_DESTINO = 15_000;

export type Destino = { pathname: string; etiqueta: string | null; desde: number };

type Clic = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean };

/**
 * ¿Este clic en un enlace del menú lleva a OTRA pantalla de la app, en esta misma pestaña? Devuelve su `pathname`, o `null` si no: con
 * ⌘/Ctrl/Mayús/Alt o el botón del medio se abre otra pestaña; un clic que otro ya atajó no es nuestro; otra dirección (otro sitio) tampoco;
 * y la MISMA pantalla (solo cambia `?mes=` o nada) no es entrar a un módulo: no se tapa lo que ya se ve.
 */
export function destinoDelClic(href: string, actual: { pathname: string; origin: string }, clic: Clic): string | null {
  if (clic.defaultPrevented || clic.button !== 0 || clic.metaKey || clic.ctrlKey || clic.shiftKey || clic.altKey) return null;
  let url: URL;
  try {
    url = new URL(href, actual.origin);
  } catch {
    return null;
  }
  if (url.origin !== actual.origin) return null;
  if (url.pathname === actual.pathname) return null;
  return url.pathname;
}

/** El nombre del menú de la pantalla a la que se entra: la fila cuya ruta la contiene, la más larga (`/productos/marcas` antes que `/productos`). */
export function etiquetaDelDestino(pathname: string, pantallas: readonly { href: string; etiqueta: string }[]): string | null {
  let mejor: { href: string; etiqueta: string } | null = null;
  for (const p of pantallas) if (rutaActiva(pathname, p.href) && (!mejor || p.href.length > mejor.href.length)) mejor = p;
  return mejor?.etiqueta ?? null;
}

/** ¿Ya llegó la pantalla a la que se entró? Sí, si la ruta es la suya o una hija suya. El tope de 15 s lo cuenta el marco aparte (un reloj, no la ruta). */
export function llegoAlDestino(destino: Destino, pathname: string): boolean {
  return pathname === destino.pathname || rutaActiva(pathname, destino.pathname);
}

// ---- El almacén (fuera de React: lo escriben los manejadores del menú y lo leen el marco y el `loading.tsx`) ----
let enCamino: Destino | null = null;
/** El último destino, aunque ya haya llegado: el `loading.tsx` lo lee para seguir con el mismo título. */
let ultimo: Destino | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());

/** Los nombres del menú de quien está usando el ERP (los registra el marco): con ellos el destino lleva su nombre sin que cada fila lo pase. */
let pantallas: readonly { href: string; etiqueta: string }[] = [];
export function registrarPantallas(lista: readonly { href: string; etiqueta: string }[]) {
  pantallas = lista;
}
/** El clic de una fila del menú: anota su destino si lleva a otra pantalla en esta pestaña (`destinoDelClic`), con su nombre del menú. */
export function alEntrarDesdeElMenu(href: string, clic: Parameters<typeof destinoDelClic>[2]) {
  const pathname = destinoDelClic(href, { pathname: window.location.pathname, origin: window.location.origin }, clic);
  if (pathname) marcarDestino(pathname, etiquetaDelDestino(pathname, pantallas));
}

export function marcarDestino(pathname: string, etiqueta: string | null, ahora = Date.now()) {
  enCamino = ultimo = { pathname, etiqueta, desde: ahora };
  avisar();
}
export function soltarDestino() {
  if (!enCamino) return;
  enCamino = null;
  avisar();
}
export const leerEnCamino = () => enCamino;
export const leerUltimo = () => ultimo;
export function suscribirDestino(o: () => void) {
  oyentes.add(o);
  return () => void oyentes.delete(o);
}
