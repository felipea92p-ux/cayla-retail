/**
 * La cola de ventas offline (Paso 3, ADR-0036).
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
 * - La cola misma: leer/escribir `localStorage`, por SEDE — no por caja (Paso 3.1, ver
 *   más abajo por qué).
 * - El overlay de stock comprometido: lo que ya se vendió offline pero no subió todavía
 *   tiene que descontarse EN PANTALLA de `stockAqui`, o una segunda venta sin red vería
 *   unidades que ya no existen.
 * - El sondeo de conexión al servidor.
 *
 * POR QUÉ POR SEDE Y NO POR CAJA (Paso 3.1, ADR-0036 addendum). La primera versión
 * indexaba la cola por `cajaId` y `CajaPanel` solo sincronizaba mientras ESA caja seguía
 * abierta. Eso dejaba una venta huérfana para siempre si la caja se cerraba antes de que
 * la red volviera: nadie volvía a mirar esa cola nunca más, y era plata ya cobrada que el
 * sistema dejaba de saber que existía — justo lo que el principio 9 prohíbe ("nunca pierde
 * datos"). El stock, además, es un recurso de SEDE, no de una caja puntual: el overlay
 * tiene que sobrevivir el cierre de la caja que la generó, o una caja nueva de la misma
 * sede podría volver a ofrecer unidades que ya se vendieron sin subir.
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

/**
 * La cola de una sede — la unidad con la que trabajan las pantallas (Paso 3.1). Cruza
 * cajas cerradas a propósito: una venta que quedó pendiente cuando la caja que la generó
 * ya cerró TIENE que seguir sincronizándose, o se pierde de vista para siempre. Cada
 * `VentaEncolada` ya lleva su propio `cajaId` (el de cuando se vendió), así que subirla no
 * necesita que esa caja siga abierta — la RPC decide sola si todavía puede aceptarla.
 */
export function obtenerColaSede(sedeCodigo: string): VentaEncolada[] {
  return leerCola().filter((v) => v.sedeCodigo === sedeCodigo);
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

/**
 * Cuánto de lo encolado sin subir es en EFECTIVO (Paso 3.1). Importa porque
 * `retail.cerrar_caja` solo suma `ventas.metodo_pago = 'efectivo'` para calcular el monto
 * esperado del cajón — una venta en efectivo atrapada en la cola hace que el conteo físico
 * (que SÍ incluye ese billete, la clienta ya pagó) se vea como un sobrante que en realidad
 * no es un error de nadie, es plata real que el sistema todavía no registró.
 */
export function totalEfectivoEncolado(cola: VentaEncolada[]): number {
  return cola
    .filter((v) => v.metodoPago === "efectivo")
    .flatMap((v) => v.items)
    .reduce((acc, it) => acc + it.cantidad * it.monto, 0);
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
