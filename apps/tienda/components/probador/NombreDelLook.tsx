"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { renombrarTuLook } from "@/app/acciones/probador";
import { Icono } from "../Icono";

/**
 * El nombre de un look guardado y «Cambiar el nombre» (lienzo v3, `V3TuLook`): se cambia ahí mismo, de 1 a 40 letras. La base lo deja
 * sin espacios de más y dice el nombre que quedó. Enter guarda; «Cancelar» lo deja como estaba.
 */
export function NombreDelLook({ id, nombre: inicial }: { id: string; nombre: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [escrito, setEscrito] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idError = useId();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const limpio = escrito.trim().replace(/\s+/g, " ");
    if (limpio === nombre) {
      setEditando(false);
      return;
    }
    if (limpio.length === 0 || limpio.length > 40) {
      setError("El nombre va de 1 a 40 letras.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const quedo = await renombrarTuLook(id, limpio);
      if (quedo) {
        setNombre(quedo);
        setEditando(false);
        // Las migas y el título de la pestaña también dicen el nombre nuevo.
        router.refresh();
      } else setError("No pudimos cambiarlo. Vuelve a intentarlo en un momento.");
    } catch {
      setError("No pudimos cambiarlo. Vuelve a intentarlo en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    return (
      <div className="lg-nombre">
        <h1>{nombre}</h1>
        <button
          type="button"
          className="lg-renombrar"
          onClick={() => {
            setEscrito(nombre);
            setError(null);
            setEditando(true);
          }}
        >
          <Icono nombre="lapiz" />
          Cambiar el nombre
        </button>
      </div>
    );
  }
  return (
    <form className="lg-renombrar-form" onSubmit={guardar}>
      <input
        value={escrito}
        onChange={(e) => setEscrito(e.target.value)}
        maxLength={60}
        aria-label="El nombre de tu look"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        autoFocus
      />
      <button type="submit" className="t-btn" disabled={guardando} aria-busy={guardando}>
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" className="t-enlace" onClick={() => setEditando(false)} disabled={guardando}>
        Cancelar
      </button>
      {error && (
        <p className="lg-renombrar-error" id={idError} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
