"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guardarTuLook, quitarTuLook } from "@/app/acciones/probador";
import { avisoAlGuardar, buscarGuardado, MINIMO_PARA_GUARDAR, piezasParaGuardar, type LookGuardado } from "@/lib/looks-guardados";
import { piezasDelLook, type Look } from "@/lib/probador";
import { Icono } from "../Icono";

/**
 * El corazón de «Arma el tuyo» (ADR-0434, actividad 8; lienzo v3): guarda el look que se está armando en los favoritos de la cuenta, o lo
 * quita si ya estaba (el mismo look es el mismo, en cualquier orden). Va lleno cuando el look de la figura es uno guardado. Lo guardado
 * son las prendas y sus colores: el precio y lo que hay se leen al día cada vez que se abre.
 */
export function CorazonDelLook({
  look,
  guardados,
  onGuardados,
  avisar,
}: {
  look: Look;
  guardados: readonly LookGuardado[];
  onGuardados: (cambiar: (g: LookGuardado[]) => LookGuardado[]) => void;
  avisar: (texto: string) => void;
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const actual = buscarGuardado(piezasDelLook(look), guardados);

  async function alternar() {
    if (trabajando) return;
    setTrabajando(true);
    try {
      if (actual) {
        if (await quitarTuLook(actual.id)) {
          onGuardados((g) => g.filter((x) => x.id !== actual.id));
          avisar("Lo quitamos de tus favoritos");
        } else avisar("No pudimos quitarlo. Vuelve a intentarlo en un momento.");
        return;
      }
      const piezas = piezasParaGuardar(look);
      if (piezas.length < MINIMO_PARA_GUARDAR) {
        avisar(avisoAlGuardar("invalido"));
        return;
      }
      const r = await guardarTuLook(piezas);
      if (r.estado === "sin_sesion") {
        router.push("/entrar");
        return;
      }
      if (r.estado === "guardado" && r.id && r.nombre) {
        const nuevo: LookGuardado = {
          id: r.id,
          nombre: r.nombre,
          guardadoEn: new Date().toISOString(),
          piezas: piezas.map((p, i) => ({ posicion: i + 1, productoId: p.producto_id, color: p.color, seVe: true })),
        };
        onGuardados((g) => [nuevo, ...g.filter((x) => x.id !== nuevo.id)]);
      }
      avisar(avisoAlGuardar(r.estado));
    } catch {
      avisar(avisoAlGuardar("sin_respuesta"));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <button
      type="button"
      className="pb-corazon"
      aria-pressed={actual !== null}
      aria-busy={trabajando}
      aria-label={actual ? "Quitar el look de tus favoritos" : "Guardar el look en tus favoritos"}
      onClick={alternar}
    >
      <Icono nombre="corazon" />
    </button>
  );
}
