"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { agregarALaBolsa, quitarDeLaBolsa } from "@/app/acciones/bolsa";

/**
 * Cuántas lleva de una prenda, en la bolsa: «−», el número y «+». Antes la bolsa solo tenía «Quitar» (que sacaba UNA de «×2») y para
 * llevar otra había que volver a la ficha. «−» saca una con la misma acción y la misma guarda de siempre (`vista`: dos toques
 * seguidos sacan una sola); con una sola se apaga: para sacarla está «Quitar». «+» es «Agregar a la bolsa» de la ficha: la base dice
 * antes si queda otra en las tiendas de la web y, si no, la frase de por qué queda aquí debajo. La página se vuelve a dibujar sola con
 * la cantidad nueva (la acción escribe la cookie de la bolsa).
 */
export function CantidadEnLaBolsa({
  varianteId,
  cantidad,
  prenda,
  puedeSumar,
}: {
  varianteId: string;
  cantidad: number;
  /** «Chaleco Zenit, Chocolate, talla S»: para quien usa lector de pantalla («Agregar otra: …»). */
  prenda: string;
  /** Con la prenda agotada (o sin tantas en las tiendas) no se ofrece otra. */
  puedeSumar: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  // La frase de un «+» que no pudo, atada a la cantidad que se veía: si la cantidad cambia, ya no corresponde y se va.
  const [aviso, setAviso] = useState<{ texto: string; cantidad: number } | null>(null);

  function sumar() {
    if (pendiente) return;
    iniciar(async () => {
      const r = await agregarALaBolsa(varianteId, null);
      if (r.estado === "sin_sesion") router.push("/entrar");
      else setAviso(r.estado === "no" ? { texto: r.mensaje, cantidad } : null);
    });
  }

  return (
    <div className="t-cantidad-caja">
      <div className="t-cantidad" role="group" aria-label={`Cantidad: ${prenda}`}>
        <form action={quitarDeLaBolsa}>
          <input type="hidden" name="variante" value={varianteId} />
          <input type="hidden" name="vista" value={cantidad} />
          <Menos apagado={cantidad <= 1 || pendiente} prenda={prenda} />
        </form>
        <output className="num" aria-live="polite">
          {cantidad}
        </output>
        <button type="button" onClick={sumar} disabled={!puedeSumar || pendiente} aria-busy={pendiente || undefined} aria-label={`Agregar otra: ${prenda}`}>
          +
        </button>
      </div>
      {aviso && aviso.cantidad === cantidad && (
        <small className="t-cantidad-aviso" role="status">
          {aviso.texto}
        </small>
      )}
    </div>
  );
}

/** «−»: mientras la bolsa responde, no se puede volver a tocar. */
function Menos({ apagado, prenda }: { apagado: boolean; prenda: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={apagado || pending} aria-label={`Quitar una: ${prenda}`}>
      −
    </button>
  );
}
