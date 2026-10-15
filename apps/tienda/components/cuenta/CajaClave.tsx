"use client";

import { useState } from "react";

/** La caja de la contraseña con «Ver» / «Ocultar» (maqueta, `cajaClave`). */
export function CajaClave({
  id,
  valor,
  onCambio,
  autoComplete,
  describedBy,
  invalida = false,
}: {
  id: string;
  valor: string;
  onCambio: (valor: string) => void;
  autoComplete: "new-password" | "current-password";
  describedBy?: string;
  invalida?: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="w-caja-clave">
      <input
        id={id}
        className="w-caja"
        type={ver ? "text" : "password"}
        autoComplete={autoComplete}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={invalida || undefined}
        spellCheck={false}
        autoCapitalize="none"
      />
      <button
        type="button"
        className="w-ver"
        aria-pressed={ver}
        aria-controls={id}
        aria-label={ver ? "Ocultar la contraseña" : "Ver la contraseña"}
        onClick={() => setVer((v) => !v)}
      >
        {ver ? "Ocultar" : "Ver"}
      </button>
    </div>
  );
}
