import { exigirModulo, veFinanzasDeTodoDe, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getConfianzaFinanzas, getResumenFinanzas } from "@/lib/resumen-finanzas";
import { leerVerResumen } from "@/lib/resumen-finanzas-reglas";
import { getEstadoResultados } from "@/lib/resultados";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { getFlujoProximo, getVentasPorDia } from "@/lib/resumen-telar";
import { getInversionMercaderia } from "@/lib/inversion-mercaderia";
import { esMesTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { tiendasDeLaLinea, tramoDeComparacion, tramoDelMes } from "@/lib/resumen-telar-reglas";
import { ResumenFinanzasPanel } from "@/components/finanzas/ResumenFinanzas";

// Finanzas ▸ Resumen en El telar (ADR-0195 F10; ADR-0493, Felipe 2026-10-23). La sede y el mes los elige la barra común (`?sede=`,
// `?mes=`; mientras dure el cambio, `?ver=` gana). Lecturas, todas de solo lectura y a la vez cuando no dependen una de otra:
//   - `fn_resumen_finanzas`: los avisos de «Hoy te toca», la confianza y las unidades (de HOY: es lo que toca decidir ahora);
//   - `fn_estado_resultados` del mes elegido (al día de hoy si es el mes en curso) y del tramo con que se compara: la respuesta de
//     la cabecera, el orillo y el recorrido salen de aquí, así que el mes de la barra filtra de verdad (auditoría v3);
//   - `fn_rendimiento_serie` de cada tienda, si la cuenta ve Rendimiento: la línea de ventas contra la meta;
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

  const [{ datos, falla }, confianza, erMes, erAntes, telar, flujoProximo, inversion] = await Promise.all([
    getResumenFinanzas(pedido),
    getConfianzaFinanzas(pedido, mes),
    getEstadoResultados(tramo.desde, tramo.hasta),
    getEstadoResultados(comparar.desde, comparar.hasta),
    getSedesDelTelar(),
    getFlujoProximo(),
    getInversionMercaderia(hoy, sp.inversion === "ejemplo"),
  ]);
  const tiendas = datos ? tiendasDeLaLinea(datos) : [];
  const ventas = veModulo(persona, "rendimiento") ? await getVentasPorDia(tiendas, tramo.desde, tramo.hasta) : null;

  return (
    <ResumenFinanzasPanel
      resumen={datos}
      falla={falla}
      confianza={confianza}
      mes={mes}
      hoy={hoy}
      estadoMes={erMes}
      estadoAntes={erAntes.falla ? null : erAntes.datos}
      ventasPorDia={ventas}
      sedes={telar.sedes}
      flujoProximo={flujoProximo}
      inversion={inversion.datos}
      inversionFalla={inversion.falla}
      acceso={{ lider: veTodo, modulos: persona.modulos.map((m) => m.clave) }}
    />
  );
}
