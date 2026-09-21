import { exigirLider } from "@/lib/persona-actual";
import { getProformasMes } from "@/lib/proformas";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro, periodoDelMes, resumenProformas } from "@/lib/facturacion-reglas";
import { ProformasPanel } from "@/components/ProformasPanel";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";
import { ProformasTarjetas } from "@/components/ProformasTarjetas";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";

// El modal de «Nueva proforma» ya no vive en el panel sino en el shell (que ya tiene las
// tiendas): esta vista solo lee las proformas del mes (`getProformasMes` suma además todas
// las vigentes, sin filtro de mes, porque son una cola de trabajo).
export default async function ProformasPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await exigirLider();
  const { m } = await searchParams;
  const ahora = new Date();
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);

  // Las proformas son plata cotizada: sin ellas la pantalla no se dibuja (`exigir`, dentro de la lectura).
  const proformas = await getProformasMes(desde, hasta, ahora.getTime());

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <SelectorMesFacturacion ruta="/vender/facturacion/proformas" mes={mes} actual={actual} />
      <ProformasTarjetas resumen={resumenProformas(proformas, ahora.getTime())} />
      <ProformasPanel proformas={proformas} periodo={periodoDelMes(mes, actual)} ahora={ahora} />
    </div>
  );
}
