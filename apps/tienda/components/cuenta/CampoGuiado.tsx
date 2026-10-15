import type { ReactNode } from "react";
import { TEXTO_MARCA, type MarcaCampo } from "@/lib/cuentas";

// Las dos piezas de cada campo de la cuenta (maqueta v4, `guiaRegistro`): el campo con su título y su marca (✓ Listo · Sigue
// aquí · Revisa), y lo que dice debajo. Las usan el registro y el paso del código, para que los dos se vean y se lean igual.

/** Un campo con su título, su marca y lo que dice debajo. La luz («Sigue aquí») no se va de él mientras tenga el foco. */
export function Campo({
  campo,
  idCaja,
  etiqueta,
  marca,
  textoMarca,
  alEntrar,
  alSalir,
  children,
}: {
  campo: string;
  idCaja: string;
  etiqueta: string;
  marca: MarcaCampo | "opcional";
  /** Otro texto para la marca (el de un campo opcional). */
  textoMarca?: string;
  alEntrar: () => void;
  alSalir: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="w-campo"
      data-campo={campo}
      data-estado={marca}
      onFocus={alEntrar}
      onBlur={(e) => {
        // Pasar del día al mes del cumpleaños no es salir del campo.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) alSalir();
      }}
    >
      <label htmlFor={idCaja}>
        {etiqueta} <span className="w-marca">{textoMarca ?? (marca === "opcional" ? "Opcional" : TEXTO_MARCA[marca])}</span>
      </label>
      {children}
    </div>
  );
}

/** Lo que dice el campo debajo de su caja: una línea, que el lector de pantalla anuncia al cambiar. */
export function Resultado({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="w-res" id={`${id}-res`} aria-live="polite">
      {children}
    </div>
  );
}
