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
//
// CUÁNDO LLEGÓ (actualización 2026-11-10, Felipe: «cuando le doy clic a Productos desde otro módulo no me deja ingresar y después de unos
// segundos recién entra»). Antes se daba por llegado cuando la ruta era la del destino «o una hija suya». Entrar a un PADRE desde su hija
// (Marcas → Productos, Movimientos → Existencias, Apartados → Vender) se daba por llegado en el mismo clic: el esqueleto ni se veía y la
// pantalla anterior se quedaba 2,6 s sin cambiar nada, ni la fila del menú (medido en producción). Le pasaba a las 7 filas con hijas en el
// menú. Ahora el marco navega él mismo, dentro de una transición de React que vigila (`registrarNavegador`), y suelta el esqueleto cuando
// Next TERMINA esa navegación, sea cual sea la ruta final (una hija, un `redirect` de vuelta a donde estabas, «Sin acceso»).

/** Lo que tarda como máximo en llegar una pantalla antes de devolver la anterior a la vista (la base corta a los 8 s; el doble, de sobra). */
export const MS_TOPE_DESTINO = 15_000;

export type Destino = { pathname: string; etiqueta: string | null; desde: number };

type Clic = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean; preventDefault?: () => void };

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
/**
 * Quién navega: el marco registra aquí su `router.push` envuelto en una transición que él mismo vigila. Mientras esa transición está abierta,
 * Next sigue trayendo la pantalla; al cerrarse, ya montó la nueva (o su `loading.tsx`) y el esqueleto del marco se suelta.
 */
let navegar: ((href: string) => void) | null = null;
export function registrarNavegador(fn: (href: string) => void) {
  navegar = fn;
  return () => {
    if (navegar === fn) navegar = null;
  };
}

/**
 * El clic de una fila del menú, del logo o del buscador global. Si lleva a OTRA pantalla en esta pestaña (`destinoDelClic`), anota el destino
 * con su nombre del menú, ataja el clic y navega por el marco: devuelve `true` y quien llama ya no navega. Si no (otra pestaña, la misma
 * pantalla, sin marco montado), no toca nada y devuelve `false`: el enlace navega como siempre.
 */
export function entrarAlInstante(href: string, clic: Clic, actual: { pathname: string; origin: string } = window.location): boolean {
  if (!navegar) return false;
  const pathname = destinoDelClic(href, actual, clic);
  if (!pathname) return false;
  clic.preventDefault?.();
  marcarDestino(pathname, etiquetaDelDestino(pathname, pantallas));
  navegar(href);
  return true;
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
