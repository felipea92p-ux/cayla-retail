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

/** Dónde se guarda: en el APARATO (`localStorage`, lo comparten todas las pestañas y sobrevive a cerrar el navegador) o en
 *  ESTA PESTAÑA (`sessionStorage`: sobrevive a una recarga y a que Android la descarte por falta de memoria, y no la ven las
 *  otras pestañas; el ticket que se está armando, ADR-0674). */
export type DondeSeGuarda = "aparato" | "pestana";

function storage(donde: DondeSeGuarda = "aparato"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return (donde === "pestana" ? window.sessionStorage : window.localStorage) ?? null;
  } catch {
    // relleno-a-proposito: Algunos navegadores lanzan al solo TOCAR el almacenamiento (cookies bloqueadas).
    return null;
  }
}

/** Lo guardado bajo `clave`, o `porDefecto` si no hay nada, no se puede leer o está roto. */
export function leer<T>(clave: string, porDefecto: T, donde: DondeSeGuarda = "aparato"): T {
  const s = storage(donde);
  if (!s) return porDefecto;
  try {
    const crudo = s.getItem(clave);
    return crudo === null ? porDefecto : (JSON.parse(crudo) as T);
  } catch {
    return porDefecto;
  }
}

/** Guarda `valor` como JSON. `false` si no se pudo (servidor, cuota llena, bloqueado). */
export function guardar(clave: string, valor: unknown, donde: DondeSeGuarda = "aparato"): boolean {
  const s = storage(donde);
  if (!s) return false;
  try {
    s.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    // relleno-a-proposito: `false` le dice a quien llama que no se guardó (cuota llena, bloqueado).
    return false;
  }
}

export function borrar(clave: string, donde: DondeSeGuarda = "aparato"): void {
  const s = storage(donde);
  if (!s) return;
  try {
    s.removeItem(clave);
  } catch {
    // Nada que hacer: si no se puede borrar, tampoco se pudo guardar.
  }
}
