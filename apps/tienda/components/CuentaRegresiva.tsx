"use client";

import { CuentaDeCampana, finDeCampana, partesCuenta } from "@cayla-retail/portada";
import { useAhora } from "@/lib/useAhora";

/** Cuánto falta para que termine la campaña, segundo a segundo. La página se arma por adelantado y no sabe qué hora será al abrirla: las
 *  cifras salen como «––» y toman la hora del aparato en el primer instante (`useAhora`). Las cajitas son las de la portada en una sola
 *  pieza (`CuentaDeCampana`, @cayla-retail/portada), las mismas que muestra la vista previa del ERP. */
export function CuentaRegresiva({ hasta }: { hasta: string }) {
  const fin = finDeCampana(hasta);
  const ahora = useAhora();
  return <CuentaDeCampana partes={ahora === null ? null : partesCuenta(fin - ahora)} />;
}
