"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { usePorPagar, type Agrupar } from "@/components/PorPagarContexto";
import { soles } from "@/lib/compras-reglas";
import type { SegmentoConcentracion } from "@/lib/por-pagar-reglas";

// Controles chicos de Por pagar que necesitan cliente (spike 2026-09-19). Cada uno resuelve algo concreto:
//  · BarraConcentracion: «62 %» no decía QUIÉN. La barra reparte la deuda entre los proveedores que más se
//    les debe; apuntar a un tramo enciende sus filas en la lista y un clic filtra a ese proveedor.
//  · SelectorAgrupar: «Por urgencia | Por proveedor» con un pulgar que viaja y filas que se deslizan.
//  · BotonSoloVencidas: el filtro que más se usa, a un clic y con su cuenta, sin abrir el panel de filtros.

const TONOS = ["bg-tinta", "bg-tinta/45", "bg-tinta/25", "bg-tinta/15"];

export type SegmentoConEnlace = SegmentoConcentracion & { /** Filtro por este proveedor; `null` para «Otros». */ href: string | null };

export function BarraConcentracion({ segmentos, proveedorActivo }: { segmentos: SegmentoConEnlace[]; /** El proveedor por el que ya está filtrada la lista (`?prov=`), si lo hay. */ proveedorActivo: string | null }) {
  const { apuntar } = usePorPagar();
  return (
    <div className="mt-3 flex h-2 gap-[3px]" role="group" aria-label="Deuda por proveedor">
      {segmentos.map((s, i) => {
        const clase = `anim-crece-x block h-full min-w-1 basis-0 rounded-[3px] ${TONOS[Math.min(i, TONOS.length - 1)]} transition-[flex-grow,opacity,transform] duration-700 ease-cayla ${
          proveedorActivo && s.id !== proveedorActivo ? "opacity-35" : ""
        }`;
        const estilo = { flexGrow: s.monto, ["--i" as string]: i + 6 };
        const texto = `${s.nombre} · ${soles(s.monto)} · ${Math.round(s.pct)} %`;
        if (!s.href || !s.id) {
          return <span key="otros" className={clase} style={estilo} title={texto} aria-label={texto} />;
        }
        const id = s.id;
        return (
          <Link
            key={id}
            href={s.href}
            title={texto}
            aria-label={`${texto}. Filtrar la lista por este proveedor`}
            onMouseEnter={() => apuntar({ tipo: "proveedor", id })}
            onMouseLeave={() => apuntar(null)}
            onFocus={() => apuntar({ tipo: "proveedor", id })}
            onBlur={() => apuntar(null)}
            className={`${clase} hover:scale-y-[1.7] focus-visible:scale-y-[1.7]`}
            style={estilo}
          />
        );
      })}
    </div>
  );
}

export function SelectorAgrupar() {
  const { agrupar, cambiarAgrupar } = usePorPagar();
  return (
    <SegmentoDeslizante
      etiqueta="Cómo agrupar la deuda"
      valor={agrupar}
      onCambio={(v) => cambiarAgrupar(v as Agrupar)}
      opciones={[
        { clave: "urgencia", etiqueta: "Por urgencia" },
        { clave: "proveedor", etiqueta: "Por proveedor" },
      ]}
      className="h-9 [&_button]:py-0"
    />
  );
}

export function BotonSoloVencidas({ cantidad }: { cantidad: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activo = params.get("vencidas") === "1";
  if (cantidad === 0 && !activo) return null;
  function alternar() {
    const p = new URLSearchParams(params.toString());
    if (activo) p.delete("vencidas");
    else p.set("vencidas", "1");
    p.delete("cursor");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={activo}
      // `hidden sm:inline-flex`: en celular no cabe junto al agrupar y al botón de Filtros; ahí lo cubren la tarjeta «Vencido» y el panel.
      className={`label-cayla hidden h-9 items-center gap-2 rounded-lg border px-3 text-[11px] transition-colors duration-200 sm:inline-flex ${
        activo ? "border-tinta bg-tinta text-crema" : "border-tinta/15 text-tinta/65 hover:border-rojo hover:text-rojo"
      }`}
    >
      Solo vencidas
      {cantidad > 0 && <span className="font-medium tracking-normal opacity-70">· {cantidad}</span>}
    </button>
  );
}
