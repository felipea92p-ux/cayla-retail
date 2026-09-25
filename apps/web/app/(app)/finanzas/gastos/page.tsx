import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, leerVer, mesDe, rangoMes } from "@/lib/gastos-reglas";
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
import { GastosPanel, type PestanaGastos } from "@/components/GastosPanel";

const PESTANAS: PestanaGastos[] = ["gastos", "fijos", "activos", "egresos"];

// Finanzas ▸ Gastos (ADR-0195 F2). Lee en el servidor y deja a una sola pieza cliente operar. `?mes=2026-09` elige el mes;
// `?ver=` (solo el líder) elige qué tienda mirar: por defecto la sede donde trabaja, o «todas», o «empresa». `?tab=` abre en una
// pestaña (fijos, activos, egresos): así llegan los enlaces de Caja y de Configuración.
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string; tab?: string }> }) {
  const persona = await exigirModulo("gastos");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoy);
  const { desde, hasta } = rangoMes(mes);
  const esLider = persona.rol === "lider";

  const [contexto, categorias, proveedores, tiposActivo] = await Promise.all([getContextoGastos(), getCategoriasGasto(), getProveedoresParaGasto(), getTiposActivo()]);
  const ver = leerVer(sp.ver, contexto.ubicaciones, esLider, persona.ubicacionId);
  const [panel, gastos, egresos, marcas, activos, fijos, sugeridos] = await Promise.all([
    getPanelGastos(desde, hasta, ver),
    getGastos(desde, hasta, ver),
    getEgresosPorClasificar(ver),
    getMarcasNoGasto(ver),
    getActivos(ver),
    getFijosMes(desde, ver),
    getFijosSugeridos(ver),
  ]);

  return (
    <GastosPanel
      panel={panel.datos}
      gastos={gastos.datos}
      egresos={egresos.datos}
      marcas={marcas}
      activos={activos.datos}
      fijos={fijos.datos}
      sugeridos={sugeridos}
      tiposActivo={tiposActivo}
      categorias={categorias}
      ubicaciones={contexto.ubicaciones}
      proveedores={proveedores}
      cajasAbiertas={contexto.cajasAbiertas}
      esLider={esLider}
      ver={ver}
      mes={mes}
      hoy={hoy}
      pestanaInicial={PESTANAS.find((p) => p === sp.tab) ?? "gastos"}
      fallas={[panel.falla, gastos.falla, egresos.falla, activos.falla, fijos.falla].filter((f): f is string => !!f)}
    />
  );
}
