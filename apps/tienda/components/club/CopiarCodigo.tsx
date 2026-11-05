"use client";

import { useState } from "react";
import { Icono } from "../Icono";
import { useAvisoBreve } from "./useAvisoBreve";
import "@/app/estilos/puntos.css";

/** «Copiar»: pone el código de un cupón en el portapapeles para pegarlo al pagar. Si el navegador no deja, el código sigue a la vista. */
export function CopiarCodigo({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  const { aviso, mostrar } = useAvisoBreve();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      mostrar("Código copiado.", true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      mostrar("No pudimos copiarlo: toca el código y cópialo a mano.", false);
    }
  }

  return (
    <>
      <button type="button" className="pt-copiar" onClick={copiar} aria-label={`Copiar el código ${codigo}`}>
        {copiado ? <Icono nombre="check" /> : null}
        {copiado ? "Copiado" : "Copiar"}
      </button>
      {aviso}
    </>
  );
}
