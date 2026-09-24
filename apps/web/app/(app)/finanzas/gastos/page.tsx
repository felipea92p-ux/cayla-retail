import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, leerVer, mesDe, rangoMes } from "@/lib/gastos-reglas";
import {
  getCategoriasGasto,
  getContextoGastos,
  getEgresosPorClasificar,
  getGastos,
  getMarcasNoGasto,
  getPanelGastos,
  getProveedoresParaGasto,
} from "@/lib/gastos";
import { GastosPanel } from "@/components/GastosPanel";

// Finanzas ▸ Gastos (ADR-0195 F2). Lee en el servidor y deja a una sola pieza cliente operar. `?mes=2026-09` elige el mes;
// `?ver=` (solo el líder) elige qué tienda mirar: por defecto la sede donde trabaja, o «todas», o «empresa».
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string }> }) {
  const persona = await exigirModulo("gastos");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoy);
  const { desde, hasta } = rangoMes(mes);
  const esLider = persona.rol === "lider";

  const [contexto, categorias, proveedores] = await Promise.all([getContextoGastos(), getCategoriasGasto(), getProveedoresParaGasto()]);
  const ver = leerVer(sp.ver, contexto.ubicaciones, esLider, persona.ubicacionId);
  const [panel, gastos, egresos, marcas] = await Promise.all([getPanelGastos(desde, hasta, ver), getGastos(desde, hasta, ver), getEgresosPorClasificar(ver), getMarcasNoGasto(ver)]);

  return (
    <GastosPanel
      panel={panel.datos}
      gastos={gastos.datos}
      egresos={egresos.datos}
      marcas={marcas}
      categorias={categorias}
      ubicaciones={contexto.ubicaciones}
      proveedores={proveedores}
      cajasAbiertas={contexto.cajasAbiertas}
      esLider={esLider}
      ver={ver}
      mes={mes}
      hoy={hoy}
      fallas={[panel.falla, gastos.falla, egresos.falla].filter((f): f is string => !!f)}
    />
  );
}
