import { Fragment } from "react";
import { LOGO, PALABRA, partirPorLaMarca, type PiezaDeMarca } from "@/lib/marca";

/**
 * El logo oficial de CAYLA (`lib/marca.ts`) en SVG, del color del texto que lo rodea (`currentColor`): cada lugar le pone su color y su
 * alto (o su ancho) con CSS, y la otra medida sigue sola. Escondido para el lector de pantalla —el enlace o la tarjeta que lo lleva ya
 * dice «CAYLA»—, salvo que `nombre` diga cómo leerlo (la palabra dentro de un título). El colibrí solo es `<Isotipo>` (`./Isotipo`).
 */
export function PiezaDeLaMarca({ pieza, className, nombre }: { pieza: PiezaDeMarca; className: string; nombre?: string }) {
  const lectura = nombre ? { role: "img", "aria-label": nombre } : { "aria-hidden": true };
  return (
    <svg
      className={className}
      viewBox={pieza.viewBox}
      width={pieza.ancho}
      height={pieza.alto}
      style={{ aspectRatio: `${pieza.ancho} / ${pieza.alto}` }}
      focusable="false"
      {...lectura}
    >
      <path fill="currentColor" fillRule="evenodd" d={pieza.trazo} />
    </svg>
  );
}

/** El logo completo: el colibrí y la palabra, como en el escaparate. */
export function Logo({ className = "" }: { className?: string }) {
  return <PiezaDeLaMarca pieza={LOGO} className={`t-marca t-marca-logo ${className}`.trim()} />;
}

/** La palabra CAYLA sola, con el dibujo del logo (nunca escrita con una letra). */
export function PalabraCayla({ className = "", nombre }: { className?: string; nombre?: string }) {
  return <PiezaDeLaMarca pieza={PALABRA} className={`t-marca t-marca-palabra ${className}`.trim()} nombre={nombre} />;
}

/** Un título que puede nombrar a CAYLA («Aniversario CAYLA», «de CAYLA»): la palabra sale con el dibujo del logo y el resto, como texto. */
export function TextoConMarca({ texto }: { texto: string }) {
  return partirPorLaMarca(texto).map((parte, i) =>
    i % 2 === 1 ? <PalabraCayla key={i} className="t-palabra-en-titulo" nombre="CAYLA" /> : <Fragment key={i}>{parte}</Fragment>,
  );
}
