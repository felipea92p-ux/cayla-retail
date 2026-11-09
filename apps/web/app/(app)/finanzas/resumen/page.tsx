import { exigirModulo, veFinanzasDeTodoDe, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getConfianzaFinanzas, getResumenFinanzas } from "@/lib/resumen-finanzas";
import { leerVerResumen } from "@/lib/resumen-finanzas-reglas";
import { getBalancePorTienda } from "@/lib/balance";
import { getEstadoResultados, getFaltaDelMes } from "@/lib/resultados";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { getFlujoProximo, getTiendasActivas, getVentasPorDia } from "@/lib/resumen-telar";
import { getInversionMercaderia } from "@/lib/inversion-mercaderia";
import { mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mismasTiendas, tiendasAdivinadas, tiendasDeLaLinea } from "@/lib/resumen-telar-reglas";
import { leerPeriodo, periodoAnterior } from "@/lib/estados-periodo";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { ResumenFinanzasPanel } from "@/components/finanzas/ResumenFinanzas";
import { getCuentaClaure } from "@/lib/cuenta-claure";
import { getPlanillaParaElInicio } from "@/lib/cuentas-dinero";
import { resumenClaure } from "@/lib/cuenta-claure-reglas";

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
  const ventasAdelantadas = veRendimiento
    ? getTiendasActivas().then(async (activas) => {
        const ids = tiendasAdivinadas(pedido, persona.ubicacionId, activas);
        return { ids, ventas: await getVentasPorDia(ids, tramo.desde, tramo.hasta) };
      })
    : null;

  const [{ datos, falla }, confianza, erMes, erAntes, telar, flujoProximo, inversion, claureLeido, adelantadas, faltaDelMes, planillaPorRegistrar, cajasPorSede, minimo] = await Promise.all([
    getResumenFinanzas(pedido),
    getConfianzaFinanzas(pedido, mes),
    getEstadoResultados(tramo.desde, tramo.hasta),
    // Contra qué se compara: el mes pasado a la misma fecha, el mes anterior entero o los mismos días justo antes. Antes de que Finanzas empezara, nada.
    minimoP.then((min) => {
      const comparar = periodoAnterior(periodo, min);
      return comparar ? getEstadoResultados(comparar.desde, comparar.hasta) : null;
    }),
    getSedesDelTelar(),
    getFlujoProximo(),
    getInversionMercaderia(hoy, sp.inversion === "ejemplo"),
    // Lo que se le debe a CLAURE (ADR-0560, actividad 4): solo quien ve las finanzas de todo (los bancos son de la empresa) y con el módulo Cuentas y dinero.
    veTodo ? getCuentaClaure() : Promise.resolve(null),
    ventasAdelantadas ?? Promise.resolve(null),
    periodo.unMes && mes === mesDeHoy ? getFaltaDelMes(mes) : Promise.resolve([]),
    // La planilla que Dynamic pagó y aquí no bajó del banco: «¿Cuánto tienes?» la sigue sumando, y lo dice. Sin lectura, calla: el aviso sale en el cajón.
    persona.rol === "lider" ? getPlanillaParaElInicio().catch(() => undefined) : Promise.resolve(undefined),
    // «Cada sede, junta» (tarea 27): la caja de cada sede a la misma fecha que las cifras del mes. Solo quien ve todas las sedes.
    veTodo ? getBalancePorTienda(tramo.hasta) : Promise.resolve(null),
    minimoP,
  ]);
  // `null`: la cuenta no lo ve o CLAURE no tiene nada todavía (la tarjeta no se dibuja); `{ saldo: null }`: se cayó la lectura (se dice, no se inventa).
  const claure =
    !claureLeido || claureLeido.sinAcceso
      ? null
      : claureLeido.falla
        ? { saldo: null }
        : claureLeido.datos.filas.length || claureLeido.datos.pagos.length
          ? { saldo: resumenClaure(claureLeido.datos.filas, claureLeido.datos.pagos, claureLeido.datos.gastos).saldo }
          : null;
  const tiendas = datos ? tiendasDeLaLinea(datos) : [];
  const ventas = !veRendimiento
    ? null
    : adelantadas && mismasTiendas(adelantadas.ids, tiendas)
      ? adelantadas.ventas
      : await getVentasPorDia(tiendas, tramo.desde, tramo.hasta);

  return (
    <ResumenFinanzasPanel
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
      claure={claure}
      cajasPorSede={cajasPorSede}
    />
  );
}
