"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { varianteLegible, type ImpactoCambio, type Validacion } from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";

// Piezas de solo lectura del flujo de Cambios (2026-09-18): lo que el sistema le
// explica a la colaboradora antes de que confirme. Sin estado propio — todo llega ya
// calculado desde `cambios-reglas.ts`, así la pantalla no puede decir algo distinto
// de lo que `registrar_cambio` va a hacer.

export type PrendaFicha = {
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  precio: number;
};

function FichaPrenda({ titulo, prenda, vacia }: { titulo: string; prenda: PrendaFicha | null; vacia: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-crema/70 p-4">
      <p className="text-xs font-semibold text-tinta/70">{titulo}</p>
      {prenda ? (
        <div className="mt-3 flex items-center gap-3">
          <MiniaturaPrenda fotoUrl={prenda.fotoUrl} colorHex={prenda.colorHex} tamano="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-tinta">{prenda.referencia}</p>
            <p className="text-sm text-tinta/75">{varianteLegible(prenda)}</p>
            <p className="mt-0.5 text-sm tabular-nums text-tinta">{soles(prenda.precio)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 flex h-12 items-center text-sm text-tinta/70">{vacia}</p>
      )}
    </div>
  );
}

/** "Sale → entra": la comparación que la colaboradora le puede mostrar a la clienta. */
export function ComparacionPrendas({
  devuelta,
  nueva,
  cantidad,
  diferencia,
}: {
  devuelta: PrendaFicha;
  nueva: PrendaFicha | null;
  cantidad: number;
  diferencia: number;
}) {
  const textoDiferencia = diferencia > 0 ? "Diferencia a cobrar" : diferencia < 0 ? "Diferencia a devolver" : "Diferencia";
  return (
    <div className="space-y-3">
      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <FichaPrenda titulo={cantidad > 1 ? `Devuelve (${cantidad})` : "Prenda que devuelve"} prenda={devuelta} vacia="" />
        <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-tinta/60 sm:rotate-0" role="img" aria-label="se cambia por" />
        <FichaPrenda titulo={cantidad > 1 ? `Se lleva (${cantidad})` : "Nueva prenda"} prenda={nueva} vacia="Elige la talla y el color que se lleva." />
      </div>
      {nueva && (
        <div className="flex items-baseline justify-between gap-4 px-1" aria-live="polite">
          <span className="text-sm text-tinta/75">{textoDiferencia}</span>
          <span className="text-xl font-semibold tabular-nums text-tinta">{soles(Math.abs(diferencia))}</span>
        </div>
      )}
    </div>
  );
}

const ICONO_VALIDACION = {
  ok: { Icono: CheckCircle2, clase: "text-verde-profundo", lector: "Listo" },
  alerta: { Icono: AlertTriangle, clase: "text-ambar-profundo", lector: "Atención" },
  pendiente: { Icono: Circle, clase: "text-tinta/40", lector: "Pendiente" },
} as const;

/** "✓ Compra encontrada · ✓ Dentro del plazo · ○ Falta el motivo…": lo que el sistema
 *  está validando, dicho en voz alta. Ícono Y palabra — nunca solo color. */
export function ListaValidaciones({ validaciones }: { validaciones: readonly Validacion[] }) {
  return (
    <ul className="space-y-3.5" aria-label="Qué está validando el sistema">
      {validaciones.map((v) => {
        const { Icono, clase, lector } = ICONO_VALIDACION[v.estado];
        return (
          <li key={v.clave} className="flex gap-2.5">
            <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${clase}`} aria-hidden />
            <div className="min-w-0">
              <p className={`text-sm ${v.estado === "ok" ? "text-tinta" : "font-semibold text-tinta"}`}>
                <span className="sr-only">{lector}: </span>
                {v.titulo}
              </p>
              {v.detalle && <p className="mt-0.5 text-xs text-tinta/70">{v.detalle}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Impacto en inventario y en caja — de lo que `registrar_cambio` hace de verdad. */
export function ImpactoVista({ impacto }: { impacto: ImpactoCambio }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section aria-label="Impacto en inventario">
        <h3 className="text-xs font-semibold text-tinta/70">Impacto en inventario</h3>
        <ul className="mt-2.5 space-y-2">
          {impacto.inventario.map((i) => (
            <li key={i.signo} className="flex gap-3 text-sm">
              <span className={`w-8 shrink-0 font-mono font-semibold tabular-nums ${i.signo === "+" ? "text-verde-profundo" : "text-tinta"}`}>
                {i.signo}
                {i.cantidad}
              </span>
              <span className="min-w-0">
                <span className="text-tinta">{i.prenda}</span>
                <span className="block text-xs text-tinta/70">{i.donde}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Impacto en caja">
        <h3 className="text-xs font-semibold text-tinta/70">Impacto en caja</h3>
        <p className="mt-2.5 text-sm font-semibold tabular-nums text-tinta">{impacto.caja.titulo}</p>
        <p className="mt-0.5 text-xs text-tinta/70">{impacto.caja.detalle}</p>
      </section>
    </div>
  );
}
