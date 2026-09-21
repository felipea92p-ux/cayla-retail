/**
 * Cuándo el ERP muestra el loader general (ADR-0149) — la parte pura, sin DOM, para poder probarla.
 *
 * EL PROBLEMA. La persona pulsa «Guardar» o una opción del menú y, mientras la base contesta, no ve
 * nada: no sabe si el clic se registró y vuelve a pulsar, o lee datos viejos creyendo que ya son los
 * nuevos. Se podía resolver botón por botón (un `useTransition` en ~50 componentes), pero el
 * componente 51 lo olvidaría. Aquí la decisión se toma UNA vez, donde todo pasa: en la petición.
 *
 * QUÉ CUENTA COMO ESPERA. Solo lo que la persona provocó y espera ver terminar:
 *  · «carga»   — una navegación de Next (GET con `RSC: 1`, sin ser prefetch): cambiar de pantalla,
 *                un filtro por URL, `router.refresh()`.
 *  · «guardado» — una escritura: server action (`Next-Action`), POST/PUT/PATCH/DELETE a `/api/*`, y
 *                cualquier escritura al host de Supabase (tabla, RPC o storage).
 * Lo que NO cuenta: prefetch, lecturas (GET), buscadores que llaman a una RPC de solo lectura, y el
 * refresco de token de sesión. Un buscador que bloqueara la pantalla en cada tecla sería peor que el
 * problema que se resuelve.
 */

export type TipoEspera = "carga" | "guardado";

export type Clasificacion = { tipo: TipoEspera };

export type PeticionEspera = {
  url: URL;
  metodo: string;
  /** Lee una cabecera sin importar mayúsculas; `null` si no está. */
  cabecera: (nombre: string) => string | null;
  /** `location.origin` de la app. */
  origen: string;
  /** Host de Supabase (`xxxx.supabase.co`), o `null` si no está configurado. */
  hostSupabase: string | null;
};

/**
 * RPC que solo LEEN. Llamarlas desde el navegador es un POST igual que una escritura, así que hay que
 * decirlo por nombre. Por defecto una RPC es una escritura: equivocarse hacia «guardado» solo muestra
 * un aviso de más; equivocarse hacia «lectura» deja guardar sin ninguna señal, que es lo que se evita.
 * Al escribir una RPC de solo lectura para el navegador: nómbrala con uno de estos prefijos.
 */
export const PREFIJOS_RPC_DE_LECTURA = ["fn_", "previsualizar_", "campanas_", "resumen_", "buscar_", "get_"] as const;

export function esRpcDeLectura(nombre: string): boolean {
  return PREFIJOS_RPC_DE_LECTURA.some((p) => nombre.startsWith(p));
}

export type MensajeEspera = {
  /** Rótulo pequeño en mayúsculas sobre el título. */
  etiqueta: string;
  titulo: string;
  /** Va después del título, en rojo (p. ej. la sede de destino). */
  resalte?: string;
  detalle?: string;
};

/**
 * El texto de siempre, sin nombrar la pantalla ni la acción: el mismo loader sirve para abrir una pantalla,
 * guardar y editar, así que lo que dice tiene que ser cierto en los tres casos. Solo el cambio de sede lleva
 * un texto propio (`AvisoCambioDeSede`).
 */
export const MENSAJE_ESPERA: MensajeEspera = {
  etiqueta: "Un momento",
  titulo: "Cargando",
  detalle: "Estamos procesando tu solicitud…",
};

/** Lo que dice el aviso cuando la espera pasa de lo normal (vale también si está guardando: no cerrar). */
export const DETALLE_TARDA = "Está tardando más de lo normal. No cierres ni recargues la página.";

/** Devuelve qué tipo de espera es esta petición, o `null` si no debe mostrar el loader. */
export function clasificarPeticion(p: PeticionEspera): Clasificacion | null {
  if (p.cabecera("x-espera")?.toLowerCase() === "no") return null;
  const metodo = p.metodo.toUpperCase();

  if (p.url.origin === p.origen) {
    if (p.cabecera("next-action")) return { tipo: "guardado" };
    if (metodo === "GET") {
      const esPrefetch = p.cabecera("next-router-prefetch") !== null || p.cabecera("next-router-segment-prefetch") !== null;
      if (p.cabecera("rsc") === "1" && !esPrefetch) return { tipo: "carga" };
      return null;
    }
    if (metodo !== "HEAD" && metodo !== "OPTIONS" && p.url.pathname.startsWith("/api/")) return { tipo: "guardado" };
    return null;
  }

  if (p.hostSupabase && p.url.host === p.hostSupabase) {
    if (metodo === "GET" || metodo === "HEAD" || metodo === "OPTIONS") return null;
    const ruta = p.url.pathname;
    if (ruta.startsWith("/auth/v1/token")) return null; // refresco de sesión en segundo plano
    const rpc = /\/rest\/v1\/rpc\/([^/?]+)/.exec(ruta);
    if (rpc && esRpcDeLectura(rpc[1])) return null;
    return { tipo: "guardado" };
  }

  return null;
}
