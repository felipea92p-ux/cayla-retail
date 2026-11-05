"use client";

import { Lock } from "lucide-react";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { totalDelEje, type QueHaceAlQuitar } from "@/lib/quitar-variante-reglas";

// La hoja del tacho de un color o de una talla (ADR-0494, actividad 3; maqueta `docs/maquetas/stock-solo-en-existencias-2026-10/`).
//
// Quitar nunca borra: las variantes se desactivan y conservan su historia. Pero desactivar una que todavía tiene unidades deja ese stock
// en algo que ya no se vende y que nadie ve. Por eso, con unidades, esta hoja NO deja quitar: dice cuántas hay y lleva a dejarlas en 0
// en Existencias. Con 0 pide confirmar el archivado (se deshace hasta «Revisar y guardar»).

export function QuitarVarianteHoja({
  que,
  nombre,
  decision,
  hrefAjustar,
  onArchivar,
  onCerrar,
}: {
  /** «el color» o «la talla», para las frases. */
  que: "color" | "talla";
  /** «Beige» o «S». */
  nombre: string;
  decision: Exclude<QueHaceAlQuitar, { tipo: "directo" }>;
  /** El enlace a «Ajustar stock» en la talla que tiene unidades aquí; `null` = esta cuenta no ajusta, o las unidades están en otras sedes. */
  hrefAjustar: string | null;
  onArchivar: () => void;
  onCerrar: () => void;
}) {
  if (decision.tipo === "bloqueado") {
    const total = totalDelEje(decision);
    const otras = decision.enOtrasSedes;
    const titulo = `${que === "color" ? nombre : `La talla ${nombre}`} tiene ${total} ${total === 1 ? "unidad" : "unidades"}`;
    return (
      <Modal titulo={titulo} subtitulo="No se puede archivar con unidades" onClose={onCerrar} tamano="angosta">
        <div className="space-y-4">
          <div className="flex gap-3 text-sm text-tinta/80">
            <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-hueso text-tinta">
              <Lock className="h-4 w-4" />
            </span>
            <div className="space-y-2">
              <p>
                Para archivar {que === "color" ? "el color" : "la talla"}, primero déjalo en <b>0</b> en Existencias. Así <b>no queda stock escondido</b> en algo que ya no
                se vende.
              </p>
              {otras.length > 0 && (
                <p>
                  {decision.enEstaSede > 0 ? "Además, hay " : "Las unidades están en "}
                  {otras.map((o) => `${o.cantidad} en ${o.nombre}`).join(" y ")}: se dejan en 0 desde esa sede.
                </p>
              )}
              {!hrefAjustar && decision.enEstaSede === 0 && otras.length === 0 && <p>Pide a quien ajusta el stock que las deje en 0.</p>}
            </div>
          </div>
          <PieAcciones>
            <Boton type="button" peso="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            {hrefAjustar && (
              <BotonEnlace peso="primario" href={hrefAjustar}>
                Llevarlo a 0 en Existencias
              </BotonEnlace>
            )}
          </PieAcciones>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo={`¿Archivar ${que === "color" ? nombre : `la talla ${nombre}`}?`} subtitulo="Deja de venderse; no se borra" onClose={onCerrar} tamano="angosta">
      <div className="space-y-4">
        <p className="text-sm text-tinta/80">
          Sus ventas, etiquetas y movimientos se quedan. Se confirma con «Revisar y guardar», y hasta entonces puedes deshacerlo.
          {decision.sinDato && " No se pudo leer cuántas unidades tiene: revisa en Existencias que esté en 0."}
        </p>
        <PieAcciones>
          <Boton type="button" peso="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            type="button"
            peso="peligro"
            onClick={() => {
              onArchivar();
              onCerrar();
            }}
          >
            Archivar
          </Boton>
        </PieAcciones>
      </div>
    </Modal>
  );
}
