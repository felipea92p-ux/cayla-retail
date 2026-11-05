"use client";

import { useState } from "react";
import { AnotarLoUsadoModal } from "@/components/orden-pagina/AnotarLoUsadoModal";
import { AnularLaOrdenModal } from "@/components/orden-pagina/AnularLaOrdenModal";
import { CambiarTipoModal } from "@/components/orden-pagina/CambiarTipoModal";
import { EditarTelaModal } from "@/components/orden-pagina/EditarTelaModal";
import { PasarAlStockModal } from "@/components/orden-pagina/PasarAlStockModal";
import { RevertirLaOrdenModal } from "@/components/orden-pagina/RevertirLaOrdenModal";
import { Boton } from "@/components/ui/campos";
import { queSigue, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import type { DatosEditarTela } from "@/lib/orden-tela-editar-reglas";
import { destinoDeTipo } from "@/lib/orden-tipo-reglas";

// Las salidas de la orden, en la cabecera (ADR-0400, actividad 6): «Pasar al stock» cuando todas las fases terminaron (una muestra: «Terminar muestra»), «Anular orden» mientras está en proceso y
// «Revertir el cierre» cuando ya pasó al stock. Mientras está en proceso también se corrige su tipo (ADR-0581): «Pasar a lote de producción» si se abrió como muestra, «Pasar a muestra» si fue al
// revés; una vez cerrada ya no, porque lo que entró al stock (o no entró) ya pasó. Las tres se hacen aquí mismo, en una hoja; ya no mandan al cajón de la lista. Solo quien puede operar la orden las ve; la base vuelve a comprobarlo
// (`fn_puede_operar_ubicacion`) y pone sus candados (buenas, prendas afuera, y desde ADR-0570 la tela sin anotar). Desde «Pasar al stock», la tela sin anotar abre «¿Cuánto quedó en el estante?»
// en lugar de esa hoja (un líder puede, además, dejarla pasar sin tela con su porqué), y la orden que no declaró ninguna tela abre «Declarar tela y avíos».

type Hoja = "stock" | "anular" | "revertir" | "tela" | "declarar" | "tipo";

export function AccionesDeLaOrden({
  datos,
  edicion = null,
  esLider = false,
}: {
  datos: OrdenPagina;
  /** Lo que la hoja «Editar tela y avíos» necesita; null si la cuenta no puede editarla. Con ello, el aviso «no declaró qué tela lleva» de «Pasar al stock» ofrece declararla. */
  edicion?: DatosEditarTela | null;
  /** La cuenta es líder: en «Pasar al stock» puede dejar pasar una orden sin tela, con su porqué (ADR-0570, actividad 4). La base lo vuelve a comprobar. */
  esLider?: boolean;
}) {
  const [hoja, setHoja] = useState<Hoja | null>(null);
  if (!datos.permisos.puedeOperar || datos.orden.estado === "anulada") return null;
  const enProceso = datos.orden.estado === "en_proceso";
  const alStock = enProceso && queSigue(datos.fases, datos.orden.estado).accion === "pasar_al_stock";
  const cierra = () => setHoja(null);
  return (
    <div data-guia="prod-orden.acciones" className="flex flex-wrap items-center gap-2">
      {enProceso ? (
        <>
          <Boton peso="fantasma" aria-haspopup="dialog" data-guia="prod-orden.cambiar-tipo" onClick={() => setHoja("tipo")}>
            {destinoDeTipo(datos.orden.esMuestra).boton}
          </Boton>
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
      {hoja === "stock" && (
        <PasarAlStockModal
          datos={datos}
          onClose={cierra}
          esLider={esLider}
          alAnotarTela={() => setHoja("tela")}
          alDeclararTela={edicion ? () => setHoja("declarar") : undefined}
        />
      )}
      {hoja === "declarar" && edicion && <EditarTelaModal datos={datos} edicion={edicion} onClose={cierra} />}
      {hoja === "tela" && <AnotarLoUsadoModal datos={datos} onClose={cierra} />}
      {hoja === "tipo" && <CambiarTipoModal datos={datos} onClose={cierra} />}
      {hoja === "anular" && <AnularLaOrdenModal datos={datos} onClose={cierra} />}
      {hoja === "revertir" && <RevertirLaOrdenModal datos={datos} onClose={cierra} />}
    </div>
  );
}
