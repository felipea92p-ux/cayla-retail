import type { CSSProperties } from "react";
import { PORTADA_DE_SIEMPRE, partirNombre } from "@/lib/campanas-reglas";
import { fechaCorta } from "@/lib/etiqueta-vigencia";

/**
 * La portada de una campaña en chico, como la ve el cliente arriba de la tienda online: la ceja con su fecha y el nombre en dos líneas, la
 * última palabra en cursiva. Hasta que la campaña tenga su diseño (actividad 4), con los colores de SIEMPRE (`PORTADA_DE_SIEMPRE`): son
 * un dato de la portada, no del tema del ERP, así que no cambian con el modo oscuro (`data-color-dato`).
 */
export function PortadaMini({ nombre, hasta }: { nombre: string; hasta: string | null }) {
  const [linea, cursiva] = partirNombre(nombre);
  const colores = {
    "--hf": PORTADA_DE_SIEMPRE.fondo,
    "--hf2": PORTADA_DE_SIEMPRE.fondo2,
    "--ht": PORTADA_DE_SIEMPRE.letra,
    "--ha": PORTADA_DE_SIEMPRE.acento,
  } as CSSProperties;
  return (
    <div className="tw-portada-mini" data-color-dato style={colores} aria-hidden>
      <div className="tw-portada-mini-dentro">
        <span className="tw-portada-mini-ceja">{hasta ? `Campaña · hasta el ${fechaCorta(hasta)}` : "Campaña"}</span>
        <span className="tw-portada-mini-tit font-serif">
          <span>{linea}</span>
          {cursiva && <em>{cursiva}</em>}
        </span>
      </div>
    </div>
  );
}
