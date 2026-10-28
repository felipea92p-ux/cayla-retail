"use client";

import { useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { soles } from "@/lib/compras-reglas";
import {
  fraseOrigenDelCosto,
  fraseSinCosto,
  lineaAparte,
  PORQUE_NO_ES_EL_BALANCE,
  type VistaValor,
} from "@/lib/valor-inventario-reglas";

/* ====================================================================
   «Ver el valor a costo» de Existencias (ADR-0557, Felipe 2026-10-28)

   El valor de lo que hay en la sede es dinero que se mira cuando se necesita, no la primera cifra de la pantalla: se pide con un toque
   (el mismo gesto que «Ver el capital en insumos» del Taller, `InsumosPanel`). La página solo lo dibuja si la base lo entregó: la puerta
   (líder, o quien ve el dinero de Compras) está en `fn_valor_inventario_existencias`, no aquí, y el costo de cada prenda nunca llega al
   navegador, solo las sumas.

   Qué dice, y por qué así:
    · La cifra de la sede abierta, y —si quien mira es líder— el total de todas con lo que aporta cada una.
    · Lo que NO cuenta, a la vista (nunca solo al pasar el mouse): las prendas sin costo valen cero en la suma, y un total más bajo que
      parece completo es peor que uno que dice cuánto le falta. Su «Ver cuáles» las lleva a la lista (actividad 3 de ADR-0557).
    · De dónde sale el costo (cuánto es de una compra o de Producción y cuánto es el que se escribió al dar de alta la prenda).
    · Lo dañado y lo de CLAURE, aparte: no son plata de CAYLA lista para vender.
    · «¿Por qué no es el del Balance?» a un toque, para quien compare con Finanzas.
   ==================================================================== */

export function ValorInventarioExistencias({ vista }: { vista: VistaValor }) {
  const [abierto, setAbierto] = useState(false);
  const [porQue, setPorQue] = useState(false);
  const { sede, todas } = vista;

  if (!abierto) {
    return (
      <div data-guia="existencias.valor" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tinta/75">
        <button type="button" className="btn-enlace" aria-expanded={false} onClick={() => setAbierto(true)}>
          Ver el valor a costo
        </button>
      </div>
    );
  }

  const sinCosto = fraseSinCosto(sede.unidadesSinCosto, sede.tallasSinCosto);
  const origen = fraseOrigenDelCosto(sede.valor, sede.valorConCostoDeCompra);
  const aparte = [lineaAparte("Dañadas, aparte", sede.unidadesDanadas, sede.valorDanadas), lineaAparte("De CLAURE, aparte", sede.unidadesClaure, sede.valorClaure)].filter(
    (l): l is string => l !== null,
  );

  return (
    <section data-guia="existencias.valor" aria-label="Valor del inventario a costo" className="card-cayla anim-entra space-y-3 p-4 text-sm text-tinta/80">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p>
          Valor a costo · {sede.sede}:{" "}
          <b className="font-display text-xl tabular-nums text-tinta">{soles(sede.valor)}</b>
          <span className="text-tinta/60"> · {sede.unidades.toLocaleString("es-PE")} prendas</span>
        </p>
        <button type="button" className="btn-enlace text-xs" aria-expanded onClick={() => setAbierto(false)}>
          Ocultar
        </button>
      </div>

      {sinCosto && <Aviso tono="atencion" chico>{sinCosto}</Aviso>}
      {origen && <p className="nota-cayla">{origen}</p>}

      {aparte.length > 0 && (
        <ul className="space-y-0.5 text-tinta/70">
          {aparte.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      {todas && (
        <div className="space-y-1 border-t border-sand pt-3">
          <p>
            Todas las sedes: <b className="font-display text-lg tabular-nums text-tinta">{soles(todas.valor)}</b>
            <span className="text-tinta/60"> · {todas.unidades.toLocaleString("es-PE")} prendas</span>
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-tinta/70">
            {todas.porSede.map((s) => (
              <li key={s.sede} className="tabular-nums">
                {s.sede} {soles(s.valor)}
              </li>
            ))}
          </ul>
          {todas.tallasSinCosto > 0 && (
            <p className="text-tinta/70">
              {todas.tallasSinCosto.toLocaleString("es-PE")} {todas.tallasSinCosto === 1 ? "talla" : "tallas"} sin costo en total: no cuentan.
            </p>
          )}
        </div>
      )}

      <div>
        <button type="button" className="btn-enlace text-xs" aria-expanded={porQue} onClick={() => setPorQue((v) => !v)}>
          {porQue ? "Ocultar la explicación" : "¿Por qué no es el de Finanzas?"}
        </button>
        {porQue && <p className="nota-cayla mt-2">{PORQUE_NO_ES_EL_BALANCE}</p>}
      </div>
    </section>
  );
}
