"use client";

import { useState } from "react";
import { MONTO_ILEGIBLE, lecturaCampoMonto, montoIlegible } from "@/lib/monto-plata-reglas";

/**
 * Campo de un monto en soles que se puede vaciar y reescribir sin que se le pegue un «0», y que entiende la coma decimal.
 *
 * Es un campo de TEXTO con teclado decimal, no un `type="number"`: el del navegador borraba la coma sin avisar y «2,5» llegaba como 25
 * (S/ 25 en vez de S/ 2.50, /chaos de Apartados 2026-10-15; ADR-0419). Lo escrito se lee con `leerMontoPlata`, la misma regla de las hojas
 * del fondo: «2,5», «1.299,50» y «1,299.50» se entienden; «12.500» no se adivina. Lo que no se entiende queda escrito, marcado en rojo con
 * su porqué, y le avisa 0 al padre: ningún botón guarda un monto adivinado.
 *
 * El campo lleva su propio BORRADOR de texto mientras se edita y, al salir, muestra el número que entendió (si lo entendió). Al entrar: si
 * el monto es 0 el campo queda vacío (se ve el «0.00» de ayuda), y si no, el valor queda seleccionado para reemplazarlo de un tirón.
 */
export function CampoMonto({
  valor,
  onCambio,
  className,
  disabled,
  "aria-label": ariaLabel,
  "data-monto-medio": medio,
}: {
  valor: number;
  onCambio: (monto: number) => void;
  className?: string;
  disabled?: boolean;
  "aria-label": string;
  /** El medio de pago del monto (hoja de cobro): por él se le da el foco al agregar un segundo medio. */
  "data-monto-medio"?: string;
}) {
  // `null` = no se está editando: se muestra el número del padre.
  const [borrador, setBorrador] = useState<string | null>(null);
  const ilegible = borrador !== null && lecturaCampoMonto(borrador).ilegible;
  return (
    <input
      aria-label={ariaLabel}
      aria-invalid={ilegible || undefined}
      title={ilegible ? MONTO_ILEGIBLE : undefined}
      data-monto-medio={medio}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      value={borrador ?? String(valor)}
      disabled={disabled}
      className={`${className ?? ""} ${CLASE_MONTO_ILEGIBLE}`}
      onFocus={(e) => {
        if (valor === 0) setBorrador("");
        else e.currentTarget.select();
      }}
      onChange={(e) => {
        setBorrador(e.target.value);
        onCambio(lecturaCampoMonto(e.target.value).valor);
      }}
      // Al salir se ve el número entendido; lo que no se entendió se queda escrito, en rojo, para corregirlo.
      onBlur={() => setBorrador((b) => (b !== null && lecturaCampoMonto(b).ilegible ? b : null))}
    />
  );
}

/** Lo escrito que no se entiende se ve en rojo con un subrayado ondulado (lo pone `aria-invalid`). Un `<input>` propio la suma a su clase;
 *  un `CampoTexto` dice el porqué en su pie (`tono="error"`). */
export const CLASE_MONTO_ILEGIBLE =
  "aria-[invalid=true]:text-rojo-profundo aria-[invalid=true]:underline aria-[invalid=true]:decoration-rojo aria-[invalid=true]:decoration-wavy";

/**
 * Para un campo de plata que guarda lo escrito como TEXTO y no puede ser un `CampoMonto` (su padre lee el texto, lleva su propia caja o
 * etiqueta): campo de texto con teclado decimal, marcado en rojo si no se entiende. Se lee con `numeroDeMonto` (`lib/monto-plata-reglas.ts`),
 * nunca con `Number(…)`. ADR-0419: el `type="number"` del navegador borraba la coma («2,5» → 25).
 */
export function atributosMontoTexto(texto: string) {
  const ilegible = montoIlegible(texto);
  return {
    type: "text",
    inputMode: "decimal",
    autoComplete: "off",
    "aria-invalid": ilegible || undefined,
    title: ilegible ? MONTO_ILEGIBLE : undefined,
  } as const;
}
