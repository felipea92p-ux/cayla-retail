"use client";

import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import type { FiltroMarcas, ResumenMarcas as Resumen } from "@/lib/marcas";

/**
 * Las cuatro cifras de Marcas, que FILTRAN la lista (una función, una pieza: `<TarjetaCifra onClick activa>`, ADR-0358).
 * Viven en la hoja «Resumen» (`MarcasLista`, Felipe 2026-11-17): antes se desplegaban sobre la lista con «Resumen ▾», lejos del botón
 * en el celular. Cuentan desde 0 una vez al abrirse la hoja (`desde={0}`), como contaban al desplegarse. Las mismas cifras viven como
 * píldoras en la tarjeta de la lista (`FiltrosMarcas`).
 */
export function ResumenMarcas({
  resumen,
  filtro,
  onFiltro,
}: {
  resumen: Resumen;
  filtro: FiltroMarcas | null;
  onFiltro: (f: FiltroMarcas) => void;
}) {
  const valor = (n: number) => <CifraQueCuenta valor={n} desde={0} />;
  const falta = resumen["sin-proveedor"] > 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
  );
}
