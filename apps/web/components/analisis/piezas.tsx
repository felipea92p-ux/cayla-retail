// Análisis v4 (ADR-0356): las piezas chicas que comparten las cuatro pestañas y la ficha, con las clases de la maqueta
// aprobada (`app/estilos/analisis.css`). Todo vive dentro de `.analisis` (la pantalla o la hoja), que es donde esas clases valen.

import Image from "next/image";
import type { ReactNode } from "react";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { Icono, type NombreIcono } from "@/components/analisis/iconos";
import type { PrendaAnalisis } from "@/lib/analisis-tipos";
import { esTallaUnica } from "@/lib/analisis-reglas";

/** Los cinco estados que usa Análisis (la maqueta): urgente, atención, va bien, para saber, todavía no. */
export type Estado = "urg" | "ate" | "bien" | "info" | "nd";

export const ICONO_ESTADO: Record<Estado, NombreIcono> = { urg: "urg", ate: "ate", bien: "check", info: "info", nd: "nd" };
export const TEXTO_ESTADO: Record<Estado, string> = { urg: "Urgente", ate: "Atención", bien: "Va bien", info: "Para saber", nd: "Todavía no" };
/** El color de cada estado como valor CSS (para `--c`). */
export const COLOR_ESTADO: Record<Estado, string> = {
  urg: "var(--color-rojo-profundo)",
  ate: "var(--color-ambar)",
  bien: "var(--color-verde)",
  info: "var(--color-pizarra)",
  nd: "var(--color-taupe)",
};

/** La insignia con ícono de la maqueta (`.chip.urg` …). Con `onClick` es un botón. */
export function ChipEstado({ est, children, onClick, tip }: { est: Estado; children?: ReactNode; onClick?: () => void; tip?: string }) {
  const contenido = (
    <>
      <Icono nombre={ICONO_ESTADO[est]} />
      {children ?? TEXTO_ESTADO[est]}
    </>
  );
  return onClick ? (
    <button type="button" className={`chip ${est}`} onClick={onClick} data-tip={tip}>
      {contenido}
    </button>
  ) : (
    <span className={`chip ${est}`} data-tip={tip}>
      {contenido}
    </span>
  );
}

/** El «?» que explica a un toque (nunca solo con el mouse encima: también al tocarlo y con el teclado). */
export function Ayuda({ texto }: { texto: string }) {
  return (
    <button type="button" className="ayuda" data-tip={texto} aria-label={texto}>
      ?
    </button>
  );
}

/**
 * El contenido rico de un tooltip (una lista de prendas, «Por llegar: 13»…): va DENTRO del elemento que lo muestra y oculto;
 * el tooltip de la pantalla lo copia al pasar el mouse, tocarlo o enfocarlo.
 */
export function TipRico({ children }: { children: ReactNode }) {
  return (
    <span className="tip-rico" hidden>
      {children}
    </span>
  );
}

/** La prenda en miniatura: su foto o, sin foto, el ícono de su categoría sobre su color (ADR-0333). */
export function TilePrenda({ prenda, tamano }: { prenda: Pick<PrendaAnalisis, "fotoUrl" | "colorHex" | "categoria" | "categoriaPrefijo" | "categoriaFamilia">; tamano: number }) {
  const radio = Math.round(tamano / 5);
  if (prenda.fotoUrl) {
    return (
      <Image
        src={prenda.fotoUrl}
        alt=""
        width={tamano}
        height={tamano}
        unoptimized
        className="tile-foto shrink-0 object-cover"
        style={{ width: tamano, height: tamano, borderRadius: radio }}
      />
    );
  }
  return (
    <span className="tile-prenda shrink-0" style={{ width: tamano, height: tamano, borderRadius: radio }}>
      <MosaicoPrenda
        forma="relleno"
        colorHex={prenda.colorHex}
        prefijo={prenda.categoriaPrefijo}
        familia={(prenda.categoriaFamilia ?? undefined) as Parameters<typeof MosaicoPrenda>[0]["familia"]}
        categoria={prenda.categoria}
        className="h-full w-full !rounded-[inherit]"
      />
    </span>
  );
}

/** «Camisa Oxford · S» (la talla única no se nombra). */
export function NombreCorto({ prenda }: { prenda: Pick<PrendaAnalisis, "nombre" | "talla"> }) {
  return (
    <>
      {prenda.nombre}
      {!esTallaUnica(prenda.talla) && <span className="tl"> · {prenda.talla}</span>}
    </>
  );
}

/** «Camisa Oxford · Celeste · S», para un tooltip o una etiqueta accesible. */
export const nombreLargo = (p: Pick<PrendaAnalisis, "nombre" | "color" | "talla">): string => [p.nombre, p.color, p.talla].filter(Boolean).join(" · ");

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * El anillo de la maqueta: el arco de lo que se cumple (0 a 100), con la meta como un punto verde sobre la vuelta. El arco se
 * dibuja una vez al entrar (`.anim .arco`).
 */
export function Anillo({
  p,
  meta = 0,
  color,
  centro,
  et,
  sub,
  children,
}: {
  p: number;
  meta?: number;
  color: string;
  centro: ReactNode;
  et: ReactNode;
  sub: ReactNode;
  /** El botón bajo el anillo («Registrar 130»). */
  children?: ReactNode;
}) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const f = clamp(p / 100, 0, 1);
  const mx = 48 + R * Math.sin((meta / 100) * 2 * Math.PI);
  const my = 48 - R * Math.cos((meta / 100) * 2 * Math.PI);
  return (
    <div className="anillo">
      <svg viewBox="0 0 96 96" aria-hidden>
        <circle cx="48" cy="48" r={R} fill="none" stroke="var(--color-hueso)" strokeWidth="9" />
        {f > 0 && (
          <circle
            className="arco"
            cx="48"
            cy="48"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${(C * f).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 48 48)"
            style={{ ["--total" as string]: (C * f).toFixed(1) }}
          />
        )}
        {meta > 0 && <circle cx={mx.toFixed(1)} cy={my.toFixed(1)} r="5" fill="var(--color-papel)" stroke="var(--color-verde)" strokeWidth="2.5" />}
        <text x="48" y="55" textAnchor="middle" fontFamily="var(--font-serif)" fontSize="22" fill="var(--color-tinta)">
          {centro}
        </text>
      </svg>
      <span className="et">{et}</span>
      <span className="sub">{sub}</span>
      {children}
    </div>
  );
}

/** Los 14 días seguidos: un cuadrito por día, verde los cumplidos. */
export function Racha({ n, de = 14 }: { n: number; de?: number }) {
  return (
    <div className="racha" aria-label={`${Math.min(n, de)} de ${de} días`}>
      {Array.from({ length: de }, (_, k) => (
        <i key={k} className={k < n ? "ok" : ""} />
      ))}
    </div>
  );
}

/** La cifra que cuenta de 0 a su valor al entrar (`data-cuenta`, la anima la pantalla; con movimiento reducido queda quieta). */
export function Cuenta({ valor }: { valor: number }) {
  return <em data-cuenta={valor}>{valor}</em>;
}

/** «32 %» → 32 (de 0 a 100, sin decimales); 0 si no hay base. */
export const pct = (parte: number, total: number): number => (total > 0 ? Math.round((parte / total) * 100) : 0);

/** Soles sin decimales, como se lee en tienda: «S/ 1,250». */
export const soles = (n: number): string => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
