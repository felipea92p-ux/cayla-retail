import type { CSSProperties } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/flujo-caja-reglas";
import type { Respuesta } from "@/lib/tres-respuestas-reglas";

// Las tres respuestas de arriba del Resumen (Felipe 2026-10-26): ¿cuánto tienes?, ¿cuánto debes pagar pronto?, ¿cuánto te deja este mes?
// Solo DIBUJA lo que arma `tresRespuestas`; cada una es la `TarjetaCifra` del sistema (ADR-0358), con su cifra contando una vez al llegar
// (ADR-0136) y su contexto en una línea. Una que lleva a otra pantalla (la caja, lo que debes) lleva su flecha; sin dato dice por qué.
// Dos de ellas traen su detalle pegado a la cifra (Felipe 2026-10-29): «¿Cuánto tienes?» dice cuánto es de CAYLA y cuánto de CLAURE, y «¿Cuánto debes
// pronto?» lista cada deuda con su monto y cuándo vence, para que se vea QUÉ hay que pagar y no solo cuánto.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

/** Cuánto es de CAYLA y cuánto de CLAURE: una barra y dos renglones. La barra solo si las dos partes son plata (con una negativa no hay nada que repartir). */
function Reparto({ partes }: { partes: NonNullable<Respuesta["reparto"]> }) {
  const clase = { cayla: "bg-tinta", claure: "bg-taupe" } as const;
  const dibuja = partes.every((p) => p.monto >= 0);
  return (
    <div className="mt-3">
      {dibuja && (
        <BarraApilada
          alto={8}
          decorativa
          unidad="soles"
          formato={soles}
          etiqueta={`De lo que tienes, ${partes.map((p) => `${p.nombre.toLowerCase()}: ${soles(p.monto)}`).join("; ")}`}
          segmentos={partes.map((p) => ({ clave: p.clave, nombre: p.nombre, valor: p.monto, clase: clase[p.clave] }))}
        />
      )}
      <ul className="m-0 mt-2 list-none p-0">
        {partes.map((p) => (
          <li key={p.clave} className="flex items-center justify-between gap-3 py-0.5 text-sm text-tinta">
            <span className="inline-flex items-center gap-2">
              <MuestraTramo clase={clase[p.clave]} /> {p.nombre}
            </span>
            <b className={`num font-semibold ${p.monto < 0 ? "text-rojo" : ""}`}>{soles(p.monto)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Las deudas que vencen pronto, cada una en su línea: quién y cuánto a la izquierda, cuándo vence a la derecha (en rojo si ya venció). */
function Deudas({ filas, mas }: { filas: NonNullable<Respuesta["filas"]>; mas: number }) {
  return (
    <ul className="m-0 mt-3 list-none p-0">
      {filas.map((f) => (
        <li key={`${f.texto}|${f.cuando}|${f.monto}`} className="flex items-baseline justify-between gap-3 border-t border-sand py-1.5 text-sm text-tinta first:border-t-0">
          <span className="min-w-0">
            {f.texto} · <span className="num">{soles(f.monto)}</span>
          </span>
          <span className={`shrink-0 text-xs font-semibold ${f.tono === "rojo" ? "text-rojo-profundo" : "text-ambar-profundo"}`}>{f.cuando}</span>
        </li>
      ))}
      {mas > 0 && <li className="border-t border-sand pt-1.5 text-xs text-taupe">y {mas === 1 ? "1 más" : `${mas} más`}</li>}
    </ul>
  );
}

export function TresRespuestas({ respuestas, guia = "fin-resumen.respuestas" }: { respuestas: readonly Respuesta[]; guia?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-3" data-guia={guia}>
      {respuestas.map((x, i) => {
        const contexto = (
          <>
            {x.valor === null ? x.motivo : x.detalle ?? x.motivo}
            {x.valor !== null && x.chips.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {x.chips.map((c) => (
                  <Chip key={c.texto} tono={c.tono} versalitas={false}>
                    {c.texto}
                  </Chip>
                ))}
              </span>
            )}
            {x.valor !== null && x.reparto && <Reparto partes={x.reparto} />}
            {x.valor !== null && x.filas && <Deudas filas={x.filas} mas={x.masFilas ?? 0} />}
          </>
        );
        const comunes = { etiqueta: x.pregunta, ...entra(i + 1), ...(x.href ? { href: x.href } : {}) };
        return x.valor === null ? (
          <TarjetaCifra key={x.clave} {...comunes} valor={null} noSePudoLeer={x.noSePudoLeer}>
            {contexto}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra key={x.clave} {...comunes} valor={<CifraAnimada valor={Math.round(x.valor)} formato="soles-redondo" />}>
            {contexto}
          </TarjetaCifra>
        );
      })}
    </div>
  );
}
