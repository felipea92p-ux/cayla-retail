import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { leerCorte } from "@/lib/balance-reglas";
import { getBalanceGeneral, getBalancePorTienda, getConciliacion, getSaldosIniciales } from "@/lib/balance";
import { BalancePanel } from "@/components/finanzas/BalancePanel";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";

// Finanzas ▸ Estados financieros ▸ Balance (ADR-0195 F7; spike «¿Cuánto vale CAYLA?»). Lee en el servidor y deja a una sola pieza
// cliente mirar. `?corte=2026-08-31` elige la fecha (por defecto, hoy). Quien ve todo (ADR-0585: el líder o quien tiene el módulo,
// salvo una terminal) ve CAYLA entera (la comprobación, el Balance si cuadra y lo que es de cada tienda) o, con `?sede=<tienda>`, lo
// que es de una tienda; una terminal con el módulo, lo de SU tienda (lo decide la base). Los saldos de arranque los registra el líder.
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ corte?: string; ver?: string; sede?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const corte = leerCorte(sp.corte, hoy);
  const esLider = persona.rol === "lider";
  const veTodo = veEstadosFinancierosDeTodoDe(persona);
  // «Todas las sedes» de la barra del telar es lo que aquí se llama «cayla» (el Balance de CAYLA entera).
  const pedida = sedeDeLaUrl(sp);
  const ver = veTodo ? (pedida !== "cayla" && pedida !== "todas" ? pedida : "cayla") : persona.ubicacionId;

  if (!veTodo || ver !== "cayla") {
    const unidades = await getBalancePorTienda(corte);
    return (
      <BalancePanel
        esLider={esLider}
        veTodo={veTodo}
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
      esLider={esLider}
      veTodo
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
