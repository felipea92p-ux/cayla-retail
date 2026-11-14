"use client";

import { useEffect, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { createClient } from "@/lib/supabase/client";
import { choqueResuelto, fraseDeChoque, tituloDeChoque, type Choque, type FilaChoque } from "@/lib/campana-reglas";

// «Una prenda, una oferta por tienda y por día» en la hoja de la oferta (ADR-0655, Felipe 2026-11-13). La base dice con qué choca
// (`fn_choques_de_oferta`, la misma regla de la caja); la hoja lo muestra tienda por tienda y deja elegir «que la otra ceda». El candado de
// verdad vive en la base (un disparador al cerrar la transacción): si esta lectura no llega, la hoja no inventa nada y la base frena igual.

export type PreguntaChoques = {
  /** Solo se pregunta cuando la oferta está completa (qué, prendas, fechas y tiendas). */
  activo: boolean;
  reglaId: string | null;
  etiquetaId: string;
  desde: string;
  hasta: string;
  dias: number[];
  solo: string[];
  fuera: string[];
  productos: string[];
  claure: boolean;
  /** Vacío = todas las tiendas de la campaña. */
  sedes: string[];
  /** Un monto (ADR-0655, actividad 8): qué cuenta para llegar a él. Con esto se pregunta con su forma (toda la compra alcanza a todo) y la
   *  base dice además si la otra es un monto y cuántas prendas alcanza esta. Siempre sin «que no cuenten»: la hoja lo resuelve a la vista. */
  monto?: { cuenta: "campana" | "compra" } | null;
  /** Cambia cuando la lista de ofertas cambia (otra se activó o se retiró): vuelve a preguntar. */
  version: unknown;
};

/** Con qué choca la oferta de la hoja. `null` mientras no se sabe (o si la base no respondió: la base frena igual al guardar). */
export function useChoquesDeOferta(p: PreguntaChoques): FilaChoque[] | null {
  const clave = JSON.stringify([p.activo, p.reglaId, p.etiquetaId, p.desde, p.hasta, p.dias, p.solo, p.fuera, p.productos, p.claure, p.sedes, p.monto?.cuenta ?? null]);
  // La respuesta vale solo para la pregunta que la pidió: si la oferta cambió mientras tanto, se descarta sola.
  const [respuesta, setRespuesta] = useState<{ clave: string; version: unknown; filas: FilaChoque[] | null } | null>(null);
  useEffect(() => {
    if (!p.activo) return;
    let vigente = true;
    // La misma pausa que un buscador (350 ms): mientras se tocan días o tiendas no se pregunta en cada toque.
    const t = window.setTimeout(async () => {
      // Un monto pregunta con su forma (`fn_choques_de_oferta_con_forma`, 20261114054000); lo demás, a la de siempre.
      const { data, error } = (await createClient().rpc((p.monto ? "fn_choques_de_oferta_con_forma" : "fn_choques_de_oferta") as never, {
        p_regla_id: p.reglaId,
        p_etiqueta_id: p.etiquetaId,
        p_desde: p.desde,
        p_hasta: p.hasta,
        p_dias: p.dias,
        p_solo: p.solo,
        p_fuera: p.fuera,
        p_productos: p.productos,
        p_claure: p.claure,
        p_sede_ids: p.sedes,
        ...(p.monto ? { p_tipo: "monto", p_cuenta: p.monto.cuenta, p_cede_a_otras: false } : {}),
      } as never)) as unknown as { data: FilaChoque[] | null; error: { message: string } | null };
      if (vigente) setRespuesta({ clave, version: p.version, filas: error ? null : (data ?? []) });
    }, 350);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
    // `clave` resume la pregunta; `version` vuelve a preguntar tras guardar, activar o retirar otra oferta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, p.version]);
  return p.activo && respuesta?.clave === clave && respuesta.version === p.version ? respuesta.filas : null;
}

/** Los choques de la oferta, cada uno con lo que se puede hacer. Sin choques (y ya leído), una línea tranquila. Un monto (actividad 8) suma
 *  su salida: «que las prendas con otra oferta no cuenten» (`monto.cede`), que resuelve todo choque que no sea con otro monto. */
export function ChoquesDeOferta({
  choques,
  leido,
  cedeA,
  onCeder,
  monto = null,
}: {
  choques: readonly Choque[];
  leido: boolean;
  cedeA: readonly string[];
  onCeder: (id: string, cede: boolean) => void;
  monto?: { cede: boolean; onCeder: (cede: boolean) => void } | null;
}) {
  if (!leido) return null;
  if (choques.length === 0) {
    return (
      <p className="of-pequeno mt-2" aria-live="polite">
        No choca con otra oferta: en esas tiendas y días, sus prendas no tienen otra.
      </p>
    );
  }
  return (
    <div className="of-avisos mt-3" aria-live="polite">
      {choques.map((c) => {
        const noCuentan = monto !== null && monto.cede && !c.esMonto;
        const resuelto = choqueResuelto(c, cedeA, monto?.cede ?? false);
        const elegida = cedeA.includes(c.id);
        return (
          <Aviso
            key={`${c.tipo}-${c.id}`}
            tono={resuelto ? "info" : "atencion"}
            chico
            titulo={tituloDeChoque(c)}
          >
            {noCuentan
              ? c.todaLaTienda
                ? `Esas prendas no cuentan para el monto. Ojo: «${c.nombre}» las tiene todas en ${c.tiendas.join(", ")}, así que ahí el monto no le llegará a nadie.`
                : "Esas prendas no cuentan para el monto: no reciben los dos descuentos."
              : elegida
                ? `Donde las dos valdrían, vale esta oferta y «${c.nombre}» se calla. En lo demás, «${c.nombre}» sigue igual.`
                : fraseDeChoque(c)}
            {/* Bajo la frase, no al costado: en el teléfono el costado le quitaba el ancho al texto. */}
            {(monto !== null && !c.esMonto) || (c.tipo === "oferta" && !c.estaCede) ? (
              <span className="mt-2 flex flex-wrap gap-2">
                {monto !== null && !c.esMonto && (
                  <button type="button" className="pildora-cayla" aria-pressed={monto.cede} onClick={() => monto.onCeder(!monto.cede)}>
                    Que las prendas con otra oferta no cuenten
                  </button>
                )}
                {c.tipo === "oferta" && !c.estaCede && !noCuentan && (
                  <button type="button" className="pildora-cayla" aria-pressed={elegida} onClick={() => onCeder(c.id, !elegida)}>
                    Que «{c.nombre}» ceda
                  </button>
                )}
              </span>
            ) : null}
          </Aviso>
        );
      })}
    </div>
  );
}
