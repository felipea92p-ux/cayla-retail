import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { solesCentimos } from "@/lib/flujo-caja-reglas";
import { parteDeLaTienda, pieDeEmpresa, type CifrasDeLaTienda } from "@/lib/reportes-por-empresa-reglas";

// Las cuatro cifras de «CAYLA y CLAURE» (ADR-0667): la tienda entera, cada empresa y las ventas mixtas. Es la `TarjetaCifra` de siempre (ADR-0358). Van con
// céntimos (ADR-0609): son cifras que se cuadran contra la cuenta con CLAURE y contra un extracto.

const PORCENTAJE = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });

export function CifrasPorEmpresa({ c, tienda, periodo }: { c: CifrasDeLaTienda; tienda: string; periodo: string }) {
  return (
    <div data-guia="empresas.cifras" className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Las cifras del período">
      <TarjetaCifra etiqueta={`Vendido en ${tienda}`} valor={solesCentimos(c.vendido)} pie={periodo}>
        {pieDeEmpresa(c)}
      </TarjetaCifra>
      {c.empresas.map((e) => {
        const parte = parteDeLaTienda(e.vendido, c.vendido);
        return (
          <TarjetaCifra key={e.empresa.id} etiqueta={e.empresa.nombre} valor={solesCentimos(e.vendido)} pie={parte === null ? undefined : `${PORCENTAJE.format(parte)} % de la tienda`}>
            {pieDeEmpresa(e)}
          </TarjetaCifra>
        );
      })}
      <TarjetaCifra etiqueta="Ventas mixtas" valor={String(c.mixtas)} unidad={c.mixtas === 1 ? "venta" : "ventas"} pie="con prendas de dos empresas">
        {c.ventas > 0 ? `${PORCENTAJE.format(Math.round((c.mixtas / c.ventas) * 1000) / 10)} % de las ventas` : "Sin ventas"}
      </TarjetaCifra>
    </div>
  );
}
