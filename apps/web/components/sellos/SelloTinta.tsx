import { useId, type CSSProperties } from "react";
import type { DibujoDeInsignia } from "@cayla-retail/shared/insignias-visual";
import { dibujoDeEtiqueta } from "@/components/MuestraEtiqueta";
import type { EstiloEtiqueta } from "@/lib/etiqueta-grupos";

/* ====================================================================
   El sello de tinta (Catálogo ▸ Insignias, maqueta «II · Pases» de docs/maquetas/sellos-2026-10/, Felipe 2026-10-22)

   Una insignia se dibuja como un sello de tinta: redondo, con doble anillo, su nombre en el borde de arriba, su grupo (o el año de la campaña) en
   el de abajo y, al centro, el mismo dibujo de su tarjeta (`dibujoDeEtiqueta`). El tono es el de su grupo y sale de los tokens: taupe
   campaña, ámbar rotación, verde artesanal, pizarra general (sellos.css, `data-sl-grupo`). Chico (menos de 56 px) va sin texto en el
   borde: no se leería. Al aparecer se ESTAMPA una vez (baja, gira a su lugar y deja un anillo de tinta que se abre); al pasar el
   mouse sobre su pase se endereza. Todo en `app/estilos/sellos.css`, apagado con «reducir movimiento».
   ==================================================================== */

const GRUPO: Record<EstiloEtiqueta, string> = { campana: "Campaña", urgencia: "Rotación", positivo: "Artesanal", neutral: "General" };

export function SelloTinta({
  nombre,
  icono = null,
  imagen = null,
  estilo,
  anio = null,
  tamano = 72,
  giro = -6,
  indice = 0,
  apagado = false,
  className = "",
}: {
  nombre: string;
  /** El dibujo elegido al crearla (ADR-0490); sin él, el de su nombre. */
  icono?: DibujoDeInsignia | null;
  /** Su imagen propia (la ruta en el almacén); manda sobre `icono`. */
  imagen?: string | null;
  estilo: EstiloEtiqueta;
  /** El año de una campaña con fechas: va en el borde de abajo («★ 2026 ★»). */
  anio?: string | null;
  tamano?: number;
  /** Cuánto queda girado (grados): un sello estampado nunca cae derecho. */
  giro?: number;
  /** Su lugar en la cascada de entrada. */
  indice?: number;
  apagado?: boolean;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dibujo = dibujoDeEtiqueta(nombre, icono, imagen)("currentColor");
  const estilos = { width: tamano, height: tamano, "--sl-giro": `${giro}deg`, "--i": indice } as CSSProperties;
  const abajo = estilo === "campana" ? (anio ?? "CAYLA") : GRUPO[estilo];
  return (
    <span aria-hidden data-sl-grupo={estilo} className={`sl-sello ${apagado ? "sl-sello-apagado" : ""} ${className}`} style={estilos}>
      <svg viewBox="0 0 100 100">
        {tamano < 56 ? (
          <>
            <circle className="sl-sello-fondo" cx="50" cy="50" r="46" strokeWidth="4" />
            <circle className="sl-sello-puntos" cx="50" cy="50" r="36" strokeWidth="2" strokeDasharray="3.5 3.5" /> {/* unificar-fijo: el anillo punteado es el dibujo del sello de goma, no un avance */}
            <g transform="translate(50 50) scale(1.85)">{dibujo}</g>
          </>
        ) : (
          <>
            <defs>
              <path id={`${id}-arriba`} d="M 13 50 A 37 37 0 0 1 87 50" />
              <path id={`${id}-abajo`} d="M 10 52 A 40 40 0 0 0 90 52" />
            </defs>
            <circle className="sl-sello-fondo" cx="50" cy="50" r="47" strokeWidth="2.6" />
            <circle className="sl-sello-puntos" cx="50" cy="50" r="31" strokeWidth="1.2" strokeDasharray="2.2 2.2" /> {/* unificar-fijo: el anillo punteado es el dibujo del sello de goma, no un avance */}
            <text className="sl-sello-texto" fontSize={nombre.length > 15 ? 8 : 9.6}>
              <textPath href={`#${id}-arriba`} startOffset="50%" textAnchor="middle" {...(nombre.length > 19 ? { textLength: 112, lengthAdjust: "spacingAndGlyphs" } : {})}>
                {nombre}
              </textPath>
            </text>
            <text className="sl-sello-texto sl-sello-texto-abajo" fontSize="7">
              <textPath href={`#${id}-abajo`} startOffset="50%" textAnchor="middle">
                {`★ ${abajo} ★`}
              </textPath>
            </text>
            <g transform="translate(50 52) scale(1.25)">{dibujo}</g>
          </>
        )}
      </svg>
    </span>
  );
}
