import type { CSSProperties, ReactNode } from "react";

/* ====================================================================
   El anillo — una sola pieza (ADR-0358, ronda 13, Felipe eligió P1 el 2026-10-15)

   Cuánto va de algo, con la cifra adentro: mi meta de hoy, lo contado de un envío, las semanas que alcanza una talla.
   · Tres tamaños con nombre: `chico` (40 px: una fila de Existencias o de Conteo), `mediano` (72 px: Recibir, las revisiones de
     Cambios y Devoluciones) y `grande` (160 px: «Mi meta» del Inicio, «hoy contra ayer» de Caja, con la cifra en serif).
   · La pista en hueso y el arco en TINTA con las puntas redondas, que pasa a VERDE al cerrarse. El ámbar o el rojo, solo si la pantalla
     lo pide (`tono`). Sobre una superficie pintada de tinta (el titular de Caja, que se invierte con el tema), `sobreTinta`: pista y arco
     en crema.
   · La cifra va adentro (`children`); quien lo usa decide qué dice.
   · Se cierra desde arriba una vez al verse (1,1 s) y, si la cifra cambia, se desliza (app/estilos/avance-anillo-copiar.css). Sin
     JavaScript: sirve en un Server Component.
   Registro: docs/unificar/grafico.anillo.md. Nunca un `<circle>` con `strokeDasharray` dibujado a mano.
   ==================================================================== */

export type TamanoAnillo = "chico" | "mediano" | "grande";
export type TonoAnillo = "tinta" | "verde" | "ambar" | "rojo";

const MEDIDAS: Record<TamanoAnillo, { px: number; r: number; trazo: number }> = {
  chico: { px: 40, r: 16, trazo: 4 },
  mediano: { px: 72, r: 30, trazo: 6 },
  grande: { px: 160, r: 66, trazo: 12 },
};

export function Anillo({
  pct,
  tamano = "mediano",
  tono,
  sobreTinta = false,
  etiqueta,
  decorativa = false,
  indice,
  title,
  className = "",
  children,
}: {
  /** Cuánto va, de 0 a 100. Pasado de 100 el anillo se queda cerrado: la cifra de adentro dice cuánto. */
  pct: number;
  tamano?: TamanoAnillo;
  /** Sin tono: tinta, y verde al llegar a 100. Con tono, el que pide la pantalla. */
  tono?: TonoAnillo;
  sobreTinta?: boolean;
  /** Lo que le dice al lector de pantalla («Tu venta de hoy: 70 % de tu meta»). */
  etiqueta?: string;
  /** El texto de al lado ya dice lo mismo: el anillo se oculta al lector. */
  decorativa?: boolean;
  /** Posición en una lista: desfasa la entrada (38 ms por fila). */
  indice?: number;
  title?: string;
  className?: string;
  /** La cifra de adentro. */
  children?: ReactNode;
}) {
  const p = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  const { px, r, trazo } = MEDIDAS[tamano];
  const c = px / 2;
  const color = tono ?? (pct >= 100 ? "verde" : undefined);
  const estilo = { width: px, height: px, "--p": p, ...(indice !== undefined ? { "--i": indice } : {}) } as CSSProperties;
  const lector = decorativa ? ({ "aria-hidden": true } as const) : ({ role: "img", "aria-label": etiqueta ?? `${Math.round(p)} %` } as const);
  return (
    <span data-tamano={tamano} data-tono={color} data-sobre-tinta={sobreTinta || undefined} title={title} className={`anillo ${className}`} style={estilo} {...lector}>
      <svg viewBox={`0 0 ${px} ${px}`} width={px} height={px} aria-hidden>
        <circle className="anillo-pista" cx={c} cy={c} r={r} fill="none" strokeWidth={trazo} />
        {/* En cero no hay arco: con las puntas redondas dibujaría un punto. */}
        {p > 0 && <circle className="anillo-arco" cx={c} cy={c} r={r} fill="none" strokeWidth={trazo} pathLength={100} transform={`rotate(-90 ${c} ${c})`} />}
      </svg>
      {children !== undefined && <span className="anillo-centro">{children}</span>}
    </span>
  );
}
