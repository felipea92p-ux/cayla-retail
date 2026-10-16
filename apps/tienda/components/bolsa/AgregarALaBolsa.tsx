"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { agregarALaBolsa } from "@/app/acciones/bolsa";
import { useAvisoBreve } from "../club/useAvisoBreve";
import { Icono } from "../Icono";
import "@/app/estilos/bolsa.css";

// «Agregar a la bolsa» (ADR-0408, actividad 7; maqueta v4, `vProducto` y `rapidoHTML`). Agregar NO separa nada (propuesta f): solo
// anota la prenda en la bolsa de este aparato, después de que la base dice que se puede (está en la Vitrina y queda en alguna
// tienda de la web). La cabecera y la página se ponen al día solas: la acción escribe la cookie y Next vuelve a dibujar la página.
//
// DÓNDE VA (lo pone la integración de la tienda, actividades 4 y 5): `AgregarALaBolsa` en la ficha, con la talla y el color elegidos
// (sin talla, `varianteId={null}`: «Elige tu talla»); `AgregarRapido` en la tarjeta, una por talla del color que tiene stock.
//
// Lo que pasó se dice donde se mira: en la ficha, junto al botón (`alResponder`: la línea con «Ver mi bolsa», que no se va sola ni
// depende de una animación); en la tarjeta, con el aviso corto de abajo de toda la tienda (`useAvisoBreve`, uno a la vez).

type ResultadoAgregar = { bien: boolean; texto: string };

function useAgregar(sedeId: string | null, alResponder?: (r: ResultadoAgregar) => void) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const { aviso, mostrar } = useAvisoBreve();
  const agregar = (varianteId: string) =>
    iniciar(async () => {
      const r = await agregarALaBolsa(varianteId, sedeId);
      if (r.estado === "sin_sesion") {
        router.push("/entrar");
        return;
      }
      const resultado = { bien: r.estado === "agregada", texto: r.mensaje };
      if (alResponder) alResponder(resultado);
      else mostrar(resultado.texto, resultado.bien);
    });
  return { agregar, pendiente, aviso };
}

/**
 * El botón de la ficha. Sin talla elegida dice «Elige tu talla» (como la maqueta) y, si la ficha le da `alElegirTalla`, lleva a las
 * tallas: en el celular el botón vive en la barra de abajo y las tallas quedan lejos, arriba; un botón apagado ahí era un callejón.
 */
export function AgregarALaBolsa({
  varianteId,
  sedeId = null,
  alElegirTalla,
  alResponder,
}: {
  varianteId: string | null;
  sedeId?: string | null;
  alElegirTalla?: () => void;
  alResponder?: (r: ResultadoAgregar) => void;
}) {
  const { agregar, pendiente, aviso } = useAgregar(sedeId, alResponder);
  if (!varianteId) {
    return (
      <button type="button" className="t-btn t-btn-ancho t-btn-sec" disabled={!alElegirTalla} onClick={alElegirTalla}>
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
      {aviso}
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
  const { agregar, pendiente, aviso } = useAgregar(sedeId);
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
      {aviso}
    </>
  );
}
