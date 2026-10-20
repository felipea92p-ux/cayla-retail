"use client";

import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { resumenPuntosCaja } from "@/lib/club-acciones";
import { hoyLima } from "@/lib/fechas-lima";
import { PUNTOS_SIN_LEER, puntosDeLaFicha, type PuntosDeLaFicha as Puntos } from "@/lib/club-puntos-ficha-reglas";

// Los puntos del Club en la ficha de un miembro (pestaña «Club»): cuántos tiene y cuánto valen, su regalo de cumpleaños y sus
// cupones vivos con su código. Los lee `resumen_puntos_caja` (la misma lectura de la caja; con el módulo Clientes basta). Qué
// se dice vive en `lib/club-puntos-ficha-reglas.ts`.
//
// Vive aparte de `ClientaFichaModal.tsx` (como `HistoriaPermisos`): vuelve a leer cuando cambia `clave` (la versión de la ficha),
// así un cumpleaños recién editado cambia lo que dice del regalo. Si la lectura falla, la ficha sigue igual y lo dice aquí
// (principio 9); sin ficha de miembro no se dibuja nada.

type EstadoPuntos = { tipo: "leyendo" } | { tipo: "listo"; puntos: Puntos | null } | { tipo: "sin_leer" };

/** La lectura de sus puntos (la misma de la caja). Vive aparte del bloque para que la hoja use el mismo dato en la cifra de arriba
 *  y en el bloque de abajo sin leerlo dos veces. `activo` = false no lee nada (una ficha sin club no tiene puntos). */
export function usePuntosDeLaFicha(clientaId: string, clave: number, cumpleMes: number | null, activo = true): EstadoPuntos {
  const [estado, setEstado] = useState<EstadoPuntos>({ tipo: "leyendo" });

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    resumenPuntosCaja(clientaId)
      .then(({ resumen, error }) => {
        if (!vigente) return;
        setEstado(error ? { tipo: "sin_leer" } : { tipo: "listo", puntos: puntosDeLaFicha(resumen, { cumpleMes }, hoyLima()) });
      })
      .catch(() => {
        if (vigente) setEstado({ tipo: "sin_leer" });
      });
    return () => {
      vigente = false;
    };
  }, [clientaId, clave, cumpleMes, activo]);

  return estado;
}

export function PuntosDeLaFicha({ estado }: { estado: EstadoPuntos }) {
  if (estado.tipo === "leyendo") return null;
  if (estado.tipo === "sin_leer") {
    return (
      <Aviso tono="atencion" chico guia="clientas.ficha-puntos">
        {PUNTOS_SIN_LEER}
      </Aviso>
    );
  }
  const p = estado.puntos;
  if (!p) return null;

  return (
    <div className="card-cayla divide-y divide-sand" data-guia="clientas.ficha-puntos">
      <Fila etiqueta="Puntos">
        <p className="text-sm text-tinta">
          <b className="font-semibold tabular-nums">{p.destacado}</b>
          <span className="text-tinta/70"> · {p.resto}</span>
        </p>
        <span className="text-xs text-tinta/55">{p.bajada}</span>
      </Fila>

      {p.regalo && (
        <Fila etiqueta="Cumpleaños">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta/80">
            {p.regalo.titulo && <Chip tono={p.regalo.leToca ? "verde" : "neutro"}>{p.regalo.titulo}</Chip>}
            <span>{p.regalo.texto}</span>
          </p>
        </Fila>
      )}

      <Fila etiqueta="Cupones">
        {p.cupones.length > 0 && (
          <ul className="space-y-1">
            {p.cupones.map((c) => (
              <li key={c.codigo} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="font-mono font-semibold tracking-wide text-tinta">{c.codigo}</span>
                <span className="text-tinta/70">{c.detalle}</span>
                {c.venceProximo && <Chip tono="ambar">Por vencer</Chip>}
              </li>
            ))}
          </ul>
        )}
        <span className={p.cupones.length > 0 ? "text-xs text-tinta/55" : "text-sm text-tinta/70"}>{p.notaCupones}</span>
      </Fila>
    </div>
  );
}

/** Una fila de la tarjeta, con la misma forma que las de «Club» y «Publicidad» de la ficha. */
function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-1.5 p-4 sm:grid-cols-[7.5rem_1fr] sm:items-start">
      <span className="label-cayla text-[10.5px] text-tinta/55 sm:pt-0.5">{etiqueta}</span>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}
