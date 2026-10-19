"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shirt } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { PrendasDeEtiquetaModal } from "@/components/PrendasDeEtiquetaModal";
import type { PrendaConCosto } from "@/lib/etiqueta-campana";
import type { CampanaDetalle } from "@/lib/campana-detalle";

/**
 * Tienda web ▸ Campañas ▸ una campaña ▸ Prendas (ADR-0436, actividad 2): las prendas que la campaña lleva a mano, por modelo, y «Elegir
 * prendas», que abre la misma hoja de siempre (`PrendasDeEtiquetaModal`: por modelo con excepciones por talla, lo que cambia en caja antes
 * de guardar, el aviso de costo y el responsable). Si además rige en categorías enteras, se dice: esas se cambian en Datos.
 */
export function PrendasCampana({ campana, prendasConCosto }: { campana: CampanaDetalle; prendasConCosto: PrendaConCosto[] }) {
  const router = useRouter();
  const [eligiendo, setEligiendo] = useState(false);
  const etiqueta = {
    id: campana.id,
    nombre: campana.nombre,
    descuentoPct: campana.pct,
    vigenteDesde: campana.desde,
    vigenteHasta: campana.hasta,
    categoriaIds: campana.categoriaIds,
  };
  const n = campana.categoriaIds.length;
  const elegir = (
    <Boton peso="primario" onClick={() => setEligiendo(true)} disabled={!campana.activo} title={campana.activo ? undefined : "Actívala en Datos para elegir sus prendas"}>
      Elegir prendas
    </Boton>
  );

  return (
    <section className="card-cayla" data-guia="campana.prendas">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand px-4 py-3.5 sm:px-5">
        <TituloSeccion cuenta={campana.prendas.length}>Prendas de la campaña</TituloSeccion>
        {campana.prendas.length > 0 && <div data-guia="campana.elegir">{elegir}</div>}
      </div>
      {n > 0 && (
        <p className="nota-cayla mx-4 mt-4 sm:mx-5">
          Además rige en {n === 1 ? "1 categoría completa" : `${n} categorías completas`}: todas sus prendas llevan la campaña. Las categorías se
          cambian en Datos.
        </p>
      )}
      {campana.prendas.length === 0 ? (
        <div className="p-4 sm:p-5">
          <Vacio
            icono={<Shirt />}
            titulo={`Todavía no hay prendas en ${campana.nombre}`}
            acciones={<div data-guia="campana.elegir">{elegir}</div>}
            guia="campana.sin-prendas"
          >
            Elige las prendas que entran a la campaña: llevan su descuento en caja y pueden salir en la portada de la tienda online.
          </Vacio>
        </div>
      ) : (
        <ul className="divide-y divide-sand">
          {campana.prendas.map((p) => (
            <li key={p.productoId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <MiniaturaPrenda fotoUrl={p.foto} colorHex={p.colores[0]?.hex ?? null} tamano="md" prefijo={p.prefijo} familia={p.familia} categoria={p.categoria} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-tinta">{p.nombre}</p>
                <p className="truncate text-[12.5px] text-tinta/70">
                  {[p.codigo, p.colores.map((c) => c.nombre).join(", ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-[12.5px] tabular-nums text-taupe">
                {p.variantes} {p.variantes === 1 ? "variante" : "variantes"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {eligiendo && (
        <PrendasDeEtiquetaModal
          etiqueta={etiqueta}
          prendasConCosto={prendasConCosto}
          marcasManuales={campana.varianteIds}
          onClose={() => setEligiendo(false)}
          onAplicado={() => {
            setEligiendo(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
