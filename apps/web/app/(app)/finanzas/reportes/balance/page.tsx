import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { leerCorte } from "@/lib/balance-reglas";
import { getBalanceGeneral, getBalancePorTienda, getConciliacion, getSaldosIniciales } from "@/lib/balance";
import { BalancePanel } from "@/components/finanzas/BalancePanel";

// Finanzas ▸ Reportes ▸ Balance (ADR-0195 F7; spike «¿Cuánto vale CAYLA?»). Lee en el servidor y deja a una sola pieza
// cliente mirar. `?corte=2026-08-31` elige la fecha (por defecto, hoy). El líder ve CAYLA entera (la comprobación, el
// Balance si cuadra y lo que es de cada tienda) o, con `?ver=<tienda>`, lo que es de una tienda; con «Reportes
// financieros», una cuenta ve lo que es de SU tienda (lo decide la base).
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ corte?: string; ver?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const corte = leerCorte(sp.corte, hoy);
  const esLider = persona.rol === "lider";
  const ver = esLider ? (sp.ver && sp.ver !== "cayla" ? sp.ver : "cayla") : persona.ubicacionId;

  if (!esLider || ver !== "cayla") {
    const unidades = await getBalancePorTienda(corte);
    return (
      <BalancePanel
        esLider={esLider}
        hoy={hoy}
        corte={corte}
        ver={ver}
        chequeos={[]}
        lineas={[]}
        unidades={unidades.datos}
        saldos={[]}
        tiendaNombre={persona.ubicacionEtiqueta}
        fallas={unidades.falla ? [unidades.falla] : []}
      />
    );
  }

  const [chequeos, lineas, unidades, saldos] = await Promise.all([
    getConciliacion(corte),
    getBalanceGeneral(corte),
    getBalancePorTienda(corte),
    getSaldosIniciales(),
  ]);
  return (
    <BalancePanel
      esLider
      hoy={hoy}
      corte={corte}
      ver="cayla"
      chequeos={chequeos.datos}
      lineas={lineas.datos}
      unidades={unidades.datos}
      saldos={saldos.datos}
      tiendaNombre={persona.ubicacionEtiqueta}
      fallas={[chequeos.falla, lineas.falla, unidades.falla, saldos.falla].filter((f): f is string => !!f)}
    />
  );
}
