import { Suspense } from "react";
import { exigirModulo, puede, veEstadosFinancierosDeTodoDe, veFinanzasDeTodoDe, veModulo } from "@/lib/persona-actual";
import { getValorInventario } from "@/lib/valor-inventario";
import { Movimientos, MovimientosEsperando } from "@/components/finanzas/bolsillos/Movimientos";
import { hoyLima } from "@/lib/fechas-lima";
import { anotarBloques, anotarTiempos, relojDelResumen, conIgvDelMesAnterior, conSueldosEstimados, getConfianzaFinanzas, lectorDelResumen, resumenJunto } from "@/lib/resumen-finanzas";
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
import { ResumenFinanzasPanel, type LecturasDelResumen } from "@/components/finanzas/ResumenFinanzas";
import { getCostoEstimado } from "@/lib/costo-estimado";
import { pctCostoEstimado } from "@/lib/costo-estimado-reglas";
import { getPlanillaParaElInicio } from "@/lib/cuentas-dinero";
import { getProvisionPlanilla } from "@/lib/planilla-provision";
import { diasDelFeed } from "@/lib/movimientos-resumen-reglas";
import { rangoMes } from "@/lib/gastos-reglas";
import { mesAnterior } from "@/lib/resultados-reglas";

// Finanzas ▸ Resumen en El telar (ADR-0195 F10; ADR-0493, Felipe 2026-10-23). La sede la elige la barra común (`?sede=`; mientras dure el cambio,
// `?ver=` gana). Las fechas, desde el camino «A · Bolsillos» (Felipe 2026-11-09), con el calendario de Estados financieros (`SelectorPeriodo`): un mes
// entero (`?mes=`, el mismo que viaja al resto de Finanzas) o cualquier tramo (`?desde=&hasta=`). Lecturas, todas de solo lectura y a la vez cuando no dependen una de otra:
//   - el Resumen (`fn_resumen_finanzas_partes`, ADR-0661) en TRES lecturas: lo rápido (saldos, deudas, la caja que viene, IGV, campañas…), el mes y el
//     anterior con el presupuesto; los avisos de «Hoy te toca», la confianza y las unidades (de HOY: es lo que toca decidir ahora);
//   - `fn_estado_resultados` del mes elegido (al día de hoy si es el mes en curso) y del tramo con que se compara: la respuesta de
//     la cabecera, el orillo y el recorrido salen de aquí, así que el mes de la barra filtra de verdad (auditoría v3);
//   - `fn_rendimiento_serie` de cada tienda, si la cuenta ve Rendimiento: la línea de ventas contra la meta (pedida a la vez que el resto, ADR-0583);
//   - `fn_flujo_caja_proyeccion`, la misma de Dinero ▸ Flujo: «Tu caja en las próximas dos semanas»;
//   - la inversión en mercadería que entrega el Plan de campaña (`getInversionMercaderia`, ADR-0527): si la cuenta no ve el Plan o la base aún no la trae, el Resumen no ofrece nada; si se cae, lo dice.
// Quien no ve las finanzas de todo mira su sede: lo decide la base.
//
// POR BLOQUES (ADR-0661, Felipe 2026-11-13). La página espera SOLO la lectura rápida (~0,6 s en la base): con ella dibuja la cabecera y «Libre para
// usar». Todo lo demás se le pasa al panel como promesas: cada bloque espera lo suyo dentro de su `Suspense`, con su esqueleto en el lugar exacto, y
// entra cuando llega (el `loading.tsx` cubre solo la espera de la rápida). Cada bloque deja en los logs cuándo pudo dibujarse (`anotarBloques`).
//
// CUÁNTAS A LA VEZ (2026-11-09, el pico de memoria de producción). La base tiene 2 núcleos y cada lectura pesada arma el diario contable:
// lanzadas todas juntas no terminan antes, pero cada una ocupa su memoria al mismo tiempo, y una sola carga de Resumen empujaba la máquina a
// usar swap. Las PESADAS pasan por un turnero de `CUPOS_PESADOS`; las livianas (la sede, los parámetros, la confianza…) salen de inmediato.
// Desde ADR-0661 hay además una PUERTA: al principio corren solo la lectura rápida, el mes y lo de unos pocos ms; lo demás entra cuando la rápida
// termina, en el orden de la pantalla (el anterior y el presupuesto, el estado de resultados, la comparación, la inversión, las ventas por día y,
// al final, el balance de cada sede, la tabla de abajo).
// Y ni el estado de resultados del mes ni el flujo de caja se piden dos veces: si el resumen ya los armó igual (todas las sedes, del 1 a hoy; la
// proyección con sus cobros), se usan esos (`estadoDelMesYaLeido`, `flujoDelResumen`).
const CUPOS_PESADOS = 3;

/** ¿Lo pedido es una sede (o la propia de quien no ve todo)? Entonces la base no arma la caja que viene dentro del resumen (`flujo` «no aplica»). */
const mismaSede = (pedido: { clave: string; ubicacionId: string | null; soloEmpresa: boolean }) => pedido.ubicacionId !== null || pedido.soloEmpresa || pedido.clave === "propia";

export default async function ResumenFinanzasPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string; mes?: string; desde?: string; hasta?: string; inversion?: string }> }) {
  const reloj = relojDelResumen();
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
  const leer = lectorDelResumen(pedido);

  // LA PUERTA (ADR-0661). La base de producción tiene 2 núcleos y una carga de Resumen le pide ~15 s de trabajo (el Resumen, el balance, las ventas
  // por día de cada tienda, el costo estimado de cada sede, la confianza, los sueldos…): lanzadas todas a la vez, la lectura rápida (~0,6 s sola) se
  // reparte la máquina con las demás y la pantalla sigue en blanco (en la copia de un año salió a los 3,6 s). Por eso al principio corren SOLO la
  // rápida, el mes (el bloque que sigue) y lo de unos pocos ms; todo lo demás arranca cuando la rápida termina (`trasLoRapido`). El total casi no
  // cambia (la base ya estaba llena), pero lo primero sale antes.
  const rapidoP = leer("rapido");
  const puerta = rapidoP.then(() => undefined);
  const trasLoRapido = <T,>(f: () => Promise<T>): Promise<T> => puerta.then(f);

  // Las tres lecturas del Resumen. El mes entra primero al turnero (es lo que sigue en la pantalla); el anterior y el presupuesto, tras la puerta.
  const delMesP0 = pesada(() => leer("mes"));
  // Los sueldos estimados (ADR-0583): el mes es el de hoy en Lima, el mismo que usa la base; si justo a medianoche no coinciden, `conSueldosEstimados`
  // los pide otra vez. Los dos grupos que los usan los esperan después de su propia lectura.
  const provisionP = trasLoRapido(() => getProvisionPlanilla(rangoMes(mesAnterior(mesDeHoy)).desde, rangoMes(mesDeHoy).hasta, pedido.ubicacionId)).then((p) => ({ mes: mesDeHoy, ...p }));
  const delMesP = delMesP0.then(async (l) => conSueldosEstimados(l, "resultadosMes", pedido.ubicacionId, await provisionP));
  // Con el IGV del mes anterior si alguna tienda perdió (tarea 19): «Hoy te toca» dice cuánto necesitaba vender, y eso va con IGV.
  const avisosP = trasLoRapido(() => pesada(() => leer("avisos")))
    .then(async (l) => conSueldosEstimados(l, "resultadosAnterior", pedido.ubicacionId, await provisionP))
    .then(conIgvDelMesAnterior);
  const todoP = Promise.all([rapidoP, delMesP, avisosP]).then(([r, m, a]) => {
    const junto = resumenJunto(r, m, a);
    if (junto) anotarTiempos(junto, reloj());
    return junto;
  });

  // La caja de las próximas semanas: del resumen si ya la trajo entera (CAYLA entera, con sus cobros, desde 20261109175000); mirando una sede, la
  // base no la arma dentro del resumen y se pide aparte, A LA VEZ que la rápida (es lo que dibuja «Libre para usar», lo primero de la pantalla).
  const flujoAparteP = mismaSede(pedido) ? pesada(() => getFlujoProximo()) : null;
  const flujoP = rapidoP.then(({ datos: r }) => flujoDelResumen(r) ?? flujoAparteP ?? pesada(() => getFlujoProximo()));
  // La planilla que Dynamic pagó y aquí no bajó del banco: «¿Cuánto tienes?» la sigue sumando, y lo dice (~70 ms: va con la rápida). Sin lectura, calla.
  const planillaP = persona.rol === "lider" ? getPlanillaParaElInicio().then((p) => p?.total || null, () => null) : Promise.resolve(null);
  const faltaDelMesP = periodo.unMes && mes === mesDeHoy ? getFaltaDelMes(mes) : Promise.resolve([]);

  // El estado de resultados del mes elegido. Si se mira CAYLA entera del 1 a hoy, el grupo del mes ya lo arma IGUAL y se espera ese; si no, se pide
  // tras la puerta, sin esperar al resumen. Si la apuesta falla (la base resolvió otra sede), `estadoDelMesYaLeido` da null y se pide aparte, como antes.
  // Con el IGV de las ventas (ADR-0624) para que «Cada sede, junta» diga lo vendido con IGV; si no se puede leer, la tabla sale sin IGV y lo dice.
  const mismoQueElResumen = pedido.ubicacionId === null && !pedido.soloEmpresa && tramo.desde === `${mesDeHoy}-01` && tramo.hasta === hoy;
  const erMesP = (mismoQueElResumen ? delMesP : puerta.then(() => null)).then(async (l) => {
    const yaLeido = l ? estadoDelMesYaLeido(l.datos, tramo) : null;
    const lectura = yaLeido ? { datos: yaLeido, falla: null } : await pesada(() => getEstadoResultados(tramo.desde, tramo.hasta));
    return conIgvDeLasVentasDe(tramo.desde, tramo.hasta, lectura);
  });
  const mesP = Promise.all([erMesP, delMesP]).then(([er, dm]) => ({ estado: { datos: er.datos, falla: er.falla }, sueldosSinLeer: !!(er.sueldosSinLeer || dm.sueldosSinLeer) }));
  // Contra qué se compara: el mes pasado a la misma fecha, el mes anterior entero o los mismos días justo antes. Antes de que Finanzas empezara, nada.
  const antesP = Promise.all([minimoP, puerta]).then(async ([min]) => {
    const comparar = periodoAnterior(periodo, min);
    const l = comparar ? await pesada(() => getEstadoResultados(comparar.desde, comparar.hasta)) : null;
    return !l || l.falla ? null : l.datos;
  });
  const inversionP = trasLoRapido(() => pesada(() => getInversionMercaderia(hoy, sp.inversion === "ejemplo")));
  const activasP = veRendimiento ? trasLoRapido(() => getTiendasActivas()) : null;
  const ventasAdelantadas = activasP
    ? activasP.then(async (activas) => {
        const ids = tiendasAdivinadas(pedido, persona.ubicacionId, activas);
        return { ids, ventas: await pesada(() => getVentasPorDia(ids, tramo.desde, tramo.hasta)) };
      })
    : null;
  const ventasP = !ventasAdelantadas
    ? Promise.resolve(null)
    : Promise.all([ventasAdelantadas, rapidoP]).then(([adelantadas, { datos }]) => {
        const tiendas = datos ? tiendasDeLaLinea(datos) : [];
        return mismasTiendas(adelantadas.ids, tiendas) ? adelantadas.ventas : pesada(() => getVentasPorDia(tiendas, tramo.desde, tramo.hasta));
      });
  // «Cada sede, junta» (tarea 27): la caja de cada sede a la misma fecha que las cifras del mes. Solo quien ve todas las sedes. Último en el turnero:
  // es la tabla de abajo.
  const cajasPorSedeP = veTodo ? Promise.all([minimoP, puerta, activasP]).then(() => pesada(() => getBalancePorTienda(tramo.hasta))) : Promise.resolve(null);

  // Las livianas, fuera del turnero y tras la puerta (la confianza y el costo estimado de cada sede no son tan livianas: ~0,7 s y ~0,3 s por sede).
  const confianzaP = trasLoRapido(() => getConfianzaFinanzas(pedido, mes));
  // Lo que vale la ropa a costo (la hoja «La ropa que tienes»): la misma lectura de Existencias, que la base solo da con el dinero de Compras.
  const inventarioP = veTodo && (persona.rol === "lider" || puede(persona, "verDineroCompras")) ? trasLoRapido(() => getValorInventario()) : Promise.resolve(null);
  // Cuánto de lo vendido lleva costo estimado en cada tienda (tarea 75): la función de la base, pedida sede por sede; la fila de CAYLA, sin sede. Solo quien ve todas.
  const estimadosP = veTodo
    ? Promise.all([getSedesDelTelar(), puerta]).then(async ([{ sedes }]) => {
        const claves = [...sedes.filter((s) => s.color !== "tal" && s.color !== "emp" && s.clave).map((s) => s.clave as string), null];
        const lecturas = await Promise.all(claves.map((c) => getCostoEstimado(tramo.desde, tramo.hasta, c)));
        return Object.fromEntries(claves.map((c, i) => [c ?? "todas", pctCostoEstimado(lecturas[i]!.datos)]));
      })
    : Promise.resolve(null);

  // Cuándo pudo dibujarse cada bloque: lo último que necesita (los mismos `use()` de su componente en el panel). Se anota desde ya, para medir el
  // momento en que llega cada uno y no el momento en que la página terminó de esperar.
  const todasP = rapidoP.then((r) => r.datos?.ver.todas ?? false);
  // La inversión en mercadería solo la esperan «Hoy te toca» y «Próximos» mirando CAYLA entera (`useCajaConCompra`).
  const inversionSiTodasP = todasP.then((t) => (t ? inversionP : null));
  anotarBloques(reloj, todasP, {
    cabecera: [rapidoP],
    libre: [flujoP, planillaP],
    frase: [flujoP, planillaP, mesP, faltaDelMesP],
    mes: [mesP, faltaDelMesP, todoP, ventasP, antesP, confianzaP],
    preguntas: [flujoP, planillaP, mesP, inventarioP],
    decidir: [todoP, flujoP, inversionSiTodasP],
    proximos: [flujoP, inversionSiTodasP],
    tiendas: [mesP, confianzaP],
    sedes: [mesP, cajasPorSedeP, estimadosP],
    plata: [mesP],
    cambios: [mesP, antesP],
    inversion: [flujoP, inversionP],
    todo: [todoP, mesP, antesP, flujoP, planillaP, confianzaP, faltaDelMesP, ventasP, inversionP, cajasPorSedeP, inventarioP, estimadosP],
  });

  // Lo único que se espera antes de dibujar: la lectura rápida (la cabecera dice qué se mira) y lo liviano de la cabecera.
  const [rapido, telar, minimo] = await Promise.all([rapidoP, getSedesDelTelar(), minimoP]);

  const lecturas: LecturasDelResumen = {
    todo: todoP,
    mes: mesP,
    antes: antesP,
    flujo: flujoP,
    planilla: planillaP,
    confianza: confianzaP,
    faltaDelMes: faltaDelMesP,
    ventas: ventasP,
    inversion: inversionP,
    cajasPorSede: cajasPorSedeP,
    inventarioValor: inventarioP,
    estimados: estimadosP,
  };

  // «Movimientos» (camino A): la plata que entró y salió, de `fn_flujo_caja_real`, que es de CAYLA entera (la base pide ver los estados de todo). Llega
  // aparte, en su `Suspense`, para que el resto del Resumen no la espere.
  const actuales = Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string");
  const movimientos = veEstadosFinancierosDeTodoDe(persona) ? (
    <Suspense fallback={<MovimientosEsperando alto={diasDelFeed(periodo) ? 720 : 420} />}>
      <Movimientos periodo={periodo} hoy={hoy} hrefFlujo={conElRango(hrefTelar("/finanzas/reportes/flujo", actuales, {}, { mismaPantalla: false, mesDeHoy }), actuales)} />
    </Suspense>
  ) : null;

  return (
    <ResumenFinanzasPanel
      movimientos={movimientos}
      rapido={rapido.datos}
      falla={rapido.falla}
      lecturas={lecturas}
      mes={mes}
      periodo={periodo}
      minimo={minimo}
      hoy={hoy}
      sedes={telar.sedes}
      acceso={{ lider: veTodo, modulos: persona.modulos.map((m) => m.clave) }}
      veCajasPorSede={veTodo}
      inicioFinanzas={minimo}
    />
  );
}
