"use client";

import { createContext, useContext, type ReactNode } from "react";
import { PackageCheck, Truck } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { nombreDeCanal, textoCortoDeEntrega, textoDeEntrega, type CanalVenta } from "@/lib/canales-venta-reglas";
import type { Apartado } from "@/lib/separaciones-reglas";

// El canal de un apartado a la vista (ADR-0607). Un apartado de la tienda no lleva marca (sería ruido: es lo de siempre); uno de un canal
// online (TikTok…) dice por dónde se vendió y cómo se entrega, para que no se confunda con los de la tienda en la lista.
// Los nombres de los canales los trae el panel de Apartados una vez (`CanalesDeApartados`) y las piezas que dibujan filas los leen aquí,
// sin pasarlos por cada componente.

const Contexto = createContext<readonly CanalVenta[]>([]);

export function CanalesDeApartados({ canales, children }: { canales: readonly CanalVenta[]; children: ReactNode }) {
  return <Contexto.Provider value={canales}>{children}</Contexto.Provider>;
}

export const useCanalesDeApartados = () => useContext(Contexto);

/** ¿Es un apartado de un canal online (no de la tienda física)? */
export const esDeCanalOnline = (a: Pick<Apartado, "canal">) => a.canal !== "tienda";

/** La marca de un apartado de un canal online: «TikTok · Envío por despachar». Nada si es de la tienda. */
export function CanalChip({ a, className = "" }: { a: Pick<Apartado, "canal" | "modoEntrega" | "enviadoEn">; className?: string }) {
  const canales = useCanalesDeApartados();
  if (!esDeCanalOnline(a)) return null;
  const Icono = a.modoEntrega === "envio" ? (a.enviadoEn ? PackageCheck : Truck) : null;
  return (
    <Chip tono="pizarra" versalitas={false} className={`max-w-full ${className}`} title={`Venta por ${nombreDeCanal(canales, a.canal)} · ${textoDeEntrega(a)}`}>
      {Icono && <Icono aria-hidden className="h-3 w-3 shrink-0" />}
      <span className="min-w-0 truncate">{nombreDeCanal(canales, a.canal)} · {textoCortoDeEntrega(a)}</span>
    </Chip>
  );
}
