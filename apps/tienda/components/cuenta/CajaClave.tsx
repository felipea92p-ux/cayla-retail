"use client";

import { useState } from "react";

/**
 * La caja de la contraseña con «Ver» / «Ocultar» (maqueta, `cajaClave`). `name`: el formulario la lee al enviarse («Entrar» toma lo
 * que dejó el autocompletar aunque la página no lo haya visto escribir).
 */
export function CajaClave({
  id,
  name,
  valor,
  onCambio,
  autoComplete,
  describedBy,
  invalida = false,
}: {
  id: string;
  name?: string;
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
        name={name}
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
      {/* El ojo y la palabra (2026-10-16): el ojo se reconoce de un vistazo y la palabra dice qué pasa al tocarlo. Del alto de un dedo. */}
      <button
        type="button"
        className="w-ver"
        aria-pressed={ver}
        aria-controls={id}
        aria-label={ver ? "Ocultar la contraseña" : "Ver la contraseña"}
        onClick={() => setVer((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
          {ver && <path d="M4.5 4.5l15 15" />}
        </svg>
        <span>{ver ? "Ocultar" : "Ver"}</span>
      </button>
    </div>
  );
}
