import { requirePersonaActualV2, veFinanzasDeTodoDe, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { leerVer, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { getContextoGastos, getFijosMes, getGastos, getPanelGastos } from "@/lib/gastos";
import { sinComprobanteGrande } from "@/lib/gastos-extracto-reglas";
import { sedeDeLaUrl, SEDE_TODAS } from "@/lib/finanzas-telar-reglas";
import { pendientesDeCierre, pendientesDeFijos, pendientesDeGastos, pendientesDeImpuestos, type PendienteTelar } from "@/lib/finanzas-te-toca-reglas";
import { getContextoDinero, getMovimientos, getLiquidacionesPorRegistrar, getPlanillaParaElInicio, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { mesNombre } from "@/lib/resultados-reglas";
import { mesAnteriorDe } from "@/lib/resumen-telar-reglas";
import { getUnidadesCerradas } from "@/lib/resultados";
import { getPorPagarConsolidado, getUnidadesPorPagar } from "@/lib/por-pagar-consolidado";
import { cajasSinDepositar, pendientesDeDinero } from "@/lib/dinero-te-toca-reglas";
import { getPanelImpuestos } from "@/lib/impuestos";
import { antesDeDeclarar } from "@/lib/impuestos-antes-reglas";

// GET /api/finanzas/te-toca?sede=… → los pendientes de Finanzas de la sede elegida, para «Te toca» de la mesa de mando (El telar).
//
// PROMETE: `{ pendientes }` solo de los submódulos que la cuenta ve; cada lectura pasa por las funciones que ya miran solo lo que
//   la cuenta puede ver (la base decide). Solo lectura. Un submódulo suma los suyos aquí con su `pendientesDe…` de
//   `finanzas-te-toca-reglas.ts`.
// POR QUÉ UNA RUTA Y NO EL LAYOUT: el layout no recibe la URL (no sabe la sede elegida) y no se vuelve a pintar al cambiarla; el
//   botón pregunta aquí al abrir la pantalla y al cambiar de sede. Un GET a /api no abre el loader global.
// SE DEGRADA: si un submódulo no se pudo leer, sus pendientes no salen y `incompleto` lo dice; si nada responde, 503.
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  const sede = sedeDeLaUrl({ sede: new URL(request.url).searchParams.get("sede") });
  const consulta = sede === SEDE_TODAS ? "" : `sede=${encodeURIComponent(sede)}`;
  const pendientes: PendienteTelar[] = [];
  let incompleto = false;

  if (veModulo(persona, "gastos")) {
    try {
      const { desde, hasta } = rangoMes(mesDe(hoyLima()));
      const contexto = await getContextoGastos();
      const ver = leerVer(sede, contexto.ubicaciones, veFinanzasDeTodoDe(persona), persona.ubicacionId);
      // La lista del mes va junto al panel (en la misma vuelta): de ella sale lo grande sin papel, lo mismo que marca la lista de Gastos
      // (Felipe 2026-10-30). Si no responde, ese pendiente no sale y el cajón dice que está incompleto; los demás sí.
      const [panel, lista, fijos] = await Promise.all([getPanelGastos(desde, hasta, ver), getGastos(desde, hasta, ver), getFijosMes(desde, ver)]);
      if (fijos.falla) incompleto = true;
      pendientes.push(...pendientesDeFijos(fijos.datos.filter((f) => f.estado === "falta"), consulta));
      // Si solo falló el IGV perdido, la lista llega entera (y esta cuenta no depende de él): se cuenta igual.
      const sinPapel = sinComprobanteGrande(lista.datos);
      if (lista.falla && lista.datos.length === 0) incompleto = true;
      if (panel.datos) pendientes.push(...pendientesDeGastos({ ...panel.datos, sinComprobante: sinPapel.n, igvSinComprobante: sinPapel.igv }, consulta));
      else incompleto = true;
    } catch (e) {
      console.error("Te toca: no se pudieron leer los pendientes de Gastos", e);
      incompleto = true;
    }
  }

  if (veModulo(persona, "cuentas_dinero")) {
    try {
      const hoy = hoyLima();
      const esLider = persona.rol === "lider";
      const unidades = await getUnidadesPorPagar(persona);
      const verDeuda = leerVer(sede, unidades, esLider, persona.ubicacionId);
      // «Dónde está» no tiene «empresa» propia (la empresa no tiene cajón): sus cajas fuertes se miran como todas.
      const ctx = await getContextoDinero(persona, sede === "empresa" ? SEDE_TODAS : sede);
      // La planilla que Dynamic pagó baja un banco de la empresa: se avisa en toda vista, como en Cuentas y dinero (ADR-0567).
      const [deuda, movimientos, planilla, liquidaciones] = await Promise.all([
        getPorPagarConsolidado(verDeuda),
        getMovimientos(ctx.ver.ubicacionId),
        esLider
          ? getPlanillaParaElInicio().catch(() => {
              incompleto = true;
              return undefined;
            })
          : Promise.resolve(undefined),
        esLider
          ? getLiquidacionesPorRegistrar().catch(() => {
              incompleto = true;
              return [];
            })
          : Promise.resolve([]),
      ]);
      if (deuda.falla || ctx.cuentas.falla) incompleto = true;
      pendientes.push(
        ...pendientesDeDinero(
          {
            porPagar: deuda.datos,
            cajasSinDepositar: cajasSinDepositar(ctx.cuentas.datos, movimientos.datos, hoy, ctx.ver.ubicacionId),
            lineasSinRevisar: pendientesDeConciliar(ctx.conciliacion.datos),
            esLider,
            planilla,
            liquidaciones,
          },
          hoy,
          consulta,
        ),
      );
    } catch (e) {
      console.error("Te toca: no se pudieron leer los pendientes de Cuentas y dinero", e);
      incompleto = true;
    }
  }

  // Impuestos es de CAYLA entera (un RUC): sus pendientes son los mismos en cualquier sede; se lee el mes que se declara ahora.
  if (veModulo(persona, "impuestos")) {
    try {
      const panel = await getPanelImpuestos();
      if (panel.datos) pendientes.push(...pendientesDeImpuestos(antesDeDeclarar(panel.datos), consulta));
      else incompleto = true;
    } catch (e) {
      console.error("Te toca: no se pudieron leer los pendientes de Impuestos", e);
      incompleto = true;
    }
  }

  // El mes anterior sin cerrar: el de la sede que se mira; sin sede, el consolidado (lo que se le entrega al contador).
  if (veModulo(persona, "cierre_mes")) {
    try {
      const mes = mesAnteriorDe(mesDe(hoyLima()));
      const cerradas = await getUnidadesCerradas(mes);
      pendientes.push(...pendientesDeCierre({ mes, mesNombre: mesNombre(mes), cerrado: cerradas.includes(sede === SEDE_TODAS ? "consolidado" : sede) }));
    } catch (e) {
      console.error("Te toca: no se pudo leer el cierre de mes", e);
      incompleto = true;
    }
  }

  if (incompleto && !pendientes.length) return Response.json({ error: "No pudimos leer los pendientes." }, { status: 503, headers: { "cache-control": "no-store" } });
  return Response.json({ pendientes, incompleto }, { headers: { "cache-control": "no-store" } });
}
