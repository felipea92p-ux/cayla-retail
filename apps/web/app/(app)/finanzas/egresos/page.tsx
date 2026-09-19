import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getProveedoresActivos } from "@/lib/compras";
import { mesActualLima } from "@/lib/fecha-lima";
import { hoyLima } from "@/lib/fechas-lima";
import { claveMes, desplazarMes, leerMes, rangoDelMes, tituloMes } from "@/lib/gastos-reglas";
import { getCajasAbiertas, getCategoriasGasto, getEgresosNoGasto, getEgresosSinClasificar, getGastos, getResumenGastos } from "@/lib/gastos";
import { EgresosPanel } from "@/components/EgresosPanel";

// Gastos (ADR-0117). Toda la pantalla es de líder: un gasto es plata, sueldos y alquileres. El
// redirect de abajo es la primera de las tres capas que lo exigen (pantalla, RPC, RLS) — las RPC
// rechazan a quien no es líder aunque alguien llegue a esta URL por otro camino.
//
// El mes vive en la URL (`?mes=2026-09`): se puede compartir y «atrás» funciona. Sin parámetro,
// el mes en curso en hora de Lima. No se puede avanzar más allá del mes actual: un gasto se
// registra cuando se paga, no antes.
export default async function EgresosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const { mes: mesParam } = await searchParams;
  const actual = mesActualLima();
  const mes = leerMes(mesParam, actual);
  const { desde, hasta } = rangoDelMes(mes);
  const hayMesSiguiente = claveMes(desplazarMes(mes, 1)) <= claveMes(actual);

  const [tarjetas, sinClasificar, noGasto, gastos, categorias, ubicaciones, proveedores, cajasAbiertas] = await Promise.all([
    getResumenGastos(desde, hasta),
    getEgresosSinClasificar(),
    getEgresosNoGasto(),
    getGastos(desde, hasta),
    getCategoriasGasto(),
    getUbicaciones(),
    getProveedoresActivos(),
    getCajasAbiertas(),
  ]);

  return (
    <EgresosPanel
      tituloMes={tituloMes(mes)}
      mesAnterior={claveMes(desplazarMes(mes, -1))}
      mesSiguiente={hayMesSiguiente ? claveMes(desplazarMes(mes, 1)) : null}
      tarjetas={tarjetas}
      sinClasificar={sinClasificar}
      noGasto={noGasto}
      gastos={gastos}
      categorias={categorias}
      sedes={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))}
      proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
      cajasAbiertas={cajasAbiertas}
      hoy={hoyLima()}
    />
  );
}
