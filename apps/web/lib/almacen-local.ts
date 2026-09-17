// Almacén local de Vender — lo que la caja necesita recordar en ESTE navegador y esta
// sede sin pasar por la base: hoy el ticket en espera; mañana la cola offline (BACKLOG,
// principio 9). Un solo módulo para los dos, así comparten llave, encoding y la regla
// que más importa: **nunca romper una venta por el storage**. Modo privado, cuota llena,
// storage bloqueado por una política del navegador, JSON corrupto — todo degrada a «no
// se guardó» / «no había nada», jamás a una excepción a mitad de un cobro.
//
// Puro: sin React, sin `window` en tiempo de importación. En el servidor (`typeof
// window === "undefined"`) leer devuelve el valor por defecto y guardar dice que no
// guardó; por eso el padre carga la espera en un `useEffect` después de montar y nunca
// durante el render — el HTML del servidor y el primer render del navegador tienen que
// coincidir (hidratación).

const NAMESPACE = "cayla:vender";

/** `cayla:vender:<ubicacionId>:<nombre>` — una llave por sede y por uso ("en-espera",
 *  "cola"). Dos tiendas en el mismo navegador nunca se pisan. */
export function claveLocal(ubicacionId: string, nombre: string): string {
  return `${NAMESPACE}:${ubicacionId}:${nombre}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    // Algunos navegadores lanzan al solo TOCAR localStorage (cookies bloqueadas).
    return null;
  }
}

/** Lo guardado bajo `clave`, o `porDefecto` si no hay nada, no se puede leer o está roto. */
export function leer<T>(clave: string, porDefecto: T): T {
  const s = storage();
  if (!s) return porDefecto;
  try {
    const crudo = s.getItem(clave);
    return crudo === null ? porDefecto : (JSON.parse(crudo) as T);
  } catch {
    return porDefecto;
  }
}

/** Guarda `valor` como JSON. `false` si no se pudo (servidor, cuota llena, bloqueado). */
export function guardar(clave: string, valor: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function borrar(clave: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(clave);
  } catch {
    // Nada que hacer: si no se puede borrar, tampoco se pudo guardar.
  }
}
