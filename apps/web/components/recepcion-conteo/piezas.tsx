import type { CSSProperties } from "react";
import type { Familia } from "@cayla-retail/shared";
import { IconoCategoria } from "@/components/IconoCategoria";
import { Chip } from "@/components/ui/Chip";
import { veredictoDeLaBalanza } from "@/lib/recepcion-conteo-reglas";

// Las piezas que la maqueta A de Recibir (ADR-0393, `docs/maquetas/recibir-fardo-2026-10/a-camino.html`) suma a las del sistema. Sin
// estado: sirven en Server Components. Estilos en `app/estilos/recepcion-conteo.css` (solo tokens).

/** La caja del fardo, cerrada con su cinta: dice «esto es lo que llegó» antes de leer. */
export function CajaFardo() {
  return (
    <svg className="rc-caja" viewBox="0 0 200 170" aria-hidden>
      <path className="rc-cuerpo" d="M40 70 100 92 160 70 160 140 100 162 40 140z" />
      <path className="rc-cara" d="M100 92v70l60-22V70z" />
      <path className="rc-cinta" d="M100 92v70" />
      <path className="rc-tapa" d="M40 70 100 92 160 70 100 48z" />
    </svg>
  );
}

/** El ícono de una categoría en su baldosa (el de su prefijo; si no tiene dibujo propio, el de su familia). */
export function BaldosaCategoria({
  categoria,
  tamano = "normal",
}: {
  categoria: { prefijo: string | null; familia: string | null } | null;
  tamano?: "normal" | "chico";
}) {
  return (
    <span className="rc-cat-ic" data-tamano={tamano === "chico" ? "chico" : undefined} aria-hidden>
      <IconoCategoria prefijo={categoria?.prefijo ?? null} familia={(categoria?.familia as Familia | null) ?? null} className={tamano === "chico" ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]"} />
    </span>
  );
}

/** «Dijeron 120 · la balanza · Contaste 121» con su veredicto. El brazo se inclina hacia donde hay más (una vez, al cambiar). */
export function Balanza({ dijeron, contadas, guia }: { dijeron: number | null; contadas: number; guia?: string }) {
  const v = veredictoDeLaBalanza(dijeron, contadas);
  return (
    <div className="rc-balanza" data-estado={v.estado} data-guia={guia}>
      <div className="rc-lado">
        <span className="label-cayla text-[11px] text-taupe">Dijeron</span>
        <b className="text-tinta">{dijeron == null ? "—" : dijeron.toLocaleString("es-PE")}</b>
      </div>
      <svg viewBox="0 0 120 70" aria-hidden>
        <path d="M60 14v46M40 60h40" />
        <g className="rc-brazo" style={{ "--ang": `${v.angulo}deg` } as CSSProperties}>
          <path d="M14 22h92" />
          <circle cx="60" cy="22" r="3.5" />
          <path d="M8 36h12l-6-14zM100 36h12l-6-14z" />
        </g>
      </svg>
      <div className="rc-lado">
        <span className="label-cayla text-[11px] text-taupe">Contaste</span>
        <b className="text-tinta" aria-live="polite">
          {contadas.toLocaleString("es-PE")}
        </b>
      </div>
      <p className="rc-veredicto">
        <Chip tono={v.estado}>{v.texto}</Chip>
      </p>
    </div>
  );
}

/** El sello del envío cerrado: el aro y el visto se dibujan una vez. */
export function Sello() {
  return (
    <span className="rc-sello" aria-hidden>
      <svg viewBox="0 0 88 88">
        <circle className="rc-aro" cx="44" cy="44" r="42" />
        <path className="rc-visto" d="M27 45l11 11 23-25" />
      </svg>
    </span>
  );
}
