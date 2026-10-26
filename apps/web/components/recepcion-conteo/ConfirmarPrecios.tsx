"use client";

import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { textoCambioDePrecio, type CambioDePrecio } from "@/lib/recepcion-conteo-reglas";

// «Vas a cambiar precios»: lo que cambia, antes de guardar (el cierre del envío, y «Hacer ahora» en «Para después»). Es dinero, así que
// se lee y se confirma. Va FUERA del <form> de quien la abre (ADR-0128): un clic o una tecla de la hoja no debe llegar al envío.

const AVISO_CIERRE = "El costo cambia lo que cuesta lo que entra en este envío. El precio de venta rige desde ahora: lo ya vendido no cambia. Los dos quedan en el historial.";

export function ConfirmarPrecios({
  cambios,
  sede,
  subtitulo,
  aviso = AVISO_CIERRE,
  textoConfirmar,
  textoCargando,
  cargando,
  onCancelar,
  onConfirmar,
}: {
  cambios: readonly CambioDePrecio[];
  sede: string;
  subtitulo: string;
  /** Lo que hay que saber de este dinero; por defecto, lo del cierre (compra y venta). */
  aviso?: string;
  textoConfirmar: string;
  textoCargando: string;
  cargando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Modal titulo={cambios.some((c) => c.tipo === "compra") ? "Vas a cambiar costos y precios" : "Vas a cambiar precios"} subtitulo={subtitulo} onClose={onCancelar} bloqueado={cargando} tamano="mediana">
      <div className="space-y-4">
        {(["compra", "venta"] as const).map((tipo) => {
          const lista = cambios.filter((c) => c.tipo === tipo);
          if (lista.length === 0) return null;
          return (
            <div key={tipo} className="space-y-1.5">
              <p className="text-xs font-semibold text-tinta">{tipo === "compra" ? "Costo" : "Precio de venta"}</p>
              <ul className="divide-y divide-sand rounded-xl border border-sand">
                {lista.map((c) => (
                  <li key={`${tipo}-${c.nombre}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="font-medium text-tinta">{c.nombre}</span>
                    <span className="tabular-nums text-taupe">{textoCambioDePrecio(c, sede)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <Aviso tono="atencion" chico titulo="Es dinero">
          {aviso}
        </Aviso>
        <PieAcciones>
          <Boton type="button" peso="fantasma" disabled={cargando} onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton type="button" peso="primario" cargando={cargando} textoCargando={textoCargando} onClick={onConfirmar}>
            {textoConfirmar}
          </Boton>
        </PieAcciones>
      </div>
    </Modal>
  );
}
