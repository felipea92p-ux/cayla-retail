"use client";

import { Check, Clock3, X } from "lucide-react";
import type { ReactNode } from "react";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { TEXTO_DE_VISIBILIDAD, VISIBILIDADES, type VisibilidadFinanzas } from "@/lib/plan-compra-inversion";

// «Mostrar esta campaña» (ADR-0527, spike ⑤): decide si Finanzas ve la compra de la campaña. Tres estados, firmados (quién y cuándo). Elegir uno se guarda al instante: no borra nada y la campaña
// sigue en el Plan y en Compras. HOY solo el Resumen de Finanzas lee la compra; las frases no prometen más que eso (los textos son de `TEXTO_DE_VISIBILIDAD`).

export function SelectorDeVisibilidad({
  valor,
  onCambio,
  cambiando,
  por,
  en,
}: {
  valor: VisibilidadFinanzas;
  onCambio: (v: VisibilidadFinanzas) => void;
  cambiando: boolean;
  /** Quién lo decidió y cuándo; null mientras nadie lo ha cambiado (por defecto, todo se ve). */
  por: string | null;
  en: string | null;
}) {
  return (
    <div className="space-y-3" data-guia="pagos.visibilidad">
      <p className="label-cayla text-[11px] font-bold text-taupe">Mostrar esta campaña</p>
      {/* Tres opciones que se leen enteras (cada una con lo que pasa si la eliges), una bajo otra: en una columna angosta tres botones en fila no caben. Elegir una GUARDA al instante, así que no es un
          radiogroup con flechas (cada flecha guardaría): son botones que se aprietan, con la elegida marcada. */}
      <div role="group" aria-label="Qué ve Finanzas de esta campaña" className="grid gap-2">
        {VISIBILIDADES.map((v) => (
          <button key={v} type="button" aria-pressed={v === valor} disabled={cambiando} onClick={() => onCambio(v)} className="pp-opcion">
            <span aria-hidden className="pp-opcion__punto" />
            <span className="min-w-0">
              <b className="block text-sm font-semibold text-tinta">{TEXTO_DE_VISIBILIDAD[v].corto}</b>
              <span className="block text-[12.5px] leading-snug text-taupe">{TEXTO_DE_VISIBILIDAD[v].nota}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-taupe" aria-live="polite">
        {por && en ? `Lo decidió ${por} el ${diaYHoraLima(en).dia}.` : "Por defecto, una campaña con compra se ve. Nadie lo ha cambiado."} Ocultarla no borra nada: sigue en el Plan y en Compras.
      </p>
    </div>
  );
}

type Marca = "si" | "no" | "pronto";
type Renglon = { marca: Marca; titulo: string; detalle: ReactNode };

function Icono({ marca }: { marca: Marca }) {
  if (marca === "si") return <Check aria-label="Sí" className="h-4 w-4 text-verde-profundo" />;
  if (marca === "pronto") return <Clock3 aria-label="Todavía no" className="h-4 w-4 text-taupe" />;
  return <X aria-label="No" className="h-4 w-4 text-taupe" />;
}

/** Qué pasa en Finanzas con esta campaña según el estado: lo que ya la lee, lo que no es el caso (no es un gasto) y lo que todavía no la lee. */
function renglonesDeFinanzas(v: VisibilidadFinanzas): Renglon[] {
  const seVe: Marca = v === "todo" ? "si" : "no";
  return [
    {
      marca: seVe,
      titulo: "Resumen de Finanzas",
      detalle: "Aparece como «Inversión en mercadería» (plata comprometida), nunca dentro de «Te deja». Cuando registras la orden o la factura, lo real reemplaza a lo planeado: no se cuenta dos veces.",
    },
    { marca: seVe, titulo: "Tu caja de las próximas semanas", detalle: "Lo que falta pedir se resta de tu caja el día en que lo pagas, para que veas si baja de tu mínimo." },
    { marca: "pronto", titulo: "Flujo de caja y Escenarios (Reportes)", detalle: "Todavía no la leen: se conectarán. Hoy solo el Resumen cuenta esta compra." },
    { marca: "no", titulo: "Gastos", detalle: "No es un gasto: es mercadería. No suma a lo que gastas." },
    { marca: "no", titulo: "Estado de resultados", detalle: "El costo entra cuando se vende (costo de ventas), no cuando se compra." },
  ];
}

export function QuePasaEnFinanzas({ visibilidad }: { visibilidad: VisibilidadFinanzas }) {
  return (
    <ul className="pp-donde" data-guia="pagos.finanzas">
      {renglonesDeFinanzas(visibilidad).map((r) => (
        <li key={r.titulo}>
          <span className="pp-donde__marca">
            <Icono marca={r.marca} />
          </span>
          <div>
            <b className="block text-sm font-semibold text-tinta">{r.titulo}</b>
            <span className="block text-[12.5px] text-taupe">{r.detalle}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
