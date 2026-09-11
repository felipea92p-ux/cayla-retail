/**
 * La cola de ventas offline (Paso 3, ADR-0033).
 *
 * EL PROBLEMA. Si se corta la red a mitad de una venta, `registrar_venta` (ADR-0032) ya
 * sabe no duplicar un reintento — pero el navegador todavía necesita algo que reintentar.
 * Sin esto, la Encargada ve un error, la clienta está pagando en el mostrador, y la venta
 * se pierde o se anota en papel.
 *
 * LA REGLA DE NEGOCIO (decidida con Felipe, ADR-0013 §C): vender sin red se permite SOLO
 * si queda al menos 1 unidad después de la venta. Es el punto medio entre perder la venta
 * y sobrevender: dos sedes no pueden coordinarse mientras están offline, así que la única
 * defensa real es no dejar que el stock local llegue a cero sin que el servidor lo confirme.
 *
 * QUÉ VIVE ACÁ (puro, sin React ni Supabase, para poder probarlo sin montar nada):
 * - La cola misma: leer/escribir `localStorage`, por caja.
 * - El overlay de stock comprometido: lo que ya se vendió offline pero no subió todavía
 *   tiene que descontarse EN PANTALLA de `stockAqui`, o una segunda venta sin red vería
 *   unidades que ya no existen.
 * - El sondeo de conexión al servidor.
 *
 * QUÉ NO VIVE ACÁ. El cliente de Supabase y el ciclo de subida (mount / `online` / latido
 * de 30 s) están en `CajaPanel.tsx`: necesitan `useEffect` y el router, y mezclarlos acá
 * rompería justamente lo que se gana con separar esto — poder probar la aritmética de la
 * cola sin un navegador.
 */

import type { MetodoPago } from "@cayla-retail/shared";

export type ItemVentaEncolada = {
  varianteId: string;
  cantidad: number;
  monto: number;
};

export type VentaEncolada = {
  /** El mismo `p_token` que ADR-0032 usa para no duplicar un reintento. */
  token: string;
  cajaId: string;
  sedeCodigo: string;
  metodoPago: MetodoPago;
  items: ItemVentaEncolada[];
  creadoEn: string;
};

const CLAVE = "cayla:cola-ventas";

// `typeof localStorage`, no `typeof window`: es la API puntual que esto necesita, y probarla
// no exige simular un `window` completo — basta con un `localStorage` en memoria (ver
// `ventas-offline.test.ts`).
function leerCola(): VentaEncolada[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? (datos as VentaEncolada[]) : [];
  } catch {
    // localStorage corrupto, lleno o inaccesible (modo privado) no debe tumbar la venta:
    // se trata como cola vacía. Es mejor perder de vista una cola dañada que reventar el
    // flujo de venta con la clienta en el mostrador.
    return [];
  }
}

function escribirCola(cola: VentaEncolada[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cola));
  } catch {
    // Si esto falla (cuota llena) la venta ya se le mostró a la Encargada como
    // registrada. No hay una salida que no sea alguna de las dos malas: se prefiere
    // dejar la cola como estaba antes de este intento, no una escritura a medias.
  }
}

/** La cola completa de una caja, la única unidad con la que trabajan las pantallas. */
export function obtenerCola(cajaId: string): VentaEncolada[] {
  return leerCola().filter((v) => v.cajaId === cajaId);
}

/**
 * Agrega o reemplaza una venta encolada por su `token`. Reemplazar (no duplicar) importa
 * porque un mismo carrito puede intentar encolarse más de una vez si la Encargada reintenta
 * a mano antes de que el latido automático haya corrido.
 */
export function encolarVenta(venta: VentaEncolada): void {
  const cola = leerCola().filter((v) => v.token !== venta.token);
  escribirCola([...cola, venta]);
}

/** Se llama solo tras confirmar con el servidor que la venta ya existe — nunca antes. */
export function quitarDeCola(token: string): void {
  escribirCola(leerCola().filter((v) => v.token !== token));
}

/**
 * Cuánto de cada variante está comprometido por ventas encoladas que todavía no subieron.
 * Mapa `varianteId → cantidad total`, sumando entre todas las ventas de la cola (no solo
 * una) porque dos ventas offline seguidas de la misma prenda comprometen las dos.
 */
export function stockComprometido(cola: VentaEncolada[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const venta of cola) {
    for (const item of venta.items) {
      mapa.set(item.varianteId, (mapa.get(item.varianteId) ?? 0) + item.cantidad);
    }
  }
  return mapa;
}

/**
 * El overlay: descuenta de `stockAqui` lo que la cola ya comprometió, sobre las variantes
 * que llegan por props desde el servidor. Sin esto, una segunda venta sin red vería el
 * mismo stock que vio la primera — es lo que permite que dos ventas sin red de la última
 * unidad pasen las dos.
 */
export function conStockComprometidoDescontado<T extends { varianteId: string; stockAqui: number }>(
  variantes: T[],
  cola: VentaEncolada[]
): T[] {
  const comprometido = stockComprometido(cola);
  if (comprometido.size === 0) return variantes;
  return variantes.map((v) => {
    const c = comprometido.get(v.varianteId);
    return c ? { ...v, stockAqui: Math.max(0, v.stockAqui - c) } : v;
  });
}

/**
 * La regla del umbral (ADR-0013 §C): tras esta venta, ¿queda al menos 1 unidad? `stockAqui`
 * ya debe venir con el overlay aplicado (es la Encargada la que ve ese número en pantalla,
 * así que es sobre ESE número que se juzga, no sobre el bruto del servidor).
 */
export function pasaElUmbralDeSobra(stockAqui: number, cantidad: number): boolean {
  return stockAqui - cantidad >= 1;
}

/** Nombre real del proyecto Supabase, o `null` si el sondeo no tiene a dónde ir. */
function urlSalud(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/auth/v1/health`;
}

/**
 * ¿Hay camino hasta el servidor? No pregunta si HAY SESIÓN ni si HAY PERMISO — cualquier
 * respuesta HTTP (200, 401, lo que sea) cuenta como "el servidor está ahí". Solo un `fetch`
 * que ni siquiera puede completar la conexión (kong apagado, sin internet) cuenta como sin
 * red. Por eso pega directo a `/auth/v1/health` con `fetch`, no con el cliente de
 * supabase-js: no necesita autenticar nada, solo tocar la puerta.
 */
export async function hayConexionAlServidor(): Promise<boolean> {
  if (typeof window !== "undefined" && "onLine" in window.navigator && !window.navigator.onLine) {
    return false;
  }
  const url = urlSalud();
  if (!url) return true; // sin la variable de entorno no hay nada que sondear; no bloquear por eso.
  try {
    await fetch(url, { method: "GET", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}
