import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { leerCorte, situacion } from "@/lib/balance-reglas";
import { getBalanceGeneral, getBalancePorTienda, getConciliacion, getSaldosIniciales } from "@/lib/balance";
import { BalancePanel } from "@/components/finanzas/BalancePanel";
import { hrefTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mesDe, rangoMes } from "@/lib/gastos-reglas";
import { getEstadoResultados } from "@/lib/resultados";
import { mesAnterior } from "@/lib/resultados-reglas";
import { gruposDelBalance, medidores, recomendacionesVale } from "@/lib/vale-reglas";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";
import { rangoDelMes } from "@/lib/flujo-caja-reglas";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { formaDe, mesDeLosEstados, paramsDe } from "@/lib/estados-financieros-reglas";

// Finanzas ▸ Estados financieros ▸ Balance (ADR-0195 F7; spike «¿Cuánto vale CAYLA?»). Lee en el servidor y deja a una sola pieza
// cliente mirar. `?corte=2026-08-31` elige la fecha (por defecto, el último día del mes de la barra, o hoy en el mes en curso). Quien ve todo (ADR-0585: el líder o quien tiene el módulo,
// salvo una terminal) ve CAYLA entera (la comprobación, el Balance si cuadra y lo que es de cada tienda) o, con `?sede=<tienda>`, lo
// que es de una tienda; una terminal con el módulo, lo de SU tienda (lo decide la base). Los saldos de arranque los registra el líder.
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ corte?: string; ver?: string; sede?: string; mes?: string; forma?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = mesDeLosEstados(sp.mes, hoy);
  const corte = leerCorte(sp.corte, rangoDelMes(mes, hoy).hasta);
  const esLider = persona.rol === "lider";
  const veTodo = veEstadosFinancierosDeTodoDe(persona);
  // «Todas las sedes» de la barra del telar es lo que aquí se llama «cayla» (el Balance de CAYLA entera).
  const pedida = sedeDeLaUrl(sp);
  // «Empresa» no tiene un Balance aparte: es el de CAYLA entera.
  const ver = veTodo ? (pedida !== "cayla" && pedida !== "todas" && pedida !== "empresa" ? pedida : "cayla") : persona.ubicacionId;
  const cabecera = <CabeceraEstados pantalla="vale" mes={mes} sede={veTodo ? pedida : (persona.ubicacionId ?? "todas")} hoy={hoy} params={paramsDe(sp)} forma={formaDe(sp.forma)} />;


  const params = paramsDe(sp);
  const href = (ruta: string, otra?: string) => hrefTelar(ruta, params, otra ? { sede: otra } : {}, { mismaPantalla: false, mesDeHoy: mesDelDia(hoy) });
  const deUnaSede = !veTodo || ver !== "cayla";
  const base = rangoMes(mesAnterior(mesDe(hoy)));

  const [chequeos, lineas, unidades, saldos, erBase] = await Promise.all([
    deUnaSede ? Promise.resolve({ datos: [], falla: null }) : getConciliacion(corte),
    deUnaSede ? Promise.resolve({ datos: [], falla: null }) : getBalanceGeneral(corte),
    getBalancePorTienda(corte),
    deUnaSede ? Promise.resolve({ datos: [], falla: null }) : getSaldosIniciales(),
    // Para cuántos meses de venta alcanza la mercadería: lo que costó lo vendido en el último mes completo (CAYLA). Apoyo: sin él, el
    // medidor dice que falta un mes con ventas.
    deUnaSede ? Promise.resolve(null) : getEstadoResultados(base.desde, base.hasta),
  ]);
  const costoDelMes = erBase && !erBase.falla ? (erBase.datos.find((f) => f.unidad === "consolidado")?.costo ?? null) : null;
  const cuadra = deUnaSede ? null : situacion(chequeos.datos).tipo === "cuadra";
  const medidas = cuadra ? medidores(gruposDelBalance(lineas.datos), costoDelMes) : null;
  const recomendaciones = recomendacionesVale({ cuadra, medidas, unidades: unidades.datos, sede: deUnaSede ? ver : null, href });

  return (
    <div className="space-y-6">
      {cabecera}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <BalancePanel
            esLider={esLider}
            veTodo={veTodo}
            hoy={hoy}
            corte={corte}
            ver={deUnaSede ? ver : "cayla"}
            chequeos={chequeos.datos}
            lineas={lineas.datos}
            unidades={unidades.datos}
            saldos={saldos.datos}
            costoDelMes={costoDelMes}
            forma={formaDe(sp.forma)}
            fallas={[chequeos.falla, lineas.falla, unidades.falla, saldos.falla].filter((f): f is string => !!f)}
          />
        </div>
        <Recomendaciones recomendaciones={recomendaciones} />
      </div>
    </div>
  );
}
