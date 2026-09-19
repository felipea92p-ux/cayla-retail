"use client";

import type { CSSProperties } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Circle, Info } from "lucide-react";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { varianteLegible, type ImpactoOperacion, type Validacion } from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";

// Piezas de solo lectura del flujo de Cambios (2026-09-18) — `ListaValidaciones` e
// `ImpactoVista` también las usa Devoluciones: lo que el sistema le explica a la
// colaboradora antes de que confirme. Sin estado propio — todo llega ya calculado desde
// `cambios-reglas.ts` / `devoluciones-reglas.ts`, así la pantalla no puede decir algo
// distinto de lo que la base va a hacer.

export type PrendaFicha = {
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  precio: number;
};

function FichaPrenda({ titulo, prenda, vacia, hueco = false }: { titulo: string; prenda: PrendaFicha | null; vacia: string; hueco?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[18px] p-[18px] transition-colors duration-500 ${hueco ? "bg-tinta/[0.06]" : "bg-sand/45"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinta/65">{titulo}</p>
      {prenda ? (
        <div className="mt-3 flex items-center gap-3.5">
          <MiniaturaPrenda fotoUrl={prenda.fotoUrl} colorHex={prenda.colorHex} tamano="lg" />
          <div className="min-w-0">
            <p className="font-display truncate text-[21px] leading-tight text-tinta">{prenda.referencia}</p>
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

/** Lo que une las dos prendas: un hilo punteado que corre de una a otra y, al medio, el
 *  botón del cambio girando despacio. En celular, donde las fichas se apilan, es una flecha. */
function HiloDelCambio() {
  return (
    <>
      <ArrowLeftRight className="mx-auto h-5 w-5 rotate-90 text-tinta/60 sm:hidden" role="img" aria-label="se cambia por" />
      <div className="relative mx-auto hidden h-[60px] w-24 sm:block" role="img" aria-label="se cambia por">
        <svg viewBox="0 0 96 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <path d="M0 30 C 30 8, 66 52, 96 30" className="hilo-corre fill-none stroke-taupe stroke-[1.6]" />
        </svg>
        <span className="gira-lento absolute left-1/2 top-1/2 -ml-[17px] -mt-[17px] grid h-[34px] w-[34px] place-items-center rounded-full bg-tinta text-crema">
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </>
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
        <HiloDelCambio />
        <FichaPrenda titulo={cantidad > 1 ? `Se lleva (${cantidad})` : "Nueva prenda"} prenda={nueva} vacia="Elige la talla y el color que se lleva." hueco />
      </div>
      {nueva && (
        <div className="flex items-baseline justify-between gap-4 px-1" aria-live="polite">
          <span className="text-sm text-tinta/75">{textoDiferencia}</span>
          <span className="font-display text-[26px] leading-none tabular-nums text-tinta">{soles(Math.abs(diferencia))}</span>
        </div>
      )}
    </div>
  );
}

const ICONO_VALIDACION = {
  ok: { Icono: CheckCircle2, clase: "text-verde-profundo", lector: "Listo" },
  alerta: { Icono: AlertTriangle, clase: "text-ambar-profundo", lector: "Atención" },
  pendiente: { Icono: Circle, clase: "text-tinta/40", lector: "Pendiente" },
  aviso: { Icono: Info, clase: "text-ambar-profundo", lector: "Aviso" },
} as const;

/** "✓ Compra encontrada · ✓ Dentro del plazo · ○ Falta el motivo…": lo que el sistema
 *  está validando, dicho en voz alta. Ícono Y palabra — nunca solo color. */
export function ListaValidaciones({ validaciones }: { validaciones: readonly Validacion[] }) {
  return (
    <ul className="space-y-4" aria-label="Qué está validando el sistema">
      {validaciones.map((v, i) => {
        // El plazo vencido va en rojo sea alerta (Cambios) o aviso (Devoluciones): mismo
        // triángulo y la misma palabra para el lector, así que no depende solo del color.
        const { Icono, clase, lector } = v.tono === "rojo" ? { ...ICONO_VALIDACION.alerta, clase: "text-rojo-profundo" } : ICONO_VALIDACION[v.estado];
        return (
          <li key={v.clave} className="flex gap-2.5">
            {/* Los checks se trazan uno tras otro al aparecer el panel. */}
            <Icono
              className={`mt-0.5 h-[19px] w-[19px] shrink-0 ${clase} ${v.estado === "ok" && v.tono !== "rojo" ? "check-trazo" : ""}`}
              style={{ "--d": `${800 + i * 130}ms` } as CSSProperties}
              aria-hidden
            />
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

/** Impacto en inventario y en caja — de lo que la base hace de verdad al confirmar (o, en
 *  una devolución, al aprobar). Con `documento`, una tercera línea a lo ancho. */
export function ImpactoVista({ impacto, compacto = false }: { impacto: ImpactoOperacion; compacto?: boolean }) {
  // `compacto`: en la columna angosta del costado las secciones van una bajo la otra.
  return (
    <div className={compacto ? "space-y-5" : "grid gap-6 sm:grid-cols-2"}>
      <section aria-label="Impacto en inventario">
        <h3 className="text-xs font-semibold text-tinta/70">Impacto en inventario</h3>
        <ul className="mt-2.5 space-y-2">
          {impacto.inventario.map((i) => (
            <li key={`${i.signo}|${i.prenda}|${i.donde}`} className="flex gap-3 text-sm">
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
      {impacto.documento && (
        <section aria-label="Documento que se emite" className={compacto ? "" : "sm:col-span-2"}>
          <h3 className="text-xs font-semibold text-tinta/70">Documento</h3>
          <p className="mt-2.5 text-sm font-semibold text-tinta">{impacto.documento.titulo}</p>
          <p className="mt-0.5 text-xs text-tinta/70">{impacto.documento.detalle}</p>
        </section>
      )}
    </div>
  );
}
