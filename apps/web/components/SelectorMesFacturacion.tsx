import Link from "next/link";
import { esMismoMes, mesAnterior, mesSiguiente, NOMBRES_MES, paramDeMes, type Mes } from "@/lib/facturacion-reglas";

const ENLACE =
  "label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo";

// El mes de las vistas Proformas y Comprobantes: ← mes anterior · mes actual · mes siguiente →.
// Es de servidor a propósito: solo pinta enlaces con el mes que la página ya resolvió, no
// necesita estado. Resumen es «hoy» y Códigos no tiene tiempo, así que no lo llevan.
// Nunca hay «mes siguiente» desde el mes actual: no hay nada que ver en el futuro.
export function SelectorMesFacturacion({ ruta, mes, actual }: { ruta: string; mes: Mes; actual: Mes }) {
  const previo = mesAnterior(mes);
  const siguiente = mesSiguiente(mes);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${ruta}?m=${paramDeMes(previo)}`} className={ENLACE}>
        ← {NOMBRES_MES[previo.mes - 1]}
      </Link>
      <p className="font-display px-1 text-lg text-tinta">
        {NOMBRES_MES[mes.mes - 1]} {mes.anio}
      </p>
      {!esMismoMes(mes, actual) && (
        <Link href={`${ruta}?m=${paramDeMes(siguiente)}`} className={ENLACE}>
          {NOMBRES_MES[siguiente.mes - 1]} →
        </Link>
      )}
    </div>
  );
}
