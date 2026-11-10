import { exigirModulo } from "@/lib/persona-actual";
import { esMes, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { getIgvCambiado, getPanelImpuestos } from "@/lib/impuestos";
import { AvisoIgvCambiado } from "@/components/finanzas/AvisoIgvCambiado";
import { getRentaDelAno } from "@/lib/renta-anual";
import { getVentasClaure } from "@/lib/cuenta-claure";
import { ImpuestosPanel } from "@/components/ImpuestosPanel";
import { getEstadoSire } from "@/lib/sire";

// Finanzas ▸ Impuestos (ADR-0195 F8, en «El telar» desde ADR-0493). Lee en el servidor, en una sola función (`fn_impuestos_panel`), y
// deja a una pieza cliente las descargas para el contador. El mes viene de la mesa de mando: `?mes=2026-08` (sin él, el mes de hoy, como
// toda la barra). El IGV se declara junto, por el RUC de CAYLA, y ninguna de sus lecturas recibe sede: la pantalla es de CAYLA entera, la barra
// apaga las sedes y `?sede=` sigue en la URL solo para la pantalla siguiente. El reparto por sede («IGV del mes por lugar») sigue abierto en el backlog.
export default async function ImpuestosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirModulo("impuestos");
  const sp = await searchParams;
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoyLima());
  const { desde, hasta } = rangoMes(mes);
  // «De ese IGV, S/ X es de ventas de CLAURE»: apoyo, no cifra (sin permiso o sin CLAURE llega `null` y la pantalla se ve como siempre).
  // «Antes de declarar» suma lo que no cuadra con la propuesta de SUNAT (ADR-0601); sin el dato, la pantalla se ve como siempre.
  // La renta de marzo (ADR-0598) es del año, no del mes elegido: se lee con hoy.
  const [panel, claure, sire, renta, igvCambiado] = await Promise.all([
    getPanelImpuestos(mes),
    getVentasClaure(desde, hasta),
    getEstadoSire(mes),
    getRentaDelAno(hoyLima()),
    getIgvCambiado(),
  ]);
  return (
    <>
      <AvisoIgvCambiado cambios={igvCambiado} />
      <ImpuestosPanel panel={panel.datos} falla={panel.falla} claure={claure} sire={sire} renta={renta} />
    </>
  );
}
