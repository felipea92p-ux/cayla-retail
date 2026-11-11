"use client";

import type { ReactNode } from "react";
import { ListChecks } from "lucide-react";
import { BarraDeAbajo, BarraDeAbajoResumen } from "@/components/ui/BarraDeAbajo";
import { Modal } from "@/components/ui/Modal";
import { conMiles, type CifrasDelResumen } from "@/lib/recepcion-modelos-reglas";

// Contar en el celular (ADR-0645, Felipe 2026-11-11): en la pantalla queda el contador, que es lo que se toca; la lista del envío se abre en una hoja que sube desde el
// borde, y abajo flota la isla con cómo va todo y el botón que la abre. Apiladas, la lista medía 800 px y había que pasarla entera para llegar al contador, y volver a
// subir para cambiar de modelo. Con todo contado, la isla trae «Revisar y cerrar». Solo bajo 640 px: desde ahí las dos mitades van una al lado de la otra o apiladas.

/** La isla de abajo: cuánto falta y la puerta a la lista. Oscura, porque dice lo que llevas contado (la pieza `barra-movil`). */
export function IslaDelEnvio({ cifras, sinAviso, todoContado, listaAbierta, cierre, onLista }: { cifras: CifrasDelResumen; sinAviso: boolean; todoContado: boolean; /** Con la hoja de la lista abierta el botón deja de ser pieza de la guía: el piloto la abre una vez, no en cada paso. */ listaAbierta: boolean; /** «Revisar y cerrar», cuando ya no queda nada por contar. */ cierre: ReactNode; onLista: () => void }) {
  const porContar = cifras.estados["por-contar"];
  const dijeron = sinAviso ? null : cifras.dijeron;
  const lista = (
    <span className="inline-flex items-center gap-2">
      <ListChecks aria-hidden className="h-4 w-4 shrink-0" />
      Lista
    </span>
  );
  // Con todo contado, la isla son sus dos botones en una fila: lo que falta ya no hay que decirlo, y «Revisar y cerrar» es lo que toca.
  if (todoContado) {
    return (
      <BarraDeAbajo tono="tinta" role="region" aria-label="Cómo va el envío" className="rc-isla sm:hidden" data-guia="recepcion.isla">
        <button type="button" className="btn-cayla btn-secundario" aria-label="Ver la lista del envío" data-guia={listaAbierta ? undefined : "recepcion.lista-abrir"} onClick={onLista}>
          {lista}
        </button>
        <div className="barra-abajo-acciones">{cierre}</div>
      </BarraDeAbajo>
    );
  }
  return (
    <BarraDeAbajo tono="tinta" role="region" aria-label="Cómo va el envío" className="rc-isla sm:hidden" data-guia="recepcion.isla">
      <BarraDeAbajoResumen
        cifra={`${conMiles(porContar)} por contar`}
        detalle={dijeron != null ? `${conMiles(cifras.contadas)} de ${conMiles(dijeron)} prendas` : `${conMiles(cifras.contadas)} ${cifras.contadas === 1 ? "prenda" : "prendas"}`}
      />
      <div className="barra-abajo-acciones">
        <button type="button" className="btn-cayla btn-primario" aria-label="Ver la lista del envío" data-guia={listaAbierta ? undefined : "recepcion.lista-abrir"} onClick={onLista}>
          {lista}
        </button>
      </div>
    </BarraDeAbajo>
  );
}

/** La lista del envío en su hoja. Adentro va la misma lista de escritorio (`enHoja`): elegir un modelo la cierra y deja el contador a la vista. */
export function HojaDeLaLista({ titulo, cuantos, children, onCerrar }: { titulo: string; cuantos: string; children: ReactNode; onCerrar: () => void }) {
  return (
    <Modal titulo={titulo} subtitulo={cuantos} tamano="mediana" conCerrar onClose={onCerrar}>
      {children}
    </Modal>
  );
}
