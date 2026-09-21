"use client";

import { useState } from "react";

/**
 * Campo de un monto en soles que se puede vaciar y reescribir sin que se le pegue un «0».
 *
 * Un `<input type="number" value={numero}>` controlado no puede estar vacío: al borrar, el
 * número pasa a 0, React vuelve a escribir «0» en el campo, y lo que se teclea después queda
 * detrás («059»). Por eso el campo lleva su propio BORRADOR de texto mientras se edita, y solo
 * al salir vuelve a mostrar el número del padre. Al entrar: si el monto es 0 el campo queda
 * vacío (se ve el «0.00» de ayuda), y si no, el valor queda seleccionado para reemplazarlo de un
 * tirón. Vacío o roto avisa 0 al padre. Es el mismo criterio del campo «Recibido».
 */
export function CampoMonto({
  valor,
  onCambio,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  valor: number;
  onCambio: (monto: number) => void;
  className?: string;
  disabled?: boolean;
  "aria-label": string;
}) {
  // `null` = no se está editando: se muestra el número del padre.
  const [borrador, setBorrador] = useState<string | null>(null);
  return (
    <input
      aria-label={ariaLabel}
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      placeholder="0.00"
      value={borrador ?? String(valor)}
      disabled={disabled}
      className={className}
      onFocus={(e) => {
        if (valor === 0) setBorrador("");
        else e.currentTarget.select();
      }}
      onChange={(e) => {
        setBorrador(e.target.value);
        onCambio(e.target.value === "" ? 0 : Number(e.target.value));
      }}
      onBlur={() => setBorrador(null)}
    />
  );
}
