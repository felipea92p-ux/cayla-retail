import { exigirModulo, veFinanzasDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, leerVer, mesDe, rangoMes, type Ver } from "@/lib/gastos-reglas";
import { sinRepetidos } from "@/lib/fijos-del-mes-reglas";
import { getParametrosFinanzas } from "@/lib/configuracion";
import {
  getActivos,
  getCategoriasGasto,
  getContextoGastos,
  getEgresosPorClasificar,
  getFijosMes,
  getFijosSugeridos,
  getGastos,
  getMarcasNoGasto,
  getPanelGastos,
  getProveedoresParaGasto,
  getTiposActivo,
} from "@/lib/gastos";
import { getDestinosDeposito } from "@/lib/cuentas-dinero";
import { getParametrosTributarios } from "@/lib/impuestos";
import { umbralDeActivo } from "@/lib/activo-umbral-reglas";
import { getEmpresaParaOrden } from "@/lib/ordenes-compra";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { GastosPanel, type PestanaGastos } from "@/components/GastosPanel";
import { verDeLaVista } from "@/lib/vista-global";
import { sedeDeLaUrl, sedesDeLaUrl, sedesElegidas } from "@/lib/finanzas-telar-reglas";
import { verDeVarias } from "@/lib/gastos-varias-sedes";
import { mesesDeAntes, mesPrevio, seCompara } from "@/lib/gastos-hilos-reglas";

const PESTANAS: PestanaGastos[] = ["gastos", "fijos", "activos", "egresos"];
const TODAS: Ver = { clave: "todas", ubicacionId: null, soloEmpresa: false };

// Finanzas ▸ Gastos (ADR-0195 F2). Lee en el servidor y deja a una sola pieza cliente operar. `?mes=2026-09` elige el mes;
// `?sede=` (la barra del telar; antes `?ver=`) elige qué mirar: una sede, varias (`?sede=a,b`, Felipe 2026-10-24), la empresa o todas;
// quien no ve todo, solo la suya. `?tab=` abre en una pestaña (fijos, activos, egresos): así llegan los enlaces de Caja y de Configuración.
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string; sede?: string; tab?: string }> }) {
  const persona = await exigirModulo("gastos");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoy);
  const { desde, hasta } = rangoMes(mes);
  const esLider = persona.rol === "lider";
  // Qué sedes se pueden mirar: la misma pregunta que la base (`fn_gastos_ubicaciones` usa `fn_ve_finanzas_de_todo`), no el rol.
  const veTodo = veFinanzasDeTodoDe(persona);
  // El inicio de Finanzas no depende de nada: se pide desde ya (antes era una vuelta más de espera, después de las lecturas del mes).
  const parametrosP = getParametrosFinanzas();
  // La UIT (Configuración ▸ Impuestos) para avisar, al registrar un activo, que cuesta menos de ¼ de UIT y puede llevarse a gasto (ADR-0594). Esa lectura
  // es solo del líder: quien no lo es, o si falla, no ve el aviso y registra igual (nada depende de él).
  const tributariosP = esLider ? getParametrosTributarios() : Promise.resolve(null);

  // Los bancos para «¿A qué cuenta llegó?» al clasificar un depósito (vacío sin Cuentas y dinero, ADR-0195 F3).
  const [contexto, categorias, proveedores, tiposActivo, destinosDeposito, telar, empresa] = await Promise.all([
    getContextoGastos(),
    getCategoriasGasto(),
    getProveedoresParaGasto(),
    getTiposActivo(),
    getDestinosDeposito(),
    getSedesDelTelar(),
    // El RUC de CAYLA, para avisar si el QR de una factura dice que está a nombre de otro (ADR-0588). Sin él, no se compara.
    getEmpresaParaOrden(),
  ]);
  // Varias sedes marcadas: `verDeVarias`; una, ninguna o quien no ve todo: como siempre.
  const elegidas = sedesElegidas(sedesDeLaUrl(sp), telar.sedes, veTodo, persona.ubicacionId);
  const ver = verDeVarias(elegidas, contexto.ubicaciones) ?? leerVer(verDeLaVista(persona.vista, sedeDeLaUrl(sp)), contexto.ubicaciones, veTodo, persona.ubicacionId);
  const mesDeHoy = mesDe(hoy);
  // Todo lo que solo necesita saber qué se mira (`ver`) va en una sola vuelta, a la vez:
  // · Para «¿es uno de tus fijos?» del formulario de gasto: los fijos de TODAS las tiendas (el formulario puede ser de otra tienda que la que
  //   se mira) del mes que se mira y del mes de hoy (un gasto de hoy, con otro mes en pantalla). Si una lectura falla, ese mes no pregunta.
  //   Y el inicio de Finanzas: antes de esa fecha los fijos no se confirman (la base rechaza un gasto anterior al inicio).
  // · «En qué se va» compara cada categoría con los meses de antes (hilos, Felipe 2026-10-30): el mismo resumen del mes, uno por mes y en
  //   paralelo, solo los que empiezan desde el inicio de Finanzas (los de antes ni se piden). Uno que no responde no se compara: el gráfico
  //   sale igual, sin su píldora ni su línea, y el aviso de arriba lo dice.
  // · «Cuándo» compara el mes día por día con el anterior (el ritmo, Felipe 2026-10-30): sus gastos, uno por uno, con la misma regla.
  const meses = mesesDeAntes(mes);
  const mesAnterior = meses.at(-1)!;
  const [panel, gastos, egresos, marcas, activos, fijos, sugeridos, fijosDeOtras, fijosDeHoy, parametros, panelesDeAntes, gastosDeAntes] = await Promise.all([
    getPanelGastos(desde, hasta, ver),
    getGastos(desde, hasta, ver),
    getEgresosPorClasificar(ver),
    getMarcasNoGasto(ver),
    getActivos(ver),
    getFijosMes(desde, ver),
    getFijosSugeridos(ver),
    // Mirando todas las sedes, los fijos del mes ya son los de todas: no se piden dos veces.
    ver.clave === "todas" ? Promise.resolve(null) : getFijosMes(desde, TODAS),
    mes === mesDeHoy ? Promise.resolve(null) : getFijosMes(rangoMes(mesDeHoy).desde, TODAS),
    parametrosP,
    parametrosP.then((p) =>
      Promise.all(meses.map((m) => (seCompara(m, p?.inicioFinanzas ?? null) ? getPanelGastos(rangoMes(m).desde, rangoMes(m).hasta, ver) : null))),
    ),
    parametrosP.then((p) => (seCompara(mesAnterior, p?.inicioFinanzas ?? null) ? getGastos(rangoMes(mesAnterior).desde, rangoMes(mesAnterior).hasta, ver) : null)),
  ]);
  const tributarios = await tributariosP;
  const umbralActivo = tributarios ? umbralDeActivo(tributarios.datos, Number(hoy.slice(0, 4))) : null;
  const fijosDeTodas = fijosDeOtras ?? fijos;
  const previos = meses.map((m, i) => mesPrevio(m, panelesDeAntes[i]?.datos ?? null));
  // Si la lista del mes anterior no se pudo leer, «Cuándo» no compara (un mes vacío no es un mes barato); el IGV perdido no hace falta aquí.
  const sinAnteriores = !gastosDeAntes || (!!gastosDeAntes.falla && gastosDeAntes.datos.length === 0);
  const fallaDeAntes =
    panelesDeAntes.some((p) => p?.falla) || (gastosDeAntes && sinAnteriores) ? "No se pudo leer los meses de antes, para comparar" : null;

  return (
    <GastosPanel
      panel={panel.datos}
      gastos={gastos.datos}
      egresos={egresos.datos}
      marcas={marcas}
      activos={activos.datos}
      fijos={fijos.datos}
      fijosParaPreguntar={sinRepetidos([...fijosDeTodas.datos, ...(fijosDeHoy?.datos ?? [])])}
      inicioFinanzas={parametros?.inicioFinanzas ?? null}
      sugeridos={sugeridos}
      tiposActivo={tiposActivo}
      umbralActivo={umbralActivo}
      categorias={categorias}
      ubicaciones={contexto.ubicaciones}
      proveedores={proveedores}
      cajasAbiertas={contexto.cajasAbiertas}
      esLider={esLider}
      puedeConfigurar={persona.modulos.some((m) => m.clave === "configuracion")}
      puedeVerImpuestos={persona.modulos.some((m) => m.clave === "impuestos")}
      puedeVerPorPagar={persona.modulos.some((m) => m.clave === "por_pagar")}
      rucEmpresa={empresa?.ruc ?? null}
      puedeAdjuntarFacturas={esLider || persona.modulos.some((m) => m.clave === "facturas_compra")}
      ver={ver}
      mes={mes}
      hoy={hoy}
      pestanaInicial={PESTANAS.find((p) => p === sp.tab) ?? "gastos"}
      destinosDeposito={destinosDeposito}
      sedesTelar={telar.sedes}
      previos={previos}
      gastosDelMesAnterior={sinAnteriores ? null : gastosDeAntes.datos}
      fallas={[panel.falla, gastos.falla, egresos.falla, activos.falla, fijos.falla, fallaDeAntes].filter((f): f is string => !!f)}
    />
  );
}
