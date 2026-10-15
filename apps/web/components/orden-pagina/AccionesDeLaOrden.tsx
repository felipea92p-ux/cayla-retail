"use client";

import { useState } from "react";
import { AnularLaOrdenModal } from "@/components/orden-pagina/AnularLaOrdenModal";
import { PasarAlStockModal } from "@/components/orden-pagina/PasarAlStockModal";
import { RevertirLaOrdenModal } from "@/components/orden-pagina/RevertirLaOrdenModal";
import { Boton } from "@/components/ui/campos";
import { queSigue, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// Las salidas de la orden, en la cabecera (ADR-0400, actividad 6): «Pasar al stock» cuando todas las fases terminaron (una muestra: «Terminar muestra»), «Anular orden» mientras está en proceso y
// «Revertir el cierre» cuando ya pasó al stock. Las tres se hacen aquí mismo, en una hoja; ya no mandan al cajón de la lista. Solo quien puede operar la orden las ve; la base vuelve a comprobarlo
// (`fn_puede_operar_ubicacion`) y pone sus candados (buenas, prendas afuera).

type Hoja = "stock" | "anular" | "revertir";

export function AccionesDeLaOrden({ datos }: { datos: OrdenPagina }) {
  const [hoja, setHoja] = useState<Hoja | null>(null);
  if (!datos.permisos.puedeOperar || datos.orden.estado === "anulada") return null;
  const enProceso = datos.orden.estado === "en_proceso";
  const alStock = enProceso && queSigue(datos.fases, datos.orden.estado).accion === "pasar_al_stock";
  const cierra = () => setHoja(null);
  return (
    <div data-guia="prod-orden.acciones" className="flex flex-wrap items-center gap-2">
      {enProceso ? (
        <>
          <Boton peso="peligro" aria-haspopup="dialog" data-guia="prod-orden.anular-orden" onClick={() => setHoja("anular")}>
            Anular orden
          </Boton>
          {alStock && (
            <Boton peso="primario" aria-haspopup="dialog" data-guia="prod-orden.pasar-al-stock" onClick={() => setHoja("stock")}>
              {datos.orden.esMuestra ? "Terminar muestra" : "Pasar al stock"}
            </Boton>
          )}
        </>
      ) : (
        <Boton peso="fantasma" aria-haspopup="dialog" data-guia="prod-orden.revertir" onClick={() => setHoja("revertir")}>
          Revertir el cierre
        </Boton>
      )}
      {hoja === "stock" && <PasarAlStockModal datos={datos} onClose={cierra} />}
      {hoja === "anular" && <AnularLaOrdenModal datos={datos} onClose={cierra} />}
      {hoja === "revertir" && <RevertirLaOrdenModal datos={datos} onClose={cierra} />}
    </div>
  );
}
