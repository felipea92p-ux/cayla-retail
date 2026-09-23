/**
 * La cola de ventas offline (BACKLOG "resiliencia sin internet"; diseño original ADR-0036,
 * V1, 2026-09-11 — se borró en el corte V1→V2 sin haber estado mal, y se recupera acá
 * adaptada a lo que cambió desde entonces).
 *
 * EL PROBLEMA. Si se corta la red a mitad de una venta, `registrar_venta` (ADR-0032) ya
 * sabe no duplicar un reintento — pero el navegador todavía necesita algo que reintentar.
 * Sin esto, la Encargada ve un error, la clienta está pagando en el mostrador, y la venta
 * se pierde o se anota en papel.
 *
 * LA REGLA DE NEGOCIO (ADR-0013 §C, decisión de Felipe): vender sin red se permite SOLO
 * si queda al menos 1 unidad de PISO después de la venta. Dos sedes no pueden coordinarse
 * mientras están offline, así que la única defensa real es no dejar que el stock local
 * llegue a cero sin que el servidor lo confirme.
 *
 * QUÉ CAMBIÓ DESDE V1, Y POR QUÉ ESTE ARCHIVO NO ES UNA COPIA:
 * 1. `registrar_venta` pasó de 5 a 11 parámetros (piso/almacén, descuento con motivo y
 *    escalonado, código, nota, comprobante+clienta) — `ParamsRegistrarVenta` es el
 *    payload de HOY, y se guarda tal cual para reenviarlo sin recalcular nada desde un
 *    carrito que pudo haber cambiado.
 * 2. El stock ahora es piso+almacén por sububicación (`lib/stock-por-sede.ts`,
 *    `getStockPorUbicacion` en `lib/inventario-v2.ts`) — el umbral se evalúa sobre el
 *    PISO (`stockAqui` que ya trae esa cuenta), nunca el almacén en silencio (principio 4).
 * 3. La cola vive en `lib/almacen-local.ts` (ADR-0049): una llave POR SEDE
 *    (`claveLocal(ubicacionId, "cola")`), así que a diferencia de V1 no hace falta
 *    filtrar un almacén global por `sedeCodigo` — la partición ya la hace la llave.
 * 4. `esFalloDeRed()` vive en `lib/error-escritura.ts` (reusa `SIN_RED`, la misma lista
 *    de huellas que ya traduce errores de escritura) — acá no se duplica.
 *
 * QUÉ VIVE ACÁ (puro, sin React ni Supabase, para poder probarlo sin montar nada):
 * la aritmética del overlay de stock comprometido y el umbral de sobra. QUÉ NO VIVE ACÁ:
 * el cliente de Supabase y el trío de sincronización (mount / evento `online` / latido de
 * 30 s) — necesitan `useEffect` y viven en `PuntoDeVenta.tsx` (ADR-0043: es el único
 * componente con estado del módulo), con el mismo patrón que ya usa `enEspera`.
 */

import type { MetodoPago } from "@cayla-retail/shared";
import { ID_CARGO_ESPECIAL } from "./cargo-especial";
import type { Firma } from "./responsable-reglas";

export type ItemVentaEncolada = { varianteId: string; cantidad: number };

/** Un ítem de `p_items`, tal cual lo arma `cobrar()` hoy en `PuntoDeVenta.tsx`. */
export type ItemRegistrarVenta = {
  variante_id: string;
  cantidad: number;
  precio_unitario: number;
  descuento_unitario: number;
  motivo_descuento?: string;
  motivo_descuento_detalle?: string;
  argumento_descuento?: string;
  /** La etiqueta de campaña que dio el descuento; solo con `motivo_descuento: "campana"`. */
  descuento_etiqueta_id?: string;
  /** Solo en una «Prenda sin registrar» (ADR-0179): lo que almacén necesita para regularizarla. */
  descripcion_libre?: string;
  categoria_id?: string;
  talla_id?: string;
  color_codigo?: string;
};

/** El payload completo de `registrar_venta` (16 parámetros, hoy; la caja usa los 12 primeros). Se guarda entero en la
 *  cola y se reenvía sin cambios al subir — el `p_token` adentro es el mismo que dejó el
 *  envío que falló, así que un reintento (desde esta pestaña o desde otra) no duplica. */
export type ParamsRegistrarVenta = {
  p_ubicacion_id: string;
  p_items: ItemRegistrarVenta[];
  p_pagos: { metodo: MetodoPago; monto: number; recibido?: number }[];
  p_token: string;
  p_tipo_comprobante: "boleta" | "factura" | "nota_venta";
  p_cliente_tipo_doc: "dni" | "ruc" | "sin_documento";
  p_cliente_num_doc?: string;
  p_cliente_nombre?: string;
  p_codigo_descuento?: string;
  p_nota?: string;
  /** El RESPONSABLE de la venta (combo del ADR-0161; antes, la fila «Atendió» del ADR-0163). Es el mismo uuid que
   *  viaja en `x-responsable`: la venta queda a nombre de quien la hizo, no de la cuenta. */
  p_asesora_id?: string;
};

export type VentaEncolada = {
  /** El mismo `p_token` que ADR-0032 usa para no duplicar un reintento; también identifica
   *  la fila dentro de la cola (reemplaza, nunca duplica). */
  token: string;
  ubicacionId: string;
  creadoEn: string;
  /** Liviano, solo para el overlay de stock — el payload real para subir es `params`. */
  items: ItemVentaEncolada[];
  params: ParamsRegistrarVenta;
  /** `null` mientras sigue sin subir por falta de conexión (el latido la sigue
   *  reintentando sola). Con un motivo traducido: el servidor la rechazó de verdad (ej.
   *  la caja ya cerró) — deja de reintentarse sola y espera un "Descartar" a mano
   *  (ADR-0036, addendum "Descartar"): reintentar a ciegas solo repetiría el mismo
   *  rechazo cada 30 s sin decir nada útil. */
  rechazo: string | null;
};

/** Cuánto de cada variante está comprometido por ventas encoladas que todavía no
 *  subieron (sumando entre todas las de la cola: dos ventas offline seguidas de la misma
 *  prenda comprometen las dos). El "Monto manual" (`ID_CARGO_ESPECIAL`) no controla
 *  stock — no entra acá. Una venta ya RECHAZADA (`rechazo !== null`) tampoco: el servidor
 *  la rechazó de verdad, así que no existe (la transacción de `registrar_venta` se
 *  revierte entera al fallar) — seguir descontándola dejaría la pantalla mostrando MENOS
 *  stock del que en realidad hay, y podría bloquear una venta válida por un fantasma. */
export function stockComprometido(cola: readonly VentaEncolada[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const venta of cola) {
    if (venta.rechazo !== null) continue;
    for (const item of venta.items) {
      if (item.varianteId === ID_CARGO_ESPECIAL) continue;
      mapa.set(item.varianteId, (mapa.get(item.varianteId) ?? 0) + item.cantidad);
    }
  }
  return mapa;
}

/** El overlay: descuenta de `stockAqui` (el PISO que ya trae cada variante) lo que la
 *  cola ya comprometió. Sin esto, una segunda venta sin red vería el mismo stock que vio
 *  la primera — es lo que permite que dos ventas sin red de la última unidad pasen las
 *  dos. Se aplica en `PuntoDeVenta.tsx` sobre las `variantes` que llegan por props del
 *  servidor, ANTES de derivar catálogo, búsqueda y grilla — así toda la pantalla, no solo
 *  el chequeo del umbral, ve el stock real disponible. */
export function conStockComprometidoDescontado<T extends { varianteId: string; stockAqui: number }>(
  variantes: readonly T[],
  cola: readonly VentaEncolada[],
): T[] {
  const comprometido = stockComprometido(cola);
  if (comprometido.size === 0) return variantes as T[];
  return variantes.map((v) => {
    const c = comprometido.get(v.varianteId);
    return c ? { ...v, stockAqui: Math.max(0, v.stockAqui - c) } : v;
  });
}

/** La regla del umbral (ADR-0013 §C): tras vender `cantidad`, ¿queda al menos 1 unidad de
 *  PISO? `stockAqui` tiene que venir YA con el overlay aplicado — es lo que la Encargada
 *  está viendo en pantalla, así que es sobre ESE número que se juzga. */
export function pasaElUmbralDeSobra(stockAqui: number, cantidad: number): boolean {
  return stockAqui - cantidad >= 1;
}

/** Si TODO el carrito puede venderse sin red — todo o nada, no se puede encolar la mitad
 *  de una venta. Agrupa por variante (dos líneas de la misma prenda comprometen juntas,
 *  igual que `stockComprometido`) y exige el umbral en cada una contra el mapa de stock
 *  YA overlayed que llega desde `PuntoDeVenta.tsx`. El "Monto manual" nunca bloquea. */
export function carritoPasaElUmbral(items: readonly ItemVentaEncolada[], stockPisoOverlay: ReadonlyMap<string, number>): boolean {
  const pedido = new Map<string, number>();
  for (const it of items) {
    if (it.varianteId === ID_CARGO_ESPECIAL) continue;
    pedido.set(it.varianteId, (pedido.get(it.varianteId) ?? 0) + it.cantidad);
  }
  for (const [varianteId, cantidad] of pedido) {
    if (!pasaElUmbralDeSobra(stockPisoOverlay.get(varianteId) ?? 0, cantidad)) return false;
  }
  return true;
}

/** Cuánto de lo encolado sin subir es en EFECTIVO. Importa porque `retail.cerrar_caja`
 *  solo suma `ventas.metodo_pago = 'efectivo'` que YA está en la base para calcular el
 *  "esperado" del cajón — una venta en efectivo atrapada en la cola no entra en ese
 *  cálculo todavía, así que el conteo físico (que SÍ tiene ese billete, la clienta ya
 *  pagó) se leería como un sobrante que no es un error de nadie. Expuesto acá para quien
 *  integre esto a `CerrarCajaModalV2` (fuera del alcance de esta sesión — ver BACKLOG);
 *  una venta rechazada (`rechazo !== null`) no está "guardada esperando subir", así que
 *  no se cuenta como plata en camino al cajón.
 */
export function totalEfectivoEncolado(cola: readonly VentaEncolada[]): number {
  return cola
    .filter((v) => v.rechazo === null)
    .flatMap((v) => v.params.p_pagos)
    .filter((p) => p.metodo === "efectivo")
    .reduce((acc, p) => acc + p.monto, 0);
}

/**
 * La firma con la que se sube una venta encolada (ADR-0161/0162): el responsable que se eligió al cobrar
 * (`p_asesora_id`), la tienda de la venta y —la diferencia con una venta en línea— `x-momento` con la HORA DE LA
 * VENTA, no la de la sincronización (Felipe, 2026-09-22, igual que `timestamp_cliente` en Dynamic). Así la base
 * valida que la persona estaba presente cuando cobró, aunque suba horas después, cuando ya marcó su salida.
 * `null` para una venta encolada antes de existir el combo: sube como antes (la base decide si la acepta).
 */
export function firmaDeVentaEncolada(venta: Pick<VentaEncolada, "ubicacionId" | "creadoEn" | "params">): Firma | null {
  const responsableId = venta.params.p_asesora_id;
  if (!responsableId) return null;
  return { responsableId, ubicacionId: venta.ubicacionId, momento: venta.creadoEn };
}
