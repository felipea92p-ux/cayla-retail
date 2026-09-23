import { exigirPermiso } from "@/lib/persona-actual";
import { getProformasMes, type FotoDePrenda } from "@/lib/proformas";
import { lineasDeLaProforma } from "@/lib/proformas-reglas";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro, periodoDelMes, resumenProformas, tiendasOperativas, ubicacionActualDe } from "@/lib/facturacion-reglas";
import { conversionDelMes } from "@/lib/facturacion-proformas-reglas";
import { ProformasPanel } from "@/components/ProformasPanel";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";
import { ProformasTarjetas } from "@/components/ProformasTarjetas";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";
import type { PrendaParaProforma } from "@/components/NuevaProformaModal";

// Proformas (ADR-0167): la lista del mes (`getProformasMes` suma además todas las vigentes, sin filtro de mes,
// porque son una cola de trabajo) y el catálogo para «Nueva proforma», que vive en esta vista. El catálogo es
// la misma lectura de Vender (`getCatalogo`); de ahí salen también la foto y el color de cada prenda cotizada.
export default async function ProformasPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await exigirPermiso("facturar");
  const { m } = await searchParams;
  const ahora = new Date();
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);

  // Las proformas son plata cotizada: sin ellas la pantalla no se dibuja (`exigir`, dentro de la lectura).
  const [proformas, catalogo, ubicaciones] = await Promise.all([getProformasMes(desde, hasta, ahora.getTime()), getCatalogo(), getUbicaciones()]);

  const prendas: PrendaParaProforma[] = catalogo
    .filter((v) => v.activo && v.precio > 0)
    .map((v) => ({
      varianteId: v.varianteId,
      sku: v.sku,
      codigo: v.codigo,
      referencia: v.referencia,
      talla: v.talla,
      color: v.color,
      marca: v.marca,
      codigosBarras: v.codigosBarras,
      precio: v.precio,
      fotoUrl: v.fotoUrl,
      colorHex: v.colorHex,
    }));

  // Solo las fotos de las prendas que aparecen en estas proformas (no las de todo el catálogo).
  const enProformas = new Set(proformas.flatMap((p) => (lineasDeLaProforma(p.items) ?? []).map((l) => l.variante_id)));
  const fotos: Record<string, FotoDePrenda> = Object.fromEntries(
    catalogo.filter((v) => enProformas.has(v.varianteId)).map((v) => [v.varianteId, { fotoUrl: v.fotoUrl, colorHex: v.colorHex }])
  );

  const tiendas = tiendasOperativas(ubicaciones).map(({ id, nombre }) => ({ id, nombre }));

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <SelectorMesFacturacion ruta="/vender/comprobantes/proformas" mes={mes} actual={actual} />
      <ProformasTarjetas resumen={resumenProformas(proformas, ahora.getTime())} />
      <ProformasPanel
        proformas={proformas}
        periodo={periodoDelMes(mes, actual)}
        ahora={ahora}
        conversion={conversionDelMes(proformas, desde, hasta)}
        prendas={prendas}
        tiendas={tiendas}
        ubicacionActualId={ubicacionActualDe(tiendas, persona.ubicacionId)}
        esLider={persona.rol === "lider"}
        fotos={fotos}
      />
    </div>
  );
}
