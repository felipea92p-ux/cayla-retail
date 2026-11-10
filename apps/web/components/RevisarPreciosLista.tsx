"use client";

// «Revisar precios» (Catálogo ▸ Productos, ADR-0641): las cuatro cifras —que filtran— y la tabla de prendas cuyo precio conviene mirar.
// La cuenta la hizo la base, sin IA. Proponer y aplicar un precio, prenda por prenda, vive en la fila (actividad 4).

import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/compras-reglas";
import { textoMotivo, type CuentasPrecios, type FiltroPrecio, type PrendaARevisar } from "@/lib/revisar-precios-reglas";

const PLANTILLA = "sm:grid-cols-[minmax(0,2fr)_6.5rem_7.5rem_5rem_7rem_minmax(0,1.6fr)]";

export function RevisarPreciosCifras({ cuentas, filtro }: { cuentas: CuentasPrecios; filtro: FiltroPrecio | null }) {
  const router = useRouter();
  // Tocar la cifra puesta otra vez vuelve a «todas».
  const filtrar = (f: FiltroPrecio) => router.push(f === filtro ? "/productos/revisar-precios" : `/productos/revisar-precios?motivo=${f}`);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-guia="revisar-precios.cifras">
      <TarjetaCifra etiqueta="Pierden dinero" valor={cuentas.pierde} punto={cuentas.pierde > 0 ? "rojo" : undefined} onClick={() => filtrar("pierde_dinero")} activa={filtro === "pierde_dinero"}>
        El precio no cubre el costo
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Margen bajo" valor={cuentas.margen} punto={cuentas.margen > 0 ? "ambar" : undefined} onClick={() => filtrar("margen_bajo")} activa={filtro === "margen_bajo"}>
        Ganan menos de 30 %
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Lejos de su categoría" valor={cuentas.lejos} onClick={() => filtrar("lejos")} activa={filtro === "lejos"}>
        35 % más caras o más baratas que sus parecidas
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Sin costo propio" valor={cuentas.sinCosto} onClick={() => filtrar("sin_costo")} activa={filtro === "sin_costo"}>
        Su margen no se puede saber
      </TarjetaCifra>
    </div>
  );
}

export function RevisarPreciosTabla({ prendas }: { prendas: PrendaARevisar[] }) {
  return (
    <Tabla guia="revisar-precios.tabla">
      <Encabezado
        plantilla={PLANTILLA}
        columnas={[
          { titulo: "Prenda" },
          { titulo: "Precio", alinear: "der" },
          { titulo: "Costo", alinear: "der" },
          { titulo: "Margen", alinear: "der" },
          { titulo: "Medio de su categoría", alinear: "der", ayuda: "El precio del medio de las prendas de su categoría (la mitad cuesta más y la mitad menos)." },
          { titulo: "Por qué" },
        ]}
      />
      <div data-resultados>
        {prendas.map((p) => {
          const motivo = textoMotivo(p);
          return (
            <div key={p.productoId} className={fila(PLANTILLA)}>
              <div className={celda("izq")}>
                <p className="truncate text-[15px]">{p.referencia}</p>
                <p className="texto-detalle truncate text-taupe">
                  {p.categoria} · {p.vendidas90 === 1 ? "1 vendida" : `${p.vendidas90} vendidas`} en 90 días · {p.stock} en stock
                </p>
              </div>
              <div className={celda("der")}>
                <span className="sm:hidden text-taupe">Precio </span>
                {soles(p.precio)}
              </div>
              <div className={celda("der")}>
                <span className="sm:hidden text-taupe">Costo </span>
                {p.costo === null ? "—" : soles(p.costo)}
                {p.costoEstimado && <span className="block text-xs text-taupe">estimado</span>}
              </div>
              <div className={celda("der")}>
                <span className="sm:hidden text-taupe">Margen </span>
                {p.margen === null ? "—" : `${Math.round(p.margen)} %`}
              </div>
              <div className={celda("der")}>
                <span className="sm:hidden text-taupe">Medio de su categoría </span>
                {p.medianaCategoria === null ? "—" : soles(p.medianaCategoria)}
              </div>
              <div className={celda("izq")}>
                <Chip tono={motivo.tono} versalitas={false}>
                  {motivo.texto}
                </Chip>
              </div>
            </div>
          );
        })}
      </div>
    </Tabla>
  );
}
