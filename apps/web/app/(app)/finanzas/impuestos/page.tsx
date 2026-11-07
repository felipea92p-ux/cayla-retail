import { exigirModulo } from "@/lib/persona-actual";
import { esMes, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { getPanelImpuestos } from "@/lib/impuestos";
import { getRentaDelAno } from "@/lib/renta-anual";
import { getVentasClaure } from "@/lib/cuenta-claure";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { sedeDeLaUrl, sedeElegida } from "@/lib/finanzas-telar-reglas";
import { ImpuestosPanel } from "@/components/ImpuestosPanel";
import { getEstadoSire } from "@/lib/sire";
import { getIgvDichoDelMes } from "@/lib/igv-gestion";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { mesAntesDelCorte } from "@/lib/finanzas-arranque-reglas";

// Finanzas ▸ Impuestos (ADR-0195 F8, en «El telar» desde ADR-0493). Lee en el servidor, en una sola función (`fn_impuestos_panel`), y
// deja a una pieza cliente las descargas para el contador. El mes y la sede vienen de la mesa de mando: `?mes=2026-08` (sin él, el mes
// de hoy, como toda la barra) y `?sede=`. El IGV se declara junto, por el RUC de CAYLA: la sede elegida se nombra y la balanza dice
// que el reparto por sede todavía no existe (decisión de Felipe, «IGV del mes por lugar»).
export default async function ImpuestosPage({ searchParams }: { searchParams: Promise<{ mes?: string; sede?: string; ver?: string }> }) {
  const persona = await exigirModulo("impuestos");
  const sp = await searchParams;
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoyLima());
  const { desde, hasta } = rangoMes(mes);
  // El IGV del mes lo dice solo el líder (ADR-0620), y solo de un mes que ya empezó y que Finanzas cuenta: la base lo vuelve a exigir.
  const inicio = (await getParametrosFinanzas())?.inicioFinanzas ?? null;
  const puedeDecirIgv = persona.rol === "lider" && mes <= mesDe(hoyLima()) && !(inicio && mesAntesDelCorte(mes, inicio));
  // «De ese IGV, S/ X es de ventas de CLAURE»: apoyo, no cifra (sin permiso o sin CLAURE llega `null` y la pantalla se ve como siempre).
  // «Antes de declarar» suma lo que no cuadra con la propuesta de SUNAT (ADR-0601); sin el dato, la pantalla se ve como siempre.
  // La renta de marzo (ADR-0598) es del año, no del mes elegido: se lee con hoy.
  const [panel, telar, claure, sire, renta, igvDelMes] = await Promise.all([
    getPanelImpuestos(mes),
    getSedesDelTelar(),
    getVentasClaure(desde, hasta),
    getEstadoSire(mes),
    getRentaDelAno(hoyLima()),
    puedeDecirIgv ? getIgvDichoDelMes(mes) : Promise.resolve(null),
  ]);
  const sede = sedeElegida(sedeDeLaUrl(sp), telar.sedes, telar.veTodo, telar.propia);
  return <ImpuestosPanel panel={panel.datos} falla={panel.falla} sede={sede} sedes={telar.sedes} claure={claure} sire={sire} renta={renta} igvDelMes={igvDelMes} />;
}
