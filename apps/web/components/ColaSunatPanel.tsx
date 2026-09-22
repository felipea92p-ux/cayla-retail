"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { FilaColaReintento } from "@/lib/comprobantes";
import { HORAS_AVISO_COLA } from "@/lib/facturacion-reglas";
import { duracionCorta } from "@/lib/facturacion-resumen-reglas";
import { nombreDelTipo } from "@/lib/facturacion-comprobantes-reglas";
import { coincide } from "@/lib/facturacion-busqueda";
import { diasParaElPlazo, errorDeColaLegible, queHacerConElError } from "@/lib/transmision-reglas";
import { avisar } from "@/components/ui/Avisos";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { useTransmitir } from "@/lib/useTransmitir";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";

// «Por reintentar» (D-60): lo que Lucode/SUNAT no aceptó al cobrar y espera en la cola. Se reintenta
// solo (cada cobro y cada apertura de Comprobantes barren la cola, `/api/lucode/reintentar`); acá se ve
// cuántas veces se intentó, el último error y hace cuánto espera. «Reintentar ahora» adelanta el barrido
// para uno. Lo que pasa de una hora se pinta en rojo: el reintento solo no alcanzó y alguien tiene que
// mirar (Lucode caído mucho rato, credenciales vencidas).
// Además del error: qué hacer con él (`queHacerConElError`) y cuánto le queda del plazo de SUNAT
// (`diasParaElPlazo`, 3 días calendario desde la emisión): uno que se sale del plazo ya no se puede
// declarar, así que el plazo manda sobre la hora en cola.
function chipDelPlazo(dias: number): { tono: "rojo" | "ambar" | "neutro"; texto: string } {
  if (dias < 0) return { tono: "rojo", texto: "Fuera del plazo de SUNAT" };
  if (dias === 0) return { tono: "rojo", texto: "Plazo SUNAT: vence hoy" };
  return { tono: dias === 1 ? "ambar" : "neutro", texto: `Plazo SUNAT: ${dias} ${dias === 1 ? "día" : "días"}` };
}

export function ColaSunatPanel({
  filas,
  tiendas,
  emitidos,
  ahora,
}: {
  filas: FilaColaReintento[];
  tiendas: { id: string; nombre: string }[];
  /** Cuándo se emitió cada uno (por id); sin fecha, la fila no dice el plazo. */
  emitidos: Record<string, string>;
  ahora: Date;
}) {
  const router = useRouter();
  const { transmitiendoId, transmitir } = useTransmitir();
  const [reintentandoTodos, setReintentandoTodos] = useState(false);

  // «Reintentar todos»: uno por uno (Lucode recibe de a uno y un rechazo no frena a los demás), con un
  // solo aviso al final en vez de uno por fila. Mismo endpoint que «Reintentar ahora».
  async function reintentarTodos() {
    setReintentandoTodos(true);
    let llegaron = 0;
    for (const f of filas) {
      try {
        const r = await fetch("/api/lucode/emitir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comprobante_id: f.comprobante_id }),
        });
        if (r.ok) llegaron += 1;
      } catch {
        // Sin red: sigue en la cola y lo cuenta el aviso de abajo.
      }
    }
    setReintentandoTodos(false);
    const quedan = filas.length - llegaron;
    if (quedan === 0) avisar.exito(llegaron === 1 ? "El comprobante llegó a SUNAT" : `Los ${llegaron} comprobantes llegaron a SUNAT`);
    else avisar.aviso(`${llegaron} de ${filas.length} llegaron a SUNAT`, { detalle: `${quedan === 1 ? "Sigue 1" : `Siguen ${quedan}`} en la cola: mira su error.` });
    router.refresh();
  }
  const { texto: busqueda } = useFacturacionBusqueda();
  const nombreDe = (id: string) => tiendas.find((t) => t.id === id)?.nombre ?? "—";
  const numero = (f: FilaColaReintento) => `${f.serie}-${String(f.numero).padStart(8, "0")}`;
  const visibles = filas.filter((f) => coincide([numero(f), nombreDelTipo(f.tipo), nombreDe(f.ubicacion_id), errorDeColaLegible(f.ultimo_error_transmision)], busqueda));

  return (
    <div className="card-cayla anim-sube overflow-hidden" style={{ "--i": 3 } as CSSProperties}>
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-[18px] pb-3.5">
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight text-tinta">Por reintentar</h2>
          <p className="mt-0.5 text-xs text-tinta/65">
            SUNAT no los recibió al cobrar. No pierden su número y se reintentan solos; si uno pasa de {HORAS_AVISO_COLA} hora, mira el error.
          </p>
        </div>
        {filas.length > 1 && (
          <BotonCompacto variante="primario" cargando={reintentandoTodos} disabled={transmitiendoId !== null} onClick={reintentarTodos}>
            {reintentandoTodos ? "Reintentando…" : `Reintentar los ${filas.length}`}
          </BotonCompacto>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Nada en espera: todo llegó a SUNAT.</p>
      ) : visibles.length === 0 ? (
        <SinCoincidencias />
      ) : (
        visibles.map((f) => {
          const horas = f.horas_esperando ?? 0;
          const atrasado = horas >= HORAS_AVISO_COLA;
          const espera = duracionCorta(Math.round(horas * 3600)) ?? "instantes";
          const enVuelo = transmitiendoId === f.comprobante_id;
          const queHacer = queHacerConElError(f.ultimo_error_transmision);
          const plazo = emitidos[f.comprobante_id] ? chipDelPlazo(diasParaElPlazo(emitidos[f.comprobante_id], ahora)) : null;
          return (
            <div key={f.comprobante_id} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-tinta/10 px-5 py-3">
              <div className="min-w-[11rem]">
                <p className="text-[15px] text-tinta">
                  <span className="text-tinta/65">{nombreDelTipo(f.tipo)}</span> <b className="whitespace-nowrap font-semibold tabular-nums">{numero(f)}</b>
                </p>
                <p className="text-[13px] text-tinta/65">{nombreDe(f.ubicacion_id)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  <Chip tono={atrasado ? "rojo" : "ambar"}>
                    {atrasado ? `Hace ${espera} sin llegar` : `En cola hace ${espera}`}
                  </Chip>
                  {plazo && <Chip tono={plazo.tono}>{plazo.texto}</Chip>}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-tinta/70">
                  {f.intentos_transmision} {f.intentos_transmision === 1 ? "intento" : "intentos"}
                  {f.ultimo_error_transmision ? ` · ${errorDeColaLegible(f.ultimo_error_transmision)}` : ""}
                </p>
                {queHacer && <p className="mt-0.5 text-[13px] leading-snug text-tinta">Qué hacer: {queHacer}</p>}
              </div>
              <BotonCompacto variante="fila-alerta" cargando={enVuelo} disabled={reintentandoTodos} aria-label={`Reintentar ahora ${numero(f)}`} onClick={() => transmitir(f.comprobante_id)}>
                {enVuelo ? "Enviando…" : "Reintentar ahora"}
              </BotonCompacto>
            </div>
          );
        })
      )}
    </div>
  );
}
