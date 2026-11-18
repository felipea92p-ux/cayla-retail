"use client";

import { useEffect, useState } from "react";
import { leerFichaDePrenda } from "@/lib/recepcion-envio-acciones";
import type { FichaParaRecibir } from "@/lib/recepcion-envio-reglas";
import type { ObservacionDeEnvio } from "@/lib/observaciones-envio-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { ObservacionesAnotadas } from "./ObservacionesDeLinea";

// «Ver detalle» de un modelo en «Revisa y cierra» (Felipe 2026-11-07, maqueta B ronda 2): lo que se anotó al contarlo para diferenciarlo de los demás, sus
// observaciones, quién lo contó y cuándo y, si la prenda ya existe, su ficha (código, material, patrón, descripción). Solo lee: nada aquí guarda.

export function DetalleDelModelo({
  id,
  nombre,
  nota,
  provisional,
  contaron,
  contadoEn,
  observaciones,
  prenda,
}: {
  id: string;
  nombre: string;
  nota: string | null;
  provisional: boolean;
  contaron: readonly string[];
  contadoEn: string | null;
  observaciones: readonly ObservacionDeEnvio[];
  /** La prenda que ya existe en el catálogo; `null` si se crea después. */
  prenda: { productoId: string; codigo: string | null } | null;
}) {
  // `null`: todavía no llega. `false`: no se pudo leer; se dice y el resto del detalle sigue.
  const [ficha, setFicha] = useState<FichaParaRecibir | null | false>(null);
  const productoId = prenda?.productoId ?? null;
  useEffect(() => {
    if (!productoId) return;
    let vigente = true;
    void leerFichaDePrenda(productoId).then((f) => {
      if (vigente) setFicha(f ?? false);
    });
    return () => {
      vigente = false;
    };
  }, [productoId]);

  const cuando = contadoEn ? diaYHoraLima(contadoEn) : null;
  const dato = (v: string | null | undefined) => (ficha === null ? "…" : v?.trim() || "Sin registrar");
  const filas: [string, string, boolean?][] = prenda
    ? [
        ["Prenda", [nombre, prenda.codigo, ficha ? ficha.marca : null].filter(Boolean).join(" · ")],
        ["Material", [dato(ficha ? ficha.material : null), ficha && ficha.patron ? ficha.patron : null].filter(Boolean).join(" · ")],
        ["Descripción", dato(ficha ? ficha.descripcion : null)],
      ]
    : [["Lo que anotaste", nota ? `«${nota}»` : "Nada: no se escribió una descripción al contarlo.", !nota]];
  filas.push(["Contó", contaron.length > 0 ? [contaron.join(" y "), cuando ? `${cuando.dia} ${cuando.hora}` : null].filter(Boolean).join(" · ") : "Sin registrar", contaron.length === 0]);

  return (
    <div id={id} className="rc-cierre-detalle anim-revelar space-y-2.5" data-detalle-modelo>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {filas.map(([rotulo, valor, tenue]) => (
          <div key={rotulo} className="contents">
            <dt className="text-taupe">{rotulo}</dt>
            <dd className={tenue ? "text-taupe" : "text-tinta"}>{valor}</dd>
          </div>
        ))}
      </dl>
      {observaciones.length > 0 ? (
        <ObservacionesAnotadas observaciones={observaciones} />
      ) : (
        <p className="text-sm text-taupe">Sin observaciones.</p> // unificar-fijo: un dato de la ficha que no tiene nada, no el vacío de una lista
      )}
      {provisional && <p className="text-sm text-taupe">Se llama «{nombre}» porque nadie puso su nombre: se le pone al crearla, en «Para después».</p>}
      {ficha === false && <p className="text-sm text-taupe">No se pudo leer toda su ficha. Ábrela de nuevo en un momento.</p>}
    </div>
  );
}
