import { exigirModulo, veFinanzasDeTodoDe, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { conIgvDelMesAnterior, getConfianzaFinanzas, getResumenFinanzas } from "@/lib/resumen-finanzas";
import { leerVerResumen } from "@/lib/resumen-finanzas-reglas";
import { getBalancePorTienda } from "@/lib/balance";
import { getEstadoResultados, getFaltaDelMes } from "@/lib/resultados";
import { conIgvDeLasVentasDe } from "@/lib/igv-ventas";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { getFlujoProximo, getTiendasActivas, getVentasPorDia } from "@/lib/resumen-telar";
import { getInversionMercaderia } from "@/lib/inversion-mercaderia";
import { esMesTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mismasTiendas, tiendasAdivinadas, tiendasDeLaLinea, tramoDeComparacion, tramoDelMes } from "@/lib/resumen-telar-reglas";
import { ResumenFinanzasPanel } from "@/components/finanzas/ResumenFinanzas";
import { getCuentaClaure } from "@/lib/cuenta-claure";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { getCostoEstimado } from "@/lib/costo-estimado";
import { pctCostoEstimado } from "@/lib/costo-estimado-reglas";
import { getPlanillaParaElInicio } from "@/lib/cuentas-dinero";
import { resumenClaure } from "@/lib/cuenta-claure-reglas";

// Finanzas ▸ Resumen en El telar (ADR-0195 F10; ADR-0493, Felipe 2026-10-23). La sede y el mes los elige la barra común (`?sede=`,
// `?mes=`; mientras dure el cambio, `?ver=` gana). Lecturas, todas de solo lectura y a la vez cuando no dependen una de otra:
//   - `fn_resumen_finanzas`: los avisos de «Hoy te toca», la confianza y las unidades (de HOY: es lo que toca decidir ahora);
//   - `fn_estado_resultados` del mes elegido (al día de hoy si es el mes en curso) y del tramo con que se compara: la respuesta de
//     la cabecera, el orillo y el recorrido salen de aquí, así que el mes de la barra filtra de verdad (auditoría v3);
//   - `fn_rendimiento_serie` de cada tienda, si la cuenta ve Rendimiento: la línea de ventas contra la meta (pedida a la vez que el resto, ADR-0583);
//   - `fn_flujo_caja_proyeccion`, la misma de Dinero ▸ Flujo: «Tu caja en las próximas dos semanas»;
//   - la inversión en mercadería que entrega el Plan de campaña (`getInversionMercaderia`, ADR-0527): si la cuenta no ve el Plan o la base aún no la trae, el Resumen no ofrece nada; si se cae, lo dice.
// Quien no ve las finanzas de todo mira su sede: lo decide la base.
export default async function ResumenFinanzasPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string; mes?: string; inversion?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mesDeHoy = mesDelDia(hoy);
  const mes = esMesTelar(sp.mes) && sp.mes <= mesDeHoy ? sp.mes : mesDeHoy;
  const veTodo = veFinanzasDeTodoDe(persona);
  const pedido = leerVerResumen(sedeDeLaUrl(sp), veTodo);
  const tramo = tramoDelMes(mes, hoy)!;
  const comparar = tramoDeComparacion(mes, hoy);
  // La línea de ventas (si la cuenta ve Rendimiento) se pide A LA VEZ que todo lo demás, con las tiendas adivinadas de la URL (ADR-0583): antes
  // esperaba al resumen entero para saber qué tiendas pedir. Si la base resolvió otras, se piden de nuevo abajo.
  const veRendimiento = veModulo(persona, "rendimiento");
  const ventasAdelantadas = veRendimiento
    ? getTiendasActivas().then(async (activas) => {
        const ids = tiendasAdivinadas(pedido, persona.ubicacionId, activas);
        return { ids, ventas: await getVentasPorDia(ids, tramo.desde, tramo.hasta) };
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

  const [resumenLeido, confianza, erMes, erAntes, telar, flujoProximo, inversion, claureLeido, adelantadas, faltaDelMes, planillaPorRegistrar, cajasPorSede, parametros, estimados] = await Promise.all([
    getResumenFinanzas(pedido).then(conIgvDelMesAnterior),
    getConfianzaFinanzas(pedido, mes),
    // Con el IGV de las ventas (ADR-0624) para que «Cada sede, junta» diga lo vendido con IGV. Si no se puede leer, la tabla sale sin IGV y lo dice.
    getEstadoResultados(tramo.desde, tramo.hasta).then((l) => conIgvDeLasVentasDe(tramo.desde, tramo.hasta, l)),
    getEstadoResultados(comparar.desde, comparar.hasta),
    getSedesDelTelar(),
    getFlujoProximo(),
    getInversionMercaderia(hoy, sp.inversion === "ejemplo"),
    // Lo que se le debe a CLAURE (ADR-0560, actividad 4): solo quien ve las finanzas de todo (los bancos son de la empresa) y con el módulo Cuentas y dinero.
    veTodo ? getCuentaClaure() : Promise.resolve(null),
    ventasAdelantadas ?? Promise.resolve(null),
    mes === mesDeHoy ? getFaltaDelMes(mes) : Promise.resolve([]),
    // La planilla que Dynamic pagó y aquí no bajó del banco: «¿Cuánto tienes?» la sigue sumando, y lo dice. Sin lectura, calla: el aviso sale en el cajón.
    persona.rol === "lider" ? getPlanillaParaElInicio().catch(() => undefined) : Promise.resolve(undefined),
    // «Cada sede, junta» (tarea 27): la caja de cada sede a la misma fecha que las cifras del mes. Solo quien ve todas las sedes.
    veTodo ? getBalancePorTienda(tramo.hasta) : Promise.resolve(null),
    // Desde cuándo cuenta Finanzas (ADR-0332): un mes anterior sale vacío porque no se mide, y se dice. `leerResumen` lo sabe solo para el mes anterior a HOY, no para el de la barra.
    getParametrosFinanzas(),
    estimadosPorSede,
  ]);
  const { datos, falla } = resumenLeido;
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
      hoy={hoy}
      estadoMes={erMes}
      estadoAntes={erAntes.falla ? null : erAntes.datos}
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
      inicioFinanzas={parametros?.inicioFinanzas ?? null}
      estimadosPorSede={estimados}
      sueldosSinLeer={!!(erMes.sueldosSinLeer || resumenLeido.sueldosSinLeer)}
    />
  );
}
