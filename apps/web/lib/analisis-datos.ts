import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DatosAnalisis, PreparacionAnalisis, SedeAnalisis, UmbralesQuieta } from "@/lib/analisis-tipos";
import { conUmbrales, umbralesPorTipo } from "@/lib/analisis-vara";
import { armarPrendas, conPreciosDeMiTienda } from "@/lib/analisis-armado";
import { getPreciosPorSede } from "@/lib/precios-sede-datos";
import { armarModelos, FALLA_ULTIMA_VENTA } from "@/lib/analisis-modelo";
import { conVentanaDeRitmo, diasDeVentas, liquidarDesdeValido, noHabiaDe, sedeDeAnalisis, VENTANA_VENTAS } from "@/lib/analisis-reglas";
import { FALLA_PISO } from "@/lib/analisis-piso";
import { getPrendasPorSede } from "@/lib/analisis-sede";
import { getPorLlegar } from "@/lib/analisis-por-llegar";
import { getProveedoresAnalisis } from "@/lib/analisis-proveedores";
import { recortarProveedores } from "@/lib/analisis-proveedores-lectura";
import { getLiquidarDesde } from "@/lib/analisis-liquidar";
import { getRindePorCategoria } from "@/lib/analisis-rinde";
import { getConteosResumen } from "@/lib/conteos";
import { leerPreparacion, preparacionDeSede, RPC_PREPARACION } from "@/lib/motor-demanda-reglas";
import { getPedidosNoAtendidos } from "@/lib/pedidos-no-atendidos";
import { getUbicaciones, type Ubicacion } from "@/lib/ubicaciones";
import { contarPendientes, leerVendidoSinRegistrar, sinRegistrarPorTipo } from "@/lib/vendido-sin-registrar";
import { getLecturaFrescuraDeTienda } from "@/lib/frescura";
import { hoyLima, sumarDias } from "@/lib/fechas-lima";
import { datosDe } from "@/lib/analisis-con-tope";
import { leerPieza } from "@/lib/analisis-lectura";

// Análisis v4 (ADR-0357): todo lo que la pantalla lee, una vez por visita, desde el servidor. Cada parte que falla se dice en
// `fallas` y deja su sección callada (principio 9): nunca «sin ventas» por un error. Ninguna lectura espera más de `TOPE_LECTURA_MS` ni
// lanza, y lo que se degrada se avisa a Sentry por pieza (`analisis-lectura.ts`, `analisis-con-tope.ts`); aquí no hay `console.error`.
//
// La encargada y el líder ven lo mismo (decisión 3): el dinero y el costo por prenda. Todo es de la tienda elegida arriba; las
// otras tiendas se leen solo para lo que se hace con una prenda de la mía («AQP tiene 3», «Mándalas a Arequipa», «Dónde hay»).
// Lo que no se puede leer —una migración que no está en producción— vuelve vacío con su falla.

/**
 * Solo en desarrollo: ver Análisis completo con los datos locales aunque la tienda no cumpla las tres condiciones de ADR-0346
 * (`ANALISIS_SIN_CANDADO=1` en `.env.local`). En producción no existe: allí manda el motor.
 */
const sinCandado = (): boolean => process.env.NODE_ENV !== "production" && process.env.ANALISIS_SIN_CANDADO === "1";

async function leerPreparacionDeLaRed(): Promise<{ filas: PreparacionAnalisis[]; falla: string | null }> {
  const lectura = await leerPieza("preparacion", {}, async () => {
    const supabase = await createClient();
    // Sin sede: todas las tiendas que la cuenta puede leer (con 20261006213000, todas para quien analiza).
    const { data, error } = await supabase.rpc(RPC_PREPARACION as never, {} as never);
    if (error) throw error;
    return leerPreparacion(data).map((f) => ({ ...preparacionDeSede(f), dias: f.dias, hoy: f.hoy, primeraVenta: f.primeraVenta }));
  });
  const filas = datosDe(lectura);
  return filas ? { filas, falla: null } : { filas: [], falla: "No se pudo leer si el sistema ya puede recomendar en cada tienda" };
}

/** Si no se pudo leer el precio propio de mi tienda, las cifras en soles quedan con el precio de la prenda y la pantalla lo dice. */
const FALLA_PRECIOS_DE_MI_TIENDA = "No se pudo leer el precio propio de tu tienda: las cifras en soles usan el precio de la prenda";

/** Si no se pudo leer lo vendido sin registrar, «Qué pedir» cuenta solo lo vendido con su prenda y la pantalla lo dice. */
const FALLA_SIN_PRENDA = "No se pudo leer lo vendido sin registrar: «Qué pedir» cuenta solo las ventas con su prenda";

/** Si la lectura de Frescura no respondió: «No se vende» juzga sin saber qué puede haberse vendido sin registrar, y se dice. */
const FALLA_FRESCURA = "No se pudo leer Frescura del piso: «No se vende» no sabe qué puede haberse vendido sin registrar";

/**
 * Lo que Análisis usa de la lectura de Frescura de mi tienda (ADR-0357, act. 2026-10-14): por talla, cuántas unidades colgadas pueden ser
 * una venta sin registrar (`dudadas`). Nunca lanza: sin el módulo, o si la sede no separa piso, no se lee; si falla, se dice.
 */
async function leerFrescura(
  activa: Ubicacion,
  conFrescura: boolean,
): Promise<{ estado: DatosAnalisis["frescura"]; dudas: Map<string, number>; umbrales: Map<string, UmbralesQuieta> }> {
  const dudas = new Map<string, number>();
  const umbrales = new Map<string, UmbralesQuieta>();
  if (!conFrescura) return { estado: "sin_modulo", dudas, umbrales };
  if (activa.tipo !== "tienda") return { estado: "no_aplica", dudas, umbrales };
  // Frescura no lanza: su falla vuelve en `fallo`, que puede traer el nombre de la sede. Una falla se relanza para que cuente como error
  // (no como «sin datos»); `avisoDeFalla` solo copia el código del error, nunca su mensaje: a Sentry llega el id de la tienda y no su
  // texto. Los caminos de adentro de Frescura escriben sus propios logs (`frescura-reglas.ts`); si falla lo de afuera (el cliente, el
  // respaldo de CAYLA), el texto solo se ve en la terminal de desarrollo (`leerPieza`).
  const frescura = await leerPieza("frescura", { ubicacion_id: activa.id }, async () => {
    const lectura = await getLecturaFrescuraDeTienda({ id: activa.id, nombre: activa.nombre });
    if (lectura.fallo !== null) throw new Error(lectura.fallo);
    return lectura.datos;
  });
  const datos = datosDe(frescura);
  if (datos === null) return { estado: "fallo", dudas, umbrales };
  if (!datos.separaPiso) return { estado: "no_aplica", dudas, umbrales };
  for (const prenda of datos.prendas) for (const t of prenda.tallas) if ((t.dudadas ?? 0) > 0) dudas.set(t.varianteId, t.dudadas!);
  return { estado: "ok", dudas, umbrales: umbralesPorTipo(datos.categorias) };
}

/** `conFrescura`: si quien mira ve Frescura del piso (la base no le deja leerla sin el módulo). */
export async function getDatosAnalisis(activa: Ubicacion, { conFrescura = false }: { conFrescura?: boolean } = {}): Promise<DatosAnalisis> {
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda" && u.activo);
  const ordenadas = [activa, ...tiendas.filter((u) => u.id !== activa.id)];
  const sedes: SedeAnalisis[] = ordenadas.map(sedeDeAnalisis);
  const ids = sedes.map((s) => s.id);

  const idActiva = { ubicacion_id: activa.id };
  const [motor, lectura, llegan, liquidar, rinde, conteos, pedidos, preciosPropios, sinPrenda, frescura, pendientes, quienPide] = await Promise.all([
    leerPreparacionDeLaRed(),
    getPrendasPorSede(ids),
    getPorLlegar(activa.id),
    getLiquidarDesde(),
    getRindePorCategoria(activa.id),
    leerPieza("conteos", idActiva, () => getConteosResumen(activa.id, 5)).then(datosDe),
    leerPieza("pedidos_no_atendidos", idActiva, () => getPedidosNoAtendidos(activa.id)).then(datosDe),
    // El precio de MI tienda (su precio propio, si lo tiene): solo la mía, de las otras no se lee precio. Si falla, mi tienda no
    // aparece en el mapa (`getPreciosPorSede` no lanza) y se dice (más abajo) en vez de mostrar el precio de la prenda como si fuera
    // el de la caja.
    leerPieza("precios_de_mi_tienda", idActiva, async () => (await getPreciosPorSede([activa.id]))[activa.id] ?? null).then(datosDe),
    // Lo vendido sin registrar de mi tienda en los mismos 30 días de Lima que `vendidas30` (hoy incluido): cuenta en «Qué pedir» por tipo.
    // Si falla, «Qué pedir» cuenta solo lo vendido con su prenda, como antes, y se dice.
    leerPieza("vendido_sin_registrar", idActiva, async () => {
      const supabase = await createClient();
      return leerVendidoSinRegistrar(supabase, activa.id, `${sumarDias(hoyLima(), -(VENTANA_VENTAS - 1))}T00:00:00-05:00`);
    }).then(datosDe),
    leerFrescura(activa, conFrescura),
    // Las ventas sin prenda que todavía se pueden registrar: el número del botón «Registrar N» (las cerradas ya no vuelven).
    leerPieza("pendientes_por_registrar", idActiva, async () => contarPendientes(await createClient(), activa.id)).then(datosDe),
    // A quién se le pide cada modelo (A8): el proveedor del catálogo y los nombres. Si falla, no se dibuja «Pídelo a …» y se dice.
    getProveedoresAnalisis(),
  ]);
  const preciosDeMiTienda = preciosPropios ?? undefined;

  const liquidarDesde = liquidarDesdeValido(liquidar.dias);
  const prepDe = (id: string) => motor.filas.find((f) => f.ubicacionId === id) ?? null;
  const hablaSede = (id: string) => sinCandado() || prepDe(id)?.puedeHablar === true;

  const filasDe = (id: string) => lectura.porSede[id] ?? [];
  const otrasDe = (id: string) => sedes.filter((s) => s.id !== id).map((sede) => ({ sede, filas: filasDe(sede.id) }));
  const hoy = motor.filas[0]?.hoy ?? hoyLima();
  // Los días de ventas que mi tienda tiene en el ERP, hasta 30: el techo del ritmo de cada prenda y de qué días habla «Vendiste».
  const ventana = diasDeVentas(prepDe(activa.id)?.primeraVenta, hoy);
  // Cada talla mide su ritmo en los días que estuvo colgada, de 7 a los días de ventas de mi tienda (2026-10-14, `ventanaDeRitmo`).
  // Y se juzga quieta contra la vara de su tipo (p75 y p90 de Frescura, `analisis-vara.ts`), si la tiene.
  const tallas = conUmbrales(conVentanaDeRitmo(armarPrendas(conPreciosDeMiTienda(filasDe(activa.id), preciosDeMiTienda), otrasDe(activa.id), llegan.porVariante), hoy, ventana), frescura.umbrales).map((p) => ({
    ...p,
    ...(frescura.estado === "ok" ? { enDuda: frescura.dudas.get(p.varianteId) ?? 0 } : {}),
  }));
  // Lo que miden y listan las pestañas: el MODELO entero, con todas sus tallas y colores (ADR-0357, decisión 12).
  const prendas = armarModelos(tallas, hoy);
  const sabeUltimaVenta = lectura.sabeUltimaVenta[activa.id] === true;
  const fallaUltima = lectura.sabeUltimaVenta[activa.id] === false ? FALLA_ULTIMA_VENTA : null;

  // Si mi tienda respondió pero sin decir cuándo salió al piso cada prenda (la base todavía no tiene 20261007120000), se dice una
  // vez; si no respondió, ya lo dice la falla de la lectura.
  const sabePiso = lectura.sabePiso[activa.id] === true;
  const fallaPiso = lectura.sabePiso[activa.id] === false ? FALLA_PISO : null;

  // El último conteo cerrado de la tienda: cuántas prendas contó y en cuántas el sistema coincidió.
  const ultimoConteo = conteos?.find((c) => c.estado === "cerrado" && c.lineas > 0) ?? null;

  return {
    hoy,
    sede: sedes[0]!,
    sedes,
    preparacion: motor.filas,
    puedeHablar: hablaSede(activa.id),
    prendas,
    tallas,
    diasDeVentas: ventana,
    sabePiso,
    sabeUltimaVenta,
    liquidarDesde,
    sinPrendaPorTipo: sinPrenda ? sinRegistrarPorTipo(sinPrenda) : {},
    frescura: frescura.estado,
    porRegistrar: { pendientes, cerradas30: sinPrenda ? sinPrenda.filter((v) => v.estado === "cerrada_sin_prenda").length : null },
    rebajaDe100: lectura.rebajaDe100[activa.id] ?? null,
    // Solo lo que las prendas de esta tienda pueden usar: el directorio y el catálogo enteros no viajan al navegador.
    proveedores: quienPide.proveedores ? recortarProveedores(quienPide.proveedores, tallas) : null,
    rinde: rinde.rinde,
    conteo: ultimoConteo ? { contadas: ultimoConteo.lineas, coinciden: Math.max(0, ultimoConteo.lineas - ultimoConteo.lineasConDiferencia) } : null,
    noHabia: noHabiaDe(pedidos ?? []),
    sedesSinLeer: lectura.sedesSinLeer,
    fallas: [motor.falla, lectura.falla, fallaPiso, fallaUltima, preciosDeMiTienda === undefined ? FALLA_PRECIOS_DE_MI_TIENDA : null, llegan.falla, liquidar.falla, rinde.falla, conteos === null ? "No se pudo leer el último conteo" : null, pedidos === null ? "No se pudo leer «Te pidieron y no había»" : null, sinPrenda === null ? FALLA_SIN_PRENDA : null, frescura.estado === "fallo" ? FALLA_FRESCURA : null, quienPide.falla].filter(
      (f): f is string => f !== null,
    ),
  };
}
