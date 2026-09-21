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

export type Clasificacion = { tipo: TipoEspera; /** nombre de la sección a la que se navega, si se conoce */ seccion: string | null };

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

/** Nombre de la pantalla a la que se va, por el primer tramo de la ruta. */
const SECCIONES: Record<string, string> = {
  "": "Inicio",
  vender: "Vender",
  inventario: "Inventario",
  productos: "Productos",
  compras: "Compras",
  recibir: "Recibir",
  caja: "Caja",
  cambios: "Cambios",
  devoluciones: "Devoluciones",
  movimientos: "Movimientos",
  produccion: "Producción",
  colaboradores: "Colaboradores",
  buscar: "Buscar",
};

export function seccionDeRuta(pathname: string): string | null {
  const primero = pathname.split("/").filter(Boolean)[0] ?? "";
  return SECCIONES[primero] ?? null;
}

export type MensajeEspera = {
  /** Rótulo pequeño en mayúsculas sobre el título. */
  etiqueta: string;
  titulo: string;
  /** Va después del título, en rojo (p. ej. la sede de destino). */
  resalte?: string;
  detalle?: string;
};

export const MENSAJE_GUARDANDO: MensajeEspera = {
  etiqueta: "Guardando",
  titulo: "Guardando cambios",
  detalle: "No cierres ni recargues la página.",
};

export function mensajeDeCarga(seccion: string | null): MensajeEspera {
  return { etiqueta: "Cargando", titulo: seccion ?? "Un momento", detalle: "Trayendo la pantalla…" };
}

/** Lo que dice el aviso cuando la espera pasa de lo normal. */
export const DETALLE_TARDA = "Está tardando más de lo normal, un momento…";
export const DETALLE_TARDA_GUARDANDO = "Sigue guardando. No cierres ni recargues la página.";

/** Devuelve qué tipo de espera es esta petición, o `null` si no debe mostrar el loader. */
export function clasificarPeticion(p: PeticionEspera): Clasificacion | null {
  if (p.cabecera("x-espera")?.toLowerCase() === "no") return null;
  const metodo = p.metodo.toUpperCase();

  if (p.url.origin === p.origen) {
    if (p.cabecera("next-action")) return { tipo: "guardado", seccion: null };
    if (metodo === "GET") {
      const esPrefetch = p.cabecera("next-router-prefetch") !== null || p.cabecera("next-router-segment-prefetch") !== null;
      if (p.cabecera("rsc") === "1" && !esPrefetch) return { tipo: "carga", seccion: seccionDeRuta(p.url.pathname) };
      return null;
    }
    if (metodo !== "HEAD" && metodo !== "OPTIONS" && p.url.pathname.startsWith("/api/")) return { tipo: "guardado", seccion: null };
    return null;
  }

  if (p.hostSupabase && p.url.host === p.hostSupabase) {
    if (metodo === "GET" || metodo === "HEAD" || metodo === "OPTIONS") return null;
    const ruta = p.url.pathname;
    if (ruta.startsWith("/auth/v1/token")) return null; // refresco de sesión en segundo plano
    const rpc = /\/rest\/v1\/rpc\/([^/?]+)/.exec(ruta);
    if (rpc && esRpcDeLectura(rpc[1])) return null;
    return { tipo: "guardado", seccion: null };
  }

  return null;
}
