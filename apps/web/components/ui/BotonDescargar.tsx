import type { ReactNode } from "react";
import { ArrowRight, Download } from "lucide-react";
import { Boton, BotonAncla, BotonEnlace } from "./campos";

/* ====================================================================
   Los botones de una sola función de la ronda 10 de /unificar (ADR-0358: Felipe los eligió tocándolos el 2026-10-13).

   · <BotonDescargar>: bajar un archivo (la lista, el mes, un reporte). UN verbo, el de la tienda —«Descargar» + qué: «Descargar Excel»,
     «Descargar CSV», «Descargar reporte del ajuste»—, nunca «Exportar» ni solo un ícono. La cara es la del botón del sistema (secundario;
     en la cabecera de una pantalla habla en versalitas, en una hoja en letra normal) con el ícono de descarga a la izquierda, que BAJA 2 px
     al pasar el mouse (`app/globals.css`, junto al movimiento de todo botón). Con `href`, es una descarga directa (`<a download>`: no pasa
     por el loader de pantalla); con `onClick`, arma el archivo en el navegador y `cargando` corre el hilo mientras tanto.
   · <BotonVer>: llevar a ver algo en otra pantalla (la prenda en Existencias, el impuesto en Facturación, la ficha del proveedor). Siempre
     el botón secundario con la flecha a la derecha, que avanza 4 px al pasar el mouse: dice que LLEVA, sin competir con el botón negro de
     la pantalla. Nunca negro, nunca con «→» escrito. Dentro de una frase sigue siendo el enlace (`btn-enlace`), y junto a un resumen,
     «Ver las 9 →» (`<EnlaceVer>`).
   ==================================================================== */

type Comun = {
  children: ReactNode;
  /** Casi siempre secundario; `primario` solo si bajar el archivo ES la acción de esa hoja (la lista de compra). */
  peso?: "fantasma" | "primario";
  /** En una fila apretada (el pie de una tabla, una hoja): `btn-chico`. */
  chico?: boolean;
  className?: string;
  title?: string;
  /** Ancla de la guía (ADR-0389). */
  guia?: string;
};

export function BotonDescargar(
  props: Comun & ({ href: string; onClick?: never; cargando?: never; disabled?: never } | { onClick: () => void; href?: never; cargando?: boolean; disabled?: boolean }),
) {
  const { children, peso = "fantasma", chico = false, className = "", title, guia } = props;
  const clase = `${chico ? "btn-chico" : ""} ${className}`;
  // En una caja `flex` (de bloque, no `inline-flex`): el CSS base dibuja todo `svg` como bloque y, dentro de la caja sin flex de
  // <Boton>, el ícono bajaba de línea; una caja `inline-flex` armaba además su propia línea de texto y el botón crecía 5 px sobre
  // sus vecinos de la cabecera. `-my-1`: el ícono de 16 px no estira el alto de la letra de 11 px (40 px, como todo botón ahí).
  const contenido = (
    <span className="flex items-center gap-2">
      <Download aria-hidden className="-my-1 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </span>
  );
  if (props.href !== undefined) {
    return (
      <BotonAncla href={props.href} download peso={peso} className={clase} title={title} data-guia={guia}>
        {contenido}
      </BotonAncla>
    );
  }
  return (
    <Boton type="button" onClick={props.onClick} cargando={props.cargando} disabled={props.disabled} peso={peso} className={clase} title={title} data-guia={guia}>
      {contenido}
    </Boton>
  );
}

export function BotonVer(props: Omit<Comun, "peso"> & ({ href: string; onClick?: never; alNavegar?: () => void } | { onClick: () => void; href?: never; alNavegar?: never })) {
  const { children, chico = false, className = "", title, guia } = props;
  const clase = `${chico ? "btn-chico" : ""} ${className}`;
  const contenido = (
    <span className="flex items-center gap-2">
      {children}
      <ArrowRight aria-hidden className="-my-1 h-4 w-4 shrink-0" />
    </span>
  );
  if (props.href !== undefined) {
    return (
      <BotonEnlace href={props.href} onClick={props.alNavegar} className={clase} title={title} data-guia={guia}>
        {contenido}
      </BotonEnlace>
    );
  }
  return (
    <Boton type="button" onClick={props.onClick} className={clase} title={title} data-guia={guia}>
      {contenido}
    </Boton>
  );
}
