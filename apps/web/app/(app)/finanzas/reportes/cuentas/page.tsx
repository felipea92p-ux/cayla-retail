import { Landmark } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mesDeLosEstados, paramsDe } from "@/lib/estados-financieros-reglas";
import { leerVerCuentas } from "@/lib/contador-reglas";
import { diarioDelMes, saldosDelMes } from "@/lib/contador";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { SaldosPanel } from "@/components/finanzas/estados/SaldosPanel";
import { DiarioPanel } from "@/components/finanzas/estados/DiarioPanel";

// Finanzas ▸ Estados financieros ▸ Ver ▸ Saldos por cuenta o Libro diario del mes (ADR-0585; Felipe 2026-10-31: «la 2, el menú Ver»).
// Los dos cuadros del contador que no son un estado: `?cuadro=saldos` (`fn_saldos_por_cuenta`) o `?cuadro=diario` (`fn_diario`, todo el
// mes, por páginas). Son los mismos datos que se descargan. Es de CAYLA entera: lo ve quien ve los Estados financieros de todo; una
// terminal, no (la base lo exige igual).
export default async function CuentasPage({ searchParams }: { searchParams: Promise<{ mes?: string; sede?: string; ver?: string; cuadro?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = mesDeLosEstados(sp.mes, hoy);
  const cuadro = leerVerCuentas(sp.cuadro);
  const cabecera = <CabeceraEstados pantalla={cuadro} mes={mes} sede={sedeDeLaUrl(sp)} hoy={hoy} params={paramsDe(sp)} forma="respuesta" />;

  if (!veEstadosFinancierosDeTodoDe(persona))
    return (
      <div className="space-y-6">
        {cabecera}
        <Vacio icono={<Landmark />} titulo="Es de CAYLA entera">
          Los saldos por cuenta y el libro diario se ven desde una cuenta personal con el módulo Resumen y estados financieros.
        </Vacio>
      </div>
    );

  if (cuadro === "saldos") {
    const s = await saldosDelMes(mes);
    return (
      <div className="space-y-6">
        {cabecera}
        {s.falla?.includes("Faltan los saldos de arranque") ? (
          <Vacio icono={<Landmark />} titulo="Faltan los saldos de arranque">
            Los saldos por cuenta se cuentan desde el día en que CAYLA empezó a usar el sistema. El líder los registra en ¿Cuánto vale CAYLA? ▸
            Formato formal ▸ Saldos de arranque.
          </Vacio>
        ) : s.falla ? (
          <Aviso tono="error" titulo="No se pudieron leer los saldos por cuenta">
            {s.falla}
          </Aviso>
        ) : (
          <SaldosPanel saldos={s.datos} mes={mes} />
        )}
      </div>
    );
  }

  const d = await diarioDelMes(mes, hoy);
  return (
    <div className="space-y-6">
      {cabecera}
      {d.falla ? (
        <Aviso tono="error" titulo="No se pudo leer el libro diario">
          {d.falla}
        </Aviso>
      ) : (
        <DiarioPanel lineas={d.lineas} cuentas={Object.fromEntries(d.cuentas)} sedes={Object.fromEntries(d.sedes)} mes={mes} />
      )}
    </div>
  );
}
