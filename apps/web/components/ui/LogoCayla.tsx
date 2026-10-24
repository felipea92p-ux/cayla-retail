import { COLIBRI, LOGO, PALABRA } from "@cayla-retail/shared/marca";

/** El rojo de la marca en el ERP: el mismo que tenía el colibrí del lateral (`IsotipoCayla`), igual en los dos temas. */
const ROJO_MARCA = "#b8412d"; // tema-fijo: el rojo de la MARCA no cambia con el tema

/** Dónde empieza la palabra CAYLA dentro del logo, en altos del logo: lo que va debajo de ella («Retail») se alinea ahí. */
export const INICIO_DE_LA_PALABRA = Number(PALABRA.viewBox.split(" ")[0]) / LOGO.alto;

/**
 * El logo oficial de CAYLA (ADR-0446) en el ERP: el mismo dibujo del colibrí y de la palabra que la tienda
 * (`@cayla-retail/shared/marca`), nunca «CAYLA» escrito con una letra del sistema. Va en un solo SVG con el lienzo del logo para
 * que el colibrí y la palabra queden donde los puso el archivo oficial; con `sinPalabra` la palabra se desvanece (el lateral plegado)
 * y con `soloColibri` el lienzo se recorta al colibrí (la cabecera del celular). El alto lo pone quien lo usa; el ancho sigue solo.
 */
export function LogoCayla({
  className,
  sinPalabra = false,
  soloColibri = false,
}: {
  className?: string;
  sinPalabra?: boolean;
  soloColibri?: boolean;
}) {
  const lienzo = soloColibri ? COLIBRI : LOGO;
  return (
    <svg
      viewBox={lienzo.viewBox}
      width={lienzo.ancho}
      height={lienzo.alto}
      fill={ROJO_MARCA}
      aria-hidden
      focusable="false"
      className={`block w-auto shrink-0 ${className ?? ""}`}
    >
      <path fillRule="evenodd" d={COLIBRI.trazo} />
      {soloColibri ? null : (
        <path
          fillRule="evenodd"
          d={PALABRA.trazo}
          className={`transition-opacity duration-200 ${sinPalabra ? "opacity-0" : ""}`}
        />
      )}
    </svg>
  );
}
