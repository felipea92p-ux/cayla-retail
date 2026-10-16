"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { agregarALaBolsa } from "@/app/acciones/bolsa";
import { Icono } from "../Icono";
import "@/app/estilos/bolsa.css";

// «Agregar a la bolsa» (ADR-0408, actividad 7; maqueta v4, `vProducto` y `rapidoHTML`). Agregar NO separa nada (propuesta f): solo
// anota la prenda en la bolsa de este aparato, después de que la base dice que se puede (está en la Vitrina y queda en alguna
// tienda de la web). La cabecera y la página se ponen al día solas: la acción escribe la cookie y Next vuelve a dibujar la página.
//
// DÓNDE VA (lo pone la integración de la tienda, actividades 4 y 5): `AgregarALaBolsa` en la ficha, con la talla y el color elegidos
// (sin talla, `varianteId={null}`: «Elige tu talla»); `AgregarRapido` en la tarjeta, una por talla del color que tiene stock.

/** El aviso corto de abajo (el `.w-aviso` de la cuenta): se va solo. */
function useAviso() {
  const [aviso, setAviso] = useState<{ texto: string; id: number } | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const reloj = setTimeout(() => setAviso(null), 3600);
    return () => clearTimeout(reloj);
  }, [aviso]);
  const vista = aviso ? (
    <div key={aviso.id} className="w-aviso" role="status">
      <Icono nombre="bolsa" />
      <span>{aviso.texto}</span>
    </div>
  ) : null;
  return { decir: (texto: string) => setAviso({ texto, id: Date.now() }), vista };
}

function useAgregar(sedeId: string | null) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const { decir, vista } = useAviso();
  const agregar = (varianteId: string) =>
    iniciar(async () => {
      const r = await agregarALaBolsa(varianteId, sedeId);
      if (r.estado === "sin_sesion") router.push("/entrar");
      else decir(r.mensaje);
    });
  return { agregar, pendiente, vista };
}

/** El botón de la ficha. Sin talla elegida, «Elige tu talla» (como la maqueta). */
export function AgregarALaBolsa({ varianteId, sedeId = null }: { varianteId: string | null; sedeId?: string | null }) {
  const { agregar, pendiente, vista } = useAgregar(sedeId);
  if (!varianteId) {
    return (
      <button type="button" className="t-btn t-btn-ancho" disabled>
        Elige tu talla
      </button>
    );
  }
  return (
    <>
      <button type="button" className="t-btn t-btn-ancho" disabled={pendiente} aria-busy={pendiente} onClick={() => agregar(varianteId)}>
        <Icono nombre="bolsa" />
        {pendiente ? "Agregando…" : "Agregar a la bolsa"}
      </button>
      {vista}
    </>
  );
}

/** «Agregar» con la talla, sobre la foto de la tarjeta (al pasar el mouse). Una talla sin stock (`varianteId: null`) se ve tachada. */
export function AgregarRapido({
  tallas,
  sedeId = null,
}: {
  tallas: { talla: string; varianteId: string | null }[];
  sedeId?: string | null;
}) {
  const { agregar, pendiente, vista } = useAgregar(sedeId);
  if (tallas.length === 0) return null;
  return (
    <>
      <div className="t-rapido">
        {tallas.length > 1 && <small>Agregar</small>}
        {tallas.map((t) => (
          <button
            key={t.talla}
            type="button"
            disabled={!t.varianteId || pendiente}
            aria-label={`Agregar talla ${t.talla}`}
            onClick={() => t.varianteId && agregar(t.varianteId)}
          >
            {tallas.length === 1 ? "Agregar" : t.talla}
          </button>
        ))}
      </div>
      {vista}
    </>
  );
}
