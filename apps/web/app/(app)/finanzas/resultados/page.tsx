import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { mesActualLima } from "@/lib/fecha-lima";
import { claveMes, desplazarMes, leerMes, rangoDelMes, tituloMes } from "@/lib/meses-lima";
import { getEstadoResultados } from "@/lib/resultados";
import { EstadoResultadosVista } from "@/components/EstadoResultadosVista";

// Estado de Resultados (ADR-0109 / ADR-0120). Toda la pantalla es de líder: ventas, costos y utilidad
// no los ve cualquiera. El redirect de abajo es la primera de las tres capas que lo exigen (pantalla,
// RPC, RLS): `fn_estado_resultados` y `fn_asientos` rechazan a quien no es líder aunque llegue por otro camino.
//
// El mes vive en la URL (`?mes=2026-09`): se puede compartir y «atrás» funciona. Sin parámetro, el mes en
// curso en hora de Lima. No se avanza más allá del mes actual.
export default async function ResultadosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const { mes: mesParam } = await searchParams;
  const actual = mesActualLima();
  const mes = leerMes(mesParam, actual);
  const { desde } = rangoDelMes(mes);
  const hayMesSiguiente = claveMes(desplazarMes(mes, 1)) <= claveMes(actual);

  const filas = await getEstadoResultados(desde);

  return (
    <EstadoResultadosVista
      filas={filas}
      tituloMes={tituloMes(mes)}
      mesAnterior={claveMes(desplazarMes(mes, -1))}
      mesSiguiente={hayMesSiguiente ? claveMes(desplazarMes(mes, 1)) : null}
    />
  );
}
