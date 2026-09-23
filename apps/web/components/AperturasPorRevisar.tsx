"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import type { AperturaPorRevisar } from "@/lib/caja";

function money(n: number) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cuando(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/**
 * El aviso al líder de ADR-0186: aperturas que no coincidieron con lo que dejó el cierre anterior, con el motivo que
 * escribió quien abrió. «Marcar como revisada» la saca de aquí y de la cola de Inicio (`revisar_apertura_caja`,
 * solo líder). No corrige ningún monto: el efectivo se corrige con un movimiento de caja, como siempre.
 */
export function AperturasPorRevisar({ aperturas }: { aperturas: AperturaPorRevisar[] }) {
  const router = useRouter();
  const [revisando, setRevisando] = useState<string | null>(null);

  async function revisar(cajaId: string) {
    setRevisando(cajaId);
    const { error } = await createClient().rpc("revisar_apertura_caja", { p_caja_id: cajaId });
    setRevisando(null);
    if (error) {
      avisar.error(traducirError(error, "marcar la apertura como revisada"));
      return;
    }
    avisar.exito("Apertura revisada");
    router.refresh();
  }

  return (
    <section className="card-cayla space-y-3 p-5" aria-labelledby="aperturas-por-revisar">
      <div>
        <h2 id="aperturas-por-revisar" className="font-display text-xl text-tinta">
          Aperturas con diferencia por revisar
        </h2>
        <p className="text-sm text-tinta/65">Abrieron con un monto distinto del que dejó el cierre anterior de su sede.</p>
      </div>
      <ul className="divide-y divide-tinta/[0.07]">
        {aperturas.map((a) => {
          const dif = a.montoApertura - a.esperado;
          return (
            <li key={a.cajaId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-sm">
                <p className="text-tinta">
                  <b>{a.ubicacionNombre}</b> · {cuando(a.abiertaEn)}
                  {a.abiertaPorNombre && ` · abrió ${a.abiertaPorNombre}`}
                </p>
                <p className="text-tinta/65">
                  Debía haber {money(a.esperado)}, abrió con {money(a.montoApertura)}{" "}
                  <span className={dif < 0 ? "font-semibold text-rojo-profundo" : "font-semibold text-ambar-profundo"}>
                    ({dif < 0 ? "faltaron" : "sobraron"} {money(Math.abs(dif))})
                  </span>
                </p>
                <p className="text-xs italic text-tinta/60">«{a.motivo}»</p>
              </div>
              <button
                type="button"
                onClick={() => revisar(a.cajaId)}
                disabled={revisando !== null}
                className="label-cayla shrink-0 rounded-md border border-tinta/25 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-50"
              >
                {revisando === a.cajaId ? "Guardando…" : "Marcar como revisada"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
