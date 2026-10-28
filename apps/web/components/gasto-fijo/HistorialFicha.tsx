"use client";

import { useEffect, useState } from "react";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { TEXTO_FORMA_DE_PAGO, type FormaDePago } from "@/lib/gasto-fijo-ficha-reglas";
import { createClient } from "@/lib/supabase/client";
import { cambioBancarioLegible } from "@/lib/proveedores-reglas";

// «Cambios de a quién y cómo se paga» de un gasto fijo (ADR-0452): quién y cuándo. Solo para líder y admin (la base devuelve cero
// filas a los demás y entonces no se dibuja nada). El historial lo escribe la base en la misma transacción que el cambio.

type Cambio = { campo: string; antes: string | null; despues: string | null; por: string | null; en: string };

const DATO: Record<string, string> = { beneficiario: "A quién se le paga", documento: "Documento", forma_de_pago: "Forma de pago" };

function leer(c: Cambio): { dato: string; antes: string; despues: string } {
  if (c.campo in DATO) {
    const forma = (v: string | null) => (v ? (TEXTO_FORMA_DE_PAGO[v as FormaDePago] ?? v) : "vacío");
    const mostrar = c.campo === "forma_de_pago" ? forma : (v: string | null) => (v && v.trim() ? v : "vacío");
    return { dato: DATO[c.campo], antes: mostrar(c.antes), despues: mostrar(c.despues) };
  }
  const l = cambioBancarioLegible(c.campo, c.antes, c.despues);
  return { dato: l.dato, antes: l.antes, despues: l.despues };
}

export function HistorialFicha({ gastoFijoId }: { gastoFijoId: string }) {
  const [cambios, setCambios] = useState<Cambio[]>([]);

  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_gasto_fijo_ficha_cambios" as never, { p_gasto_fijo_id: gastoFijoId } as never)
      .then(({ data, error }) => {
        if (!vigente || error) return;
        setCambios(
          ((data ?? []) as Record<string, unknown>[]).slice(0, 6).map((f) => ({
            campo: String(f.campo),
            antes: (f.antes as string | null) ?? null,
            despues: (f.despues as string | null) ?? null,
            por: (f.cambiado_por_nombre as string | null) ?? null,
            en: String(f.cambiado_en),
          })),
        );
      });
    return () => {
      vigente = false;
    };
  }, [gastoFijoId]);

  if (cambios.length === 0) return null;
  return (
    <div className="mt-5">
      <TituloGrupo>Últimos cambios</TituloGrupo>
      <p className="nota-cayla mt-2">Antes de pagar a una cuenta que cambió, confírmala por teléfono con quien cobra.</p>
      <ul className="mt-2 divide-y divide-sand">
        {cambios.map((c, i) => {
          const l = leer(c);
          const { dia, hora } = diaYHoraLima(c.en);
          return (
            <li key={`${c.en}-${c.campo}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <span className="min-w-0">
                <b className="font-medium text-tinta">{l.dato}</b>
                <span className="tabular-nums text-tinta/65">: {l.antes}</span>
                <span className="text-tinta/65"> → </span>
                <span className="tabular-nums text-tinta">{l.despues}</span>
              </span>
              <span className="text-xs text-tinta/65">
                {dia} · {hora} · {c.por ?? "no se sabe quién"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
