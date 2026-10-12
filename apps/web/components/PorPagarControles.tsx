"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { usePorPagar, type Agrupar } from "@/components/PorPagarContexto";
import { soles } from "@/lib/compras-reglas";
import type { SegmentoConcentracion } from "@/lib/por-pagar-reglas";

// Controles chicos de Por pagar que necesitan cliente (spike 2026-09-19). Cada uno resuelve algo concreto:
//  · BarraConcentracion: «62 %» no decía QUIÉN. La barra reparte la deuda entre los proveedores que más se
//    les debe; apuntar a un tramo enciende sus filas en la lista y un clic filtra a ese proveedor.
//  · SelectorAgrupar: «Por urgencia | Por proveedor», el segmento de modo del sistema (ADR-0358), y filas que se deslizan.
//  · BotonSoloVencidas: el filtro que más se usa, a un clic y con su cuenta, sin abrir el panel de filtros.

const TONOS = ["bg-tinta", "bg-tinta/45", "bg-tinta/25", "bg-tinta/15"];

export type SegmentoConEnlace = SegmentoConcentracion & { /** Filtro por este proveedor; `null` para «Otros». */ href: string | null };

export function BarraConcentracion({ segmentos, proveedorActivo }: { segmentos: SegmentoConEnlace[]; /** El proveedor por el que ya está filtrada la lista (`?prov=`), si lo hay. */ proveedorActivo: string | null }) {
  const { apuntar } = usePorPagar();
  // La barra es `<BarraApilada>` (ADR-0358, 2026-10-09). Cada proveedor con enlace es un tramo que apunta (enciende sus filas) y filtra la
  // lista al navegar; «Otros» se dibuja pero no responde. Apuntar no es un filtro: el activo se RESALTA, no queda «presionado».
  return (
    <BarraApilada
      className="mt-3"
      alto={8}
      retraso={6}
      segmentos={segmentos.map((s, i) => {
        const texto = `${s.nombre} · ${soles(s.monto)} · ${Math.round(s.pct)} %`;
        const conEnlace = !!s.href && !!s.id;
        return {
          clave: conEnlace ? (s.id as string) : "otros",
          nombre: s.nombre,
          valor: s.monto,
          clase: TONOS[Math.min(i, TONOS.length - 1)],
          titulo: texto,
          etiqueta: conEnlace ? `${texto}. Filtrar la lista por este proveedor` : texto,
          href: conEnlace ? (s.href as string) : undefined,
          inerte: !conEnlace,
        };
      })}
      etiqueta="Deuda por proveedor"
      formato={soles}
      respuesta={{ onApuntar: (clave) => apuntar(clave === null ? null : { tipo: "proveedor", id: clave }), resaltada: proveedorActivo }}
    />
  );
}

export function SelectorAgrupar() {
  const { agrupar, cambiarAgrupar } = usePorPagar();
  return (
    <SegmentoDeslizante
      forma="modo"
      etiqueta="Cómo agrupar la deuda"
      valor={agrupar}
      onCambio={(v) => cambiarAgrupar(v as Agrupar)}
      opciones={[
        { clave: "urgencia", etiqueta: "Por urgencia" },
        { clave: "proveedor", etiqueta: "Por proveedor" },
      ]}
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
      // Deja menos comprobantes: la píldora de filtro del sistema (ADR-0358), rellena de tinta cuando filtra.
      className="pildora-cayla hidden sm:inline-flex"
    >
      Solo vencidas
      {cantidad > 0 && <span className="pildora-cayla__n">· {cantidad}</span>}
    </button>
  );
}
