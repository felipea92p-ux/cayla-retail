"use client";

import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import type { FiltroMarcas, ResumenMarcas as Resumen } from "@/lib/marcas";

/**
 * Las cuatro cifras de Marcas, que FILTRAN la lista (una función, una pieza: `<TarjetaCifra onClick activa>`, ADR-0358).
 * Nacen colapsadas (`abierto = false`): las marcas son lo primero que se ve, y los mismos cuatro números viven como píldoras
 * en la tarjeta de la lista (`FiltrosMarcas`). Al abrir se despliegan y las cifras cuentan una vez: se muestran en 0 mientras
 * están cerradas (nadie las ve) y `CifraQueCuenta` cuenta hasta el valor real cuando se abren.
 */
export function ResumenMarcas({
  resumen,
  filtro,
  onFiltro,
  abierto,
}: {
  resumen: Resumen;
  filtro: FiltroMarcas | null;
  onFiltro: (f: FiltroMarcas) => void;
  abierto: boolean;
}) {
  const valor = (n: number) => <CifraQueCuenta valor={abierto ? n : 0} />;
  const falta = resumen["sin-proveedor"] > 0;
  return (
    <div id="resumen-marcas" className="marcas-resumen" data-abierto={abierto ? "" : undefined}>
      <div className="marcas-resumen-clip">
        <div className="marcas-resumen-in grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TarjetaCifra etiqueta="Marcas activas" valor={valor(resumen.activas)} onClick={() => onFiltro("activas")} activa={filtro === "activas"}>
            Todas las que puedes elegir al crear un producto
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Ya las usamos" valor={valor(resumen.con)} onClick={() => onFiltro("con")} activa={filtro === "con"}>
            Con al menos un producto activo
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Aún sin productos" valor={valor(resumen.sin)} onClick={() => onFiltro("sin")} activa={filtro === "sin"}>
            Listas, nadie las ha usado todavía
          </TarjetaCifra>
          <TarjetaCifra
            etiqueta="Sin proveedor"
            valor={valor(resumen["sin-proveedor"])}
            onClick={() => onFiltro("sin-proveedor")}
            activa={filtro === "sin-proveedor"}
            punto={falta ? "ambar" : undefined}
            tono={falta ? "text-ambar-profundo" : undefined}
          >
            {falta ? "Falta decir quién las trae" : "Todo en orden"}
          </TarjetaCifra>
        </div>
      </div>
    </div>
  );
}
