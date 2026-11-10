import { Suspense } from "react";
import { exigirModulo, puede, veEstadosFinancierosDeTodoDe, veFinanzasDeTodoDe, veModulo } from "@/lib/persona-actual";
import { getValorInventario } from "@/lib/valor-inventario";
import { Movimientos, MovimientosEsperando } from "@/components/finanzas/bolsillos/Movimientos";
import { hoyLima } from "@/lib/fechas-lima";
import { conIgvDelMesAnterior, getConfianzaFinanzas, getResumenFinanzas } from "@/lib/resumen-finanzas";
import { estadoDelMesYaLeido, flujoDelResumen, leerVerResumen } from "@/lib/resumen-finanzas-reglas";
import { crearCupos } from "@/lib/cupos";
import { getBalancePorTienda } from "@/lib/balance";
import { getEstadoResultados, getFaltaDelMes } from "@/lib/resultados";
import { conIgvDeLasVentasDe } from "@/lib/igv-ventas";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { getFlujoProximo, getTiendasActivas, getVentasPorDia } from "@/lib/resumen-telar";
import { getInversionMercaderia } from "@/lib/inversion-mercaderia";
import { hrefTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mismasTiendas, tiendasAdivinadas, tiendasDeLaLinea } from "@/lib/resumen-telar-reglas";
import { conElRango, leerPeriodo, periodoAnterior } from "@/lib/estados-periodo";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { ResumenFinanzasPanel } from "@/components/finanzas/ResumenFinanzas";
import { getCostoEstimado } from "@/lib/costo-estimado";
import { pctCostoEstimado } from "@/lib/costo-estimado-reglas";
import { getPlanillaParaElInicio } from "@/lib/cuentas-dinero";

// Finanzas ▸ Resumen en El telar (ADR-0195 F10; ADR-0493, Felipe 2026-10-23). La sede la elige la barra común (`?sede=`; mientras dure el cambio,
// `?ver=` gana). Las fechas, desde el camino «A · Bolsillos» (Felipe 2026-11-09), con el calendario de Estados financieros (`SelectorPeriodo`): un mes
// entero (`?mes=`, el mismo que viaja al resto de Finanzas) o cualquier tramo (`?desde=&hasta=`). Lecturas, todas de solo lectura y a la vez cuando no dependen una de otra:
//   - `fn_resumen_finanzas`: los avisos de «Hoy te toca», la confianza y las unidades (de HOY: es lo que toca decidir ahora);
//   - `fn_estado_resultados` del mes elegido (al día de hoy si es el mes en curso) y del tramo con que se compara: la respuesta de
//     la cabecera, el orillo y el recorrido salen de aquí, así que el mes de la barra filtra de verdad (auditoría v3);
//   - `fn_rendimiento_serie` de cada tienda, si la cuenta ve Rendimiento: la línea de ventas contra la meta (pedida a la vez que el resto, ADR-0583);
//   - `fn_flujo_caja_proyeccion`, la misma de Dinero ▸ Flujo: «Tu caja en las próximas dos semanas»;
//   - la inversión en mercadería que entrega el Plan de campaña (`getInversionMercaderia`, ADR-0527): si la cuenta no ve el Plan o la base aún no la trae, el Resumen no ofrece nada; si se cae, lo dice.
// Quien no ve las finanzas de todo mira su sede: lo decide la base.
//
// CUÁNTAS A LA VEZ (2026-11-09, el pico de memoria de producción). La base tiene 2 núcleos y cada lectura pesada arma el diario contable:
// lanzadas todas juntas no terminan antes, pero cada una ocupa su memoria al mismo tiempo, y una sola carga de Resumen empujaba la máquina a
// usar swap. Las PESADAS pasan por un turnero de `CUPOS_PESADOS`; las livianas (la sede, los parámetros, la confianza…) salen de inmediato.
// 3 y no 2: con los tiempos medidos en producción (el resumen ~6 s; el balance, el flujo, la comparación y la inversión, de 2 a 4 s cada una),
// con 2 todo lo demás esperaría detrás del resumen y la página pasaría de ~6,6 s a ~10 s; con 3 tarda casi lo mismo y el pico baja a la mitad.
// Se afina con `finanzas_resumen_ms` en los logs. Y ni el estado de resultados del mes ni el flujo de caja se piden dos veces: si el resumen
// ya los armó igual (todas las sedes, del 1 a hoy; la proyección con sus cobros), se usan esos (`estadoDelMesYaLeido`, `flujoDelResumen`).
const CUPOS_PESADOS = 3;

export default async function ResumenFinanzasPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string; mes?: string; desde?: string; hasta?: string; inversion?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mesDeHoy = mesDelDia(hoy);
  // Desde cuándo hay Finanzas: el calendario no ofrece antes y la comparación tampoco va antes. Se pide a la vez que lo demás.
  const minimoP = getParametrosFinanzas().then((p) => p?.inicioFinanzas ?? null);
  // El período del calendario (el mismo que lee Estados financieros). Lo que va por mes (la confianza, el equilibrio) usa su `mes`, el de `hasta`.
  const periodo = leerPeriodo(sp, hoy);
  const mes = periodo.mes;
  const veTodo = veFinanzasDeTodoDe(persona);
  const pedido = leerVerResumen(sedeDeLaUrl(sp), veTodo);
  const tramo = { desde: periodo.desde, hasta: periodo.hasta };
  // La línea de ventas (si la cuenta ve Rendimiento) se pide A LA VEZ que todo lo demás, con las tiendas adivinadas de la URL (ADR-0583): antes
  // esperaba al resumen entero para saber qué tiendas pedir. Si la base resolvió otras, se piden de nuevo abajo.
  const veRendimiento = veModulo(persona, "rendimiento");
  const pesada = crearCupos(CUPOS_PESADOS);
  // El resumen entra primero al turnero: es la más larga, y el estado de resultados del mes puede salir de él.
  // Con el IGV del mes anterior si alguna tienda perdió (tarea 19): «Hoy te toca» dice cuánto necesitaba vender, y eso va con IGV.
  const resumenP = pesada(() => getResumenFinanzas(pedido).then(conIgvDelMesAnterior));
  const ventasAdelantadas = veRendimiento
    ? getTiendasActivas().then(async (activas) => {
        const ids = tiendasAdivinadas(pedido, persona.ubicacionId, activas);
        return { ids, ventas: await pesada(() => getVentasPorDia(ids, tramo.desde, tramo.hasta)) };
      })
    : null;

  // Cuánto de lo vendido lleva costo estimado en cada tienda (tarea 75): la función de la base, pedida sede por sede; la fila de CAYLA, sin sede. Solo quien ve todas.
  const estimadosPorSede = veTodo
    ? getSedesDelTelar().then(async ({ sedes }) => {
        const claves = [...sedes.filter((s) => s.color !== "tal" && s.color !== "emp" && s.clave).map((s) => s.clave as string), null];
        const lecturas = await Promise.all(claves.map((c) => getCostoEstimado(tramo.desde, tramo.hasta, c)));
        return Object.fromEntries(claves.map((c, i) => [c ?? "todas", pctCostoEstimado(lecturas[i]!.datos)]));
      })
    : Promise.resolve(null);

  const [resumenLeido, confianza, erMes, erAntes, telar, flujoProximo, inversion, adelantadas, faltaDelMes, planillaPorRegistrar, cajasPorSede, minimo, inventarioValor, estimados] = await Promise.all([
    resumenP,
    getConfianzaFinanzas(pedido, mes),
    // Del resumen si ya lo armó igual; si no, aparte, por el turnero. Con el IGV de las ventas (ADR-0624) para que «Cada sede, junta» diga lo vendido con IGV;
    // si no se puede leer, la tabla sale sin IGV y lo dice.
    resumenP.then(async ({ datos: r }) => {
      const yaLeido = estadoDelMesYaLeido(r, tramo);
      const lectura = yaLeido ? { datos: yaLeido, falla: null } : await pesada(() => getEstadoResultados(tramo.desde, tramo.hasta));
      return conIgvDeLasVentasDe(tramo.desde, tramo.hasta, lectura);
    }),
    // Contra qué se compara: el mes pasado a la misma fecha, el mes anterior entero o los mismos días justo antes. Antes de que Finanzas empezara, nada.
    minimoP.then((min) => {
      const comparar = periodoAnterior(periodo, min);
      return comparar ? pesada(() => getEstadoResultados(comparar.desde, comparar.hasta)) : null;
    }),
    getSedesDelTelar(),
    // Del resumen si ya la trajo entera (con sus cobros, desde 20261109175000); si no, aparte, por el turnero.
    resumenP.then(({ datos: r }) => flujoDelResumen(r) ?? pesada(() => getFlujoProximo())),
    pesada(() => getInversionMercaderia(hoy, sp.inversion === "ejemplo")),
    ventasAdelantadas ?? Promise.resolve(null),
    periodo.unMes && mes === mesDeHoy ? getFaltaDelMes(mes) : Promise.resolve([]),
    // La planilla que Dynamic pagó y aquí no bajó del banco: «¿Cuánto tienes?» la sigue sumando, y lo dice. Sin lectura, calla: el aviso sale en el cajón.
    persona.rol === "lider" ? getPlanillaParaElInicio().catch(() => undefined) : Promise.resolve(undefined),
    // «Cada sede, junta» (tarea 27): la caja de cada sede a la misma fecha que las cifras del mes. Solo quien ve todas las sedes.
    veTodo ? pesada(() => getBalancePorTienda(tramo.hasta)) : Promise.resolve(null),
    minimoP,
    // Lo que vale la ropa a costo (la hoja «La ropa que tienes»): la misma lectura de Existencias, que la base solo da con el dinero de Compras.
    veTodo && (persona.rol === "lider" || puede(persona, "verDineroCompras")) ? getValorInventario() : Promise.resolve(null),
    estimadosPorSede,
  ]);
  const { datos, falla } = resumenLeido;
  const tiendas = datos ? tiendasDeLaLinea(datos) : [];
  const ventas = !veRendimiento
    ? null
    : adelantadas && mismasTiendas(adelantadas.ids, tiendas)
      ? adelantadas.ventas
      : await pesada(() => getVentasPorDia(tiendas, tramo.desde, tramo.hasta));

  // «Movimientos» (camino A): la plata que entró y salió, de `fn_flujo_caja_real`, que es de CAYLA entera (la base pide ver los estados de todo). Llega
  // aparte, en su `Suspense`, para que el resto del Resumen no la espere.
  const actuales = Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string");
  const movimientos = veEstadosFinancierosDeTodoDe(persona) ? (
    <Suspense fallback={<MovimientosEsperando />}>
      <Movimientos periodo={periodo} hoy={hoy} hrefFlujo={conElRango(hrefTelar("/finanzas/reportes/flujo", actuales, {}, { mismaPantalla: false, mesDeHoy }), actuales)} />
    </Suspense>
  ) : null;

  return (
    <ResumenFinanzasPanel
      movimientos={movimientos}
      inventarioValor={inventarioValor}
      resumen={datos}
      falla={falla}
      confianza={confianza}
      mes={mes}
      periodo={periodo}
      minimo={minimo}
      hoy={hoy}
      estadoMes={erMes}
      estadoAntes={!erAntes || erAntes.falla ? null : erAntes.datos}
      faltaDelMes={faltaDelMes}
      planillaSinSalida={planillaPorRegistrar?.total || null}
      ventasPorDia={ventas}
      sedes={telar.sedes}
      flujoProximo={flujoProximo}
      inversion={inversion.datos}
      inversionFalla={inversion.falla}
      acceso={{ lider: veTodo, modulos: persona.modulos.map((m) => m.clave) }}
      cajasPorSede={cajasPorSede}
      inicioFinanzas={minimo}
      estimadosPorSede={estimados}
      sueldosSinLeer={!!(erMes.sueldosSinLeer || resumenLeido.sueldosSinLeer)}
    />
  );
}
