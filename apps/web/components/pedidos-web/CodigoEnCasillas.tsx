"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { borrarCasillaAnterior, escribirEnCasilla } from "@/lib/pedidos-web-reglas";

const CASILLAS = [0, 1, 2, 3] as const;

/**
 * El código de recojo de 4 cifras en 4 casillas (rediseño de Pedidos, 2026-10-31). Cada cifra va en la suya; el cursor pasa solo a la
 * siguiente; «borrar» en una vacía vuelve a la anterior; y pegar «20 94» (o «2094») llena las cuatro. La lógica es pura
 * (`escribirEnCasilla`, `borrarCasillaAnterior`); aquí solo se dibuja y se mueve el cursor. Quien la usa lleva su etiqueta y su pie en un `<Campo>`.
 */
export function CodigoEnCasillas({
  valor,
  onCambio,
  error = false,
  disabled = false,
  etiqueta = "Código de 4 cifras",
}: {
  valor: string;
  onCambio: (valor: string) => void;
  /** La base rechazó el código: las casillas se marcan. */
  error?: boolean;
  disabled?: boolean;
  etiqueta?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const ir = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());

  const escribir = (i: number, texto: string) => {
    const r = escribirEnCasilla(valor, i, texto);
    onCambio(r.valor);
    ir(r.cursor);
  };
  const alPegar = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    escribir(i, e.clipboardData.getData("text"));
  };
  const alTeclear = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !valor[i]) {
      e.preventDefault();
      const r = borrarCasillaAnterior(valor, i);
      onCambio(r.valor);
      ir(r.cursor);
    } else if (e.key === "ArrowLeft" && i > 0) ir(i - 1);
    else if (e.key === "ArrowRight" && i < 3) ir(i + 1);
  };

  return (
    <div role="group" aria-label={etiqueta} className="flex gap-2.5">
      {CASILLAS.map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="off"
          // Sin maxLength: pegar o autocompletar trae más de una cifra en una casilla, y `escribirEnCasilla` lo reparte.
          value={valor[i] ?? ""}
          disabled={disabled}
          aria-label={`Cifra ${i + 1} de 4`}
          aria-invalid={error || undefined}
          onChange={(e) => escribir(i, e.target.value)}
          onPaste={(e) => alPegar(i, e)}
          onKeyDown={(e) => alTeclear(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className={`h-16 w-14 rounded-[14px] border bg-hueso text-center font-display text-3xl tabular-nums text-tinta outline-none transition-colors focus:border-tinta focus:bg-papel disabled:opacity-50 ${
            error ? "border-rojo" : "border-transparent"
          }`}
        />
      ))}
    </div>
  );
}
