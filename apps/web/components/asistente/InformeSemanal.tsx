"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { faltaElInforme, NOMBRE_MEJORA, type InformeLeido, type MejoraLeida, type TipoMejora } from "@/lib/asistente/informe";

// Gestión ▸ Preguntas del equipo ▸ lo que conviene mejorar (ADR-0536, actividad 10): las 5 mejoras del último informe del lunes, cada una
// con cuántas preguntas la sostienen, de qué sedes, y las preguntas mismas al desplegarla. Si el trabajo del lunes no armó el de la semana
// pasada, el líder lo arma con el botón (una vez: la base no deja dos informes de la misma semana).

const TONO: Record<TipoMejora, TonoChip> = {
  funcion_nueva: "ambar",
  mover_a_la_vista: "pizarra",
  escribir_regla: "pizarra",
  dar_acceso: "neutro",
  capacitar: "neutro",
};

const DIA = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
/** «del 19 al 25 oct», de un lunes `YYYY-MM-DD`. */
function rangoDeSemana(lunes: string): string {
  const inicio = new Date(`${lunes}T00:00:00Z`);
  const fin = new Date(inicio.getTime() + 6 * 864e5);
  const corto = (d: Date) => DIA.format(d).replace(".", "");
  return inicio.getUTCMonth() === fin.getUTCMonth() ? `del ${inicio.getUTCDate()} al ${corto(fin)}` : `del ${corto(inicio)} al ${corto(fin)}`;
}

function Mejora({ m, n }: { m: MejoraLeida; n: number }) {
  const [abierta, setAbierta] = useState(false);
  const cuantas = m.preguntas.length;
  const noSirvio = m.preguntas.filter((p) => p.sirvio === false).length;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sand text-xs tabular-nums text-tinta" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={TONO[m.tipo]}>{NOMBRE_MEJORA[m.tipo]}</Chip>
            <span className="text-xs text-taupe">
              {cuantas === 1 ? "1 pregunta" : `${cuantas} preguntas`}
              {noSirvio > 0 ? ` · a ${noSirvio} no le sirvió` : ""}
              {m.sedes.length > 0 ? ` · ${m.sedes.join(", ")}` : ""}
            </span>
          </div>
          <p className="font-medium text-tinta">{m.titulo}</p>
          {m.detalle ? <p className="max-w-prose text-sm text-tinta/80">{m.detalle}</p> : null}
          <BotonVerMas abierto={abierta} onCambiar={setAbierta} texto={cuantas === 1 ? "Ver la pregunta" : `Ver las ${cuantas} preguntas`} forma="enlace" />
          <FilasDeMas abierto={abierta}>
            <ul className="mt-1 space-y-2 border-l-2 border-sand pl-3">
              {m.preguntas.map((p) => (
                <li key={p.id} className="text-sm">
                  <span className="block break-words">«{p.pregunta}»</span>
                  <span className="block text-xs text-taupe">
                    {[p.persona ?? "Una terminal", p.sede, p.sirvio === false ? "no le sirvió" : null].filter(Boolean).join(" · ")}
                    {p.comentario ? ` · buscaba: «${p.comentario}»` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </FilasDeMas>
        </div>
      </div>
    </li>
  );
}

export function InformeSemanal({ informes }: { informes: InformeLeido[] }) {
  const router = useRouter();
  const [armando, setArmando] = useState(false);
  const ultimo = informes[0] ?? null;
  const falta = faltaElInforme(informes);

  async function armar() {
    setArmando(true);
    try {
      // `x-espera: no`: la IA tarda unos segundos y la pantalla se puede seguir mirando; el botón dice «Armando…» (ADR-0149).
      const r = await fetch("/api/asistente/informe", { method: "POST", headers: { "x-espera": "no" } });
      const j = (await r.json().catch(() => ({}))) as { estado?: string; error?: string };
      if (!r.ok) avisar.error(j.error ?? "No se pudo armar el informe. Vuelve a intentarlo en un rato.");
      else if (j.estado === "tope") avisar.error("Ya se gastó el tope de IA del mes: el informe se arma el día 1.");
      else if (j.estado === "sin_clave") avisar.error("Falta la clave de la IA en el servidor: el informe no se puede armar.");
      else {
        avisar.exito(j.estado === "sin_preguntas" ? "Listo: la semana pasada nadie preguntó." : "Listo: ya está el informe de la semana pasada.");
        router.refresh();
      }
    } catch {
      avisar.error("No hubo respuesta. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setArmando(false);
    }
  }

  return (
    <section className="card-cayla space-y-4 p-5" data-guia="preguntas.informe">
      <TituloSeccion
        cuenta={ultimo && ultimo.mejoras.length > 0 ? ultimo.mejoras.length : undefined}
        accion={
          falta ? (
            <Boton peso="fantasma" onClick={armar} cargando={armando} textoCargando="Armando…" data-guia="preguntas.armar">
              Armar el de la semana pasada
            </Boton>
          ) : undefined
        }
      >
        Lo que conviene mejorar
      </TituloSeccion>
      {ultimo ? (
        <>
          <p className="text-[13px] text-taupe">
            Semana {rangoDeSemana(ultimo.semana)} · {ultimo.total === 1 ? "1 pregunta" : `${ultimo.total} preguntas`} ·{" "}
            {ultimo.automatico ? "armado el lunes" : "armado con el botón"}. Las mejoras las redacta la IA; cada una cita las preguntas que la sostienen.
          </p>
          {ultimo.mejoras.length > 0 ? (
            <ol className="divide-y divide-sand">
              {ultimo.mejoras.map((m, i) => (
                <Mejora key={`${ultimo.id}-${i}`} m={m} n={i + 1} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-taupe">{ultimo.total === 0 ? "Esa semana nadie preguntó." : "Esa semana no salió nada que valga la pena cambiar."}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-taupe">
          Cada lunes a las 7:00, las preguntas de la semana anterior se vuelven hasta 5 mejoras, con las preguntas que las sostienen. Todavía no hay
          ninguno.
        </p>
      )}
    </section>
  );
}
