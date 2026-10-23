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
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { GastosPanel, type PestanaGastos } from "@/components/GastosPanel";
import { verDeLaVista } from "@/lib/vista-global";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";

const PESTANAS: PestanaGastos[] = ["gastos", "fijos", "activos", "egresos"];
const TODAS: Ver = { clave: "todas", ubicacionId: null, soloEmpresa: false };

// Finanzas ▸ Gastos (ADR-0195 F2). Lee en el servidor y deja a una sola pieza cliente operar. `?mes=2026-09` elige el mes;
// `?ver=` (solo el líder) elige qué tienda mirar: por defecto la sede donde trabaja, o «todas», o «empresa». `?tab=` abre en una
// pestaña (fijos, activos, egresos): así llegan los enlaces de Caja y de Configuración.
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string; sede?: string; tab?: string }> }) {
  const persona = await exigirModulo("gastos");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoy);
  const { desde, hasta } = rangoMes(mes);
  const esLider = persona.rol === "lider";
  // Qué sedes se pueden mirar: la misma pregunta que la base (`fn_gastos_ubicaciones` usa `fn_ve_finanzas_de_todo`), no el rol.
  const veTodo = veFinanzasDeTodoDe(persona);

  // Los bancos para «¿A qué cuenta llegó?» al clasificar un depósito (vacío sin Cuentas y dinero, ADR-0195 F3).
  const [contexto, categorias, proveedores, tiposActivo, destinosDeposito, telar] = await Promise.all([
    getContextoGastos(),
    getCategoriasGasto(),
    getProveedoresParaGasto(),
    getTiposActivo(),
    getDestinosDeposito(),
    getSedesDelTelar(),
  ]);
  const ver = leerVer(verDeLaVista(persona.vista, sedeDeLaUrl(sp)), contexto.ubicaciones, veTodo, persona.ubicacionId);
  const mesDeHoy = mesDe(hoy);
  const [panel, gastos, egresos, marcas, activos, fijos, sugeridos] = await Promise.all([
    getPanelGastos(desde, hasta, ver),
    getGastos(desde, hasta, ver),
    getEgresosPorClasificar(ver),
    getMarcasNoGasto(ver),
    getActivos(ver),
    getFijosMes(desde, ver),
    getFijosSugeridos(ver),
  ]);
  // Para «¿es uno de tus fijos?» del formulario de gasto: los fijos de TODAS las tiendas (el formulario puede ser de otra tienda que la que se
  // mira) del mes que se mira y del mes de hoy (un gasto de hoy, con otro mes en pantalla). Si una lectura falla, ese mes no pregunta.
  // Y el inicio de Finanzas: antes de esa fecha los fijos no se confirman (la base rechaza un gasto anterior al inicio).
  const [fijosDeTodas, fijosDeHoy, parametros] = await Promise.all([
    ver.clave === "todas" ? Promise.resolve(fijos) : getFijosMes(desde, TODAS),
    mes === mesDeHoy ? Promise.resolve(null) : getFijosMes(rangoMes(mesDeHoy).desde, TODAS),
    getParametrosFinanzas(),
  ]);

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
      categorias={categorias}
      ubicaciones={contexto.ubicaciones}
      proveedores={proveedores}
      cajasAbiertas={contexto.cajasAbiertas}
      esLider={esLider}
      puedeConfigurar={persona.modulos.some((m) => m.clave === "configuracion")}
      puedeVerImpuestos={persona.modulos.some((m) => m.clave === "impuestos")}
      ver={ver}
      mes={mes}
      hoy={hoy}
      pestanaInicial={PESTANAS.find((p) => p === sp.tab) ?? "gastos"}
      destinosDeposito={destinosDeposito}
      sedesTelar={telar.sedes}
      fallas={[panel.falla, gastos.falla, egresos.falla, activos.falla, fijos.falla].filter((f): f is string => !!f)}
    />
  );
}
