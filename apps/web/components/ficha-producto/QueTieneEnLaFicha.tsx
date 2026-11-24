"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { QueTieneLaPrenda } from "@/components/QueTieneLaPrenda";
import { useReglasDePrecio } from "@/components/ReglasDePrecio";
import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { eleccionParaGuardar, type EleccionDeRasgos, type Rasgo } from "@/lib/margen-por-rasgos";

// «¿Qué tiene esta prenda?» en Editar producto (ADR-0700, actividad 5).
//
// CONTRATO. PROMETE: las casillas de la prenda, cada una con lo que suma al margen; marcar o desmarcar una la guarda al momento con
//   `guardar_rasgos_de_producto`, firmada por el responsable de la ficha, y avisa. Si la base dice que no, la casilla vuelve a como estaba.
//   Va aparte del «Revisar y guardar» de la ficha, como «Cómo lo llama el proveedor»: no cambia el precio, el stock ni el nombre; solo el
//   objetivo con que se mide el margen. ASUME: `rasgos` es lo que la prenda tiene en efecto con la ficha como está (tejido y marca de la
//   pantalla), y quien la monta ve el costo (sin costo, el objetivo no se ve en ninguna parte). NO HACE: nunca cambia un precio.

export function QueTieneEnLaFicha({
  productoId,
  eleccion,
  onEleccion,
  rasgos,
  firma,
  listo,
  motivoSinFirma,
}: {
  productoId: string;
  eleccion: EleccionDeRasgos;
  onEleccion: (e: EleccionDeRasgos) => void;
  rasgos: readonly Rasgo[];
  firma: () => Firma | null;
  listo: boolean;
  motivoSinFirma?: string | null;
}) {
  const [guardando, setGuardando] = useState(false);
  const { casillas } = useReglasDePrecio();

  async function cambiar(r: Rasgo, valor: boolean) {
    if (!listo) {
      avisar.error(motivoSinFirma ?? "Elige quién hace este cambio.");
      return;
    }
    const antes = eleccion;
    const nueva = { ...eleccion, [r]: valor };
    const params = eleccionParaGuardar(nueva, casillas);
    if (!params) return;
    // La casilla se ve marcada al instante; mientras guarda, todas esperan (dos toques seguidos no se cruzan).
    onEleccion(nueva);
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("guardar_rasgos_de_producto" as never, { p_producto_id: productoId, ...params } as never), firma());
    setGuardando(false);
    if (error) {
      onEleccion(antes);
      avisar.error(traducirError(error, "guardar lo que tiene la prenda"));
      return;
    }
    avisar.exito(valor ? "Guardado: suma a su margen objetivo." : "Guardado: ya no suma a su margen objetivo.");
  }

  return (
    <div>
      <p className="campo-etiqueta">¿Qué tiene esta prenda?</p>
      <div className="mt-2 max-w-xl">
        <QueTieneLaPrenda rasgos={rasgos} alCambiar={(r, v) => void cambiar(r, v)} guia="editar.que-tiene" disabled={guardando} />
      </div>
    </div>
  );
}
