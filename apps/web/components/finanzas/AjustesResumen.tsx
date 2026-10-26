"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Interruptor } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { SLOT_AJUSTES_RESUMEN } from "@/components/finanzas/telar/MesaDeMando";
import { cambiaAlgo, conCampana, type AjustesResumen as Ajustes } from "@/lib/ajustes-resumen-reglas";
import type { CampanaInversion } from "@/lib/inversion-mercaderia-reglas";

// «Qué se ve» en el Resumen de Finanzas (Felipe 2026-10-26): un ícono junto al selector de mes, SOLO en esta pantalla, que abre la hoja con los
// interruptores de la inversión en mercadería. Se cuelga de la barra común por un portal (la barra es de los seis submódulos y no sabe nada de
// esta pantalla). Solo existe si el Plan entrega campañas: sin ellas no hay nada que mostrar ni esconder, y un ícono vacío confunde.

export function AjustesResumen({ campanas, ajustes, onCambiar }: { campanas: readonly CampanaInversion[]; ajustes: Ajustes; onCambiar: (a: Ajustes) => void }) {
  const [lugar, setLugar] = useState<HTMLElement | null>(null);
  const [abierta, setAbierta] = useState(false);
  // La barra se dibuja dentro de un Suspense (lee la URL): puede llegar DESPUÉS que esta pantalla, así que si el lugar aún no está se espera a que aparezca.
  useEffect(() => {
    const buscar = () => document.getElementById(SLOT_AJUSTES_RESUMEN);
    const ya = buscar();
    if (ya) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- el lugar es un elemento de OTRA parte de la página (la barra del telar): solo se encuentra en el navegador, después de montar
      setLugar(ya);
      return;
    }
    const mira = new MutationObserver(() => {
      const llego = buscar();
      if (llego) {
        setLugar(llego);
        mira.disconnect();
      }
    });
    mira.observe(document.body, { childList: true, subtree: true });
    return () => mira.disconnect();
  }, []);
  if (!lugar || !campanas.length) return null;
  const distinto = cambiaAlgo(ajustes);
  return (
    <>
      {createPortal(
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label="Qué se ve en el Resumen"
          title={distinto ? "Qué se ve en el Resumen (hay cosas escondidas)" : "Qué se ve en el Resumen"}
          data-guia="fin-resumen.ajustes"
          className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/60 transition-colors duration-200 ease-cayla hover:bg-hueso hover:text-tinta"
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
          {distinto && <span aria-hidden className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-ambar" />}
        </button>,
        lugar,
      )}
      {abierta && (
        <Modal titulo="Qué se ve en el Resumen" subtitulo="Solo para esta pantalla. Esconder no borra nada: la campaña sigue en el Plan de campaña y en Compras." onClose={() => setAbierta(false)} conCerrar tamano="angosta">
          <div className="space-y-4">
            <Interruptor
              activo={ajustes.global}
              onActivo={(v) => onCambiar({ ...ajustes, global: v })}
              etiqueta={<b className="text-tinta">Inversión en mercadería</b>}
              pie="Apagado: el bloque no aparece, y la caja no cuenta lo que aún no pediste. Lo ya pedido sigue en Por pagar."
            />
            <div className={`space-y-3 border-l border-sand pl-4 ${ajustes.global ? "" : "opacity-50"}`}>
              {campanas.map((c) => (
                <Interruptor
                  key={c.id}
                  disabled={!ajustes.global}
                  activo={!ajustes.ocultas.includes(c.id)}
                  onActivo={(v) => onCambiar(conCampana(ajustes, c.id, v))}
                  etiqueta={c.nombre}
                  pie="Se ve en este navegador; hasta que el Plan guarde esta elección para todos."
                />
              ))}
            </div>
            <Interruptor
              activo={ajustes.enCaja}
              onActivo={(v) => onCambiar({ ...ajustes, enCaja: v })}
              etiqueta="Contar la compra en «Tu caja»"
              pie="Muestra cómo cambia tu caja con lo que falta pedir. Es una proyección, no un pago."
            />
            <Interruptor activo={ajustes.conIgv} onActivo={(v) => onCambiar({ ...ajustes, conIgv: v })} etiqueta="Contar el IGV (18 %)" pie="De caja sale con IGV; ese IGV vuelve como crédito fiscal en la declaración siguiente." />
          </div>
        </Modal>
      )}
    </>
  );
}
