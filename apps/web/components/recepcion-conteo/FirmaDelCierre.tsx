"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import type { FilaDeLaFirma } from "@/lib/recepcion-conteo-reglas";

// La firma del cierre (Felipe 2026-11-16, maqueta `docs/maquetas/recibir-cierre-recibo-2026-11/`, ficha `docs/milimetro/cierre-de-envio.md`): solo cuando
// algo no cuadró con la guía, una hoja corta dice qué pasa al cerrar —qué entra al almacén y qué pasa a Compras— y quién firma. Felipe: «hay mucho
// texto»: una palabra y un número por fila, sin bajada. Lo normal (todo cuadra) se cierra de un toque, sin esta hoja.

/** Lo que pasa al cerrar, en filas de palabra y número. También va arriba de «Vas a cambiar precios» cuando el cierre cambia precios. */
export function ResumenDelCierre({ filas }: { filas: readonly FilaDeLaFirma[] }) {
  return (
    <dl className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand">
      {filas.map((f) => (
        <div key={f.texto} className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm font-semibold text-tinta">{f.texto}</dt>
          <dd className={`font-display text-[22px] leading-none tabular-nums ${f.tono === "ambar" ? "text-ambar" : "text-tinta"}`}>{f.cifra}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FirmaDelCierre({
  numero,
  filas,
  quien,
  cargando,
  onCancelar,
  onConfirmar,
}: {
  numero: string;
  filas: readonly FilaDeLaFirma[];
  /** Quien cierra (el responsable elegido), con su avatar; `null` si no se sabe. */
  quien: { personaId: string | null; nombre: string } | null;
  cargando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Modal titulo={`¿Cerrar ${numero}?`} onClose={onCancelar} bloqueado={cargando}>
      {(cerrar): ReactNode => (
        <div className="space-y-4">
          <ResumenDelCierre filas={filas} />
          {quien && (
            <p className="flex items-center gap-2.5 text-sm text-tinta">
              <AvatarPersona personaId={quien.personaId} nombre={quien.nombre} tamano={32} />
              {quien.nombre}
            </p>
          )}
          <PieAcciones>
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={cargando}>
              Cancelar
            </Boton>
            <Boton type="button" peso="primario" cargando={cargando} textoCargando="Cerrando…" onClick={onConfirmar}>
              <span className="inline-flex items-center gap-1.5">
                <Check aria-hidden className="h-4 w-4" />
                Cerrar y firmar
              </span>
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
