import { sumarDias } from "./fechas-lima";
import { conDescuentos, leerDescuentos, RPC_DESCUENTO } from "./plan-compra-descuento";
import { RPC_PAGADO, RPC_PAGOS, campanaParaFinanzas, leerPagado, leerPagos } from "./plan-compra-inversion";
import { RPC_PEDIDO, leerPedido } from "./plan-compra-pedido";
import { RPC_PLAZO, diasConQueSeCuenta, leerPlazoFijado, plazoDePedido } from "./plan-compra-plazo";
import { esFirmaDesconocida } from "./plan-compra-propuesta-guardada";
import { RPC_PLAN, RPC_PLANES, armarFilas, leerCampanas, leerPlan, type CampanaPlan } from "./plan-compra-reglas";
import { RPC_VERSIONES, leerVersiones } from "./plan-compra-versiones";

// Lo que el Plan de campaña entrega a Finanzas ▸ Resumen, «Inversión en mercadería» (ADR-0527) — la POLÍTICA de la lectura, sin red propia: recibe el cliente de la base (así se prueba con uno de mentira;
// el real lo pone `plan-compra-inversion-servidor.ts`). SOLO LEE: una campaña por vez, con las MISMAS funciones del Plan (`armarFilas`, `plazoDePedido`…) que
// arman su pantalla, así el Plan y el Resumen nunca dicen dos montos distintos de la misma campaña.
//
// CUÁLES. Las campañas sin archivar que ya tienen algo planeado, que no han terminado y que empiezan en los próximos 120 días (o ya empezaron), las 4 más cercanas: más lejos no mueven la caja que
// Finanzas mira. Solo se arma la que el Plan dejó en «todo» (las de «solo Escenarios» y «no mostrarla» no son del Resumen).
//
// CAÍDA EXTERNA. Se dice qué pasó, nunca un cero que parezca un dato:
//   · la cuenta no tiene el módulo «Plan de campaña», o la base todavía no tiene las funciones (la web se publicó antes que la migración): `datos: null` y sin mensaje; el Resumen no ofrece nada.
//   · una campaña cuya lectura falla (la base lenta o caída, una respuesta que no se entiende) NO entra, y se avisa con `falla`; las otras sí. Una campaña a medias no se dibuja.
//   · si ninguna se pudo leer, `datos: null` y `falla`.

/** @internal La prueba la cruza con lo que dice el Resumen. */
export const FALLA_DEL_PLAN = "No se pudo leer el plan de campaña. Vuelve a cargar la página; si sigue igual, avisa a tu líder.";
/** Cuántos días hacia adelante se miran las campañas, y cuántas como máximo. @internal Las pruebas lo cruzan con la regla de cuáles. */
export const DIAS_HACIA_ADELANTE = 120;
/** @internal */
export const MAX_CAMPANAS = 4;

type Respuesta = { data: unknown; error: { code?: string; message: string } | null };
/** Lo único que se le pide al cliente de la base: llamar una función. Así la política de caídas se prueba sin red. */
export type ClienteDeLectura = { rpc: (nombre: string, args?: Record<string, unknown>) => PromiseLike<Respuesta> };

export type LecturaDeInversion = { datos: Record<string, unknown>[] | null; falla: string | null };

type Una = { tipo: "lista"; campana: Record<string, unknown> } | { tipo: "omitida" } | { tipo: "sin-soporte" } | { tipo: "falla" };

/** ¿La respuesta es «esto no está para ti» (sin el módulo del Plan: 42501) o «no existe todavía» (la web se publicó antes que la migración)? No es una falla: simplemente no se ofrece. */
const noSeOfrece = (e: NonNullable<Respuesta["error"]>) => esFirmaDesconocida(e) || e.code === "42501";

/** @internal La prueba la recorre sola. Las campañas que valen la pena mirar: sin archivar, con algo planeado, sin terminar y que empiezan pronto, de la más cercana en adelante. */
export function campanasParaFinanzas(planes: readonly CampanaPlan[], hoy: string): CampanaPlan[] {
  const tope = sumarDias(hoy, DIAS_HACIA_ADELANTE);
  return planes
    .filter((p) => !p.archivado && p.conPlan > 0 && p.hasta >= hoy && p.desde <= tope)
    .sort((a, b) => a.desde.localeCompare(b.desde) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, MAX_CAMPANAS);
}

async function leerUna(supabase: ClienteDeLectura, c: CampanaPlan): Promise<Una> {
  const arg = { p_plan_id: c.id };
  try {
    const pagosRes = await supabase.rpc(RPC_PAGOS, arg);
    if (pagosRes.error) return noSeOfrece(pagosRes.error) ? { tipo: "sin-soporte" } : { tipo: "falla" };
    const pagos = leerPagos(pagosRes.data);
    if (!pagos) return { tipo: "sin-soporte" };
    // Solo la que el Plan dejó en «todo» es del Resumen: las demás no cuestan ni una lectura más.
    if (pagos.visibilidad !== "todo") return { tipo: "omitida" };

    const [planRes, pedidoRes, plazoRes, versionesRes, descuentoRes, pagadoRes] = await Promise.all([
      supabase.rpc(RPC_PLAN, arg),
      supabase.rpc(RPC_PEDIDO, arg),
      supabase.rpc(RPC_PLAZO, arg),
      supabase.rpc(RPC_VERSIONES, arg),
      supabase.rpc(RPC_DESCUENTO, arg),
      supabase.rpc(RPC_PAGADO, arg),
    ]);
    // Lo que el Plan trata como «una ayuda» (el plazo, el tope, el descuento) cuenta igual aquí si la base todavía no lo tiene; pero un FALLO real cambia los números y no se disimula.
    const falloReal = (r: Respuesta) => !!r.error && !esFirmaDesconocida(r.error);
    if (planRes.error || pedidoRes.error || pagadoRes.error || falloReal(plazoRes) || falloReal(versionesRes) || falloReal(descuentoRes)) {
      if (pagadoRes.error && noSeOfrece(pagadoRes.error)) return { tipo: "sin-soporte" };
      return { tipo: "falla" };
    }
    const plan = conDescuentos(leerPlan(planRes.data), leerDescuentos(descuentoRes.error ? null : descuentoRes.data));
    const pagado = leerPagado(pagadoRes.data);
    if (!plan || !pagado) return { tipo: "falla" };
    const pedido = leerPedido(pedidoRes.data);
    const versiones = leerVersiones(versionesRes.error ? null : versionesRes.data);
    const filas = armarFilas(plan, pedido?.porCategoria, versiones?.precioDeLaPlata ?? 0);
    const plazo = plazoDePedido(plan.plan.desde, plan.plan.hasta, plan.hoy, diasConQueSeCuenta(leerPlazoFijado(plazoRes.error ? null : plazoRes.data)));
    return { tipo: "lista", campana: campanaParaFinanzas({ plan: plan.plan, filas, pedido, tope: plan.tope.valor, plazo, pagos, pagado }) };
  } catch (e) {
    console.error(`inversión en mercadería (${c.nombre}): ${e instanceof Error ? e.message : String(e)}`);
    return { tipo: "falla" };
  }
}

/**
 * Lee, para el Resumen de Finanzas, las campañas que el Plan deja ver. Nunca lanza: una lectura que se cae es `falla`, no una pantalla caída.
 * `datos: null` = no hay nada que ofrecer (sin módulo, o la base aún no lo tiene) o nada se pudo leer; `datos: []` = se pudo leer y no hay campaña que mostrar.
 */
export async function leerInversionDeLasCampanas(supabase: ClienteDeLectura, hoy: string): Promise<LecturaDeInversion> {
  let planes: Respuesta;
  try {
    planes = await supabase.rpc(RPC_PLANES);
  } catch (e) {
    console.error(`${RPC_PLANES} (inversión en mercadería): ${e instanceof Error ? e.message : String(e)}`);
    return { datos: null, falla: FALLA_DEL_PLAN };
  }
  if (planes.error) {
    if (noSeOfrece(planes.error)) return { datos: null, falla: null };
    console.error(`${RPC_PLANES} (inversión en mercadería): ${planes.error.message}`);
    return { datos: null, falla: FALLA_DEL_PLAN };
  }
  const leidas = leerCampanas(planes.data);
  if (!leidas) return { datos: null, falla: FALLA_DEL_PLAN };

  const candidatas = campanasParaFinanzas(leidas.planes, hoy);
  const resultados = await Promise.all(candidatas.map((c) => leerUna(supabase, c)));
  const listas = resultados.flatMap((r) => (r.tipo === "lista" ? [r.campana] : []));
  const fallas = resultados.filter((r) => r.tipo === "falla").length;
  // Si TODAS dicen «la base aún no lo tiene», no hay nada que ofrecer: el Resumen sigue como siempre y no dice nada.
  if (candidatas.length > 0 && resultados.every((r) => r.tipo === "sin-soporte")) return { datos: null, falla: null };
  if (fallas > 0) return { datos: listas.length > 0 ? listas : null, falla: FALLA_DEL_PLAN };
  return { datos: listas, falla: null };
}
