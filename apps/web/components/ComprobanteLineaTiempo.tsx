"use client";

import { useState } from "react";
import { Banknote, Check, FileText, Package } from "lucide-react";
import { RellenoAvance } from "@/components/ComprobanteAvance";
import type { EstadoNodo, LineaTiempo, NodoLinea } from "@/lib/comprobante-linea-tiempo";

// La línea de tiempo del detalle (ADR-0136): Registrado → Mercadería → Pago. Un nodo por hito —verde = hecho,
// ámbar = a medias, vacío = pendiente— y un conector entre cada par que se llena hasta el avance real.
// El QUÉ (estado de cada nodo, cuánto se llena cada conector, el texto de fechas) lo decide
// `lib/comprobante-linea-tiempo.ts`; acá solo se dibuja. Recibe un objeto plano, así el Server Component del
// detalle puede calcularlo y pasárselo sin arrastrar funciones a la frontera cliente.
//
// Movimiento: el nodo hace un «pop» cuando su estado cambia (p. ej. al saldarse el pago tras `router.refresh()`,
// que deja el componente montado) y su tilde se traza. Al abrir, no: el detalle ya entra en cascada.

const ICONOS: Record<NodoLinea["clave"], typeof Package> = { registrado: FileText, mercaderia: Package, pago: Banknote };
const ORDEN_ESTADO: Record<EstadoNodo, number> = { pendiente: 0, parcial: 1, hecho: 2 };

export function ComprobanteLineaTiempo({ linea }: { linea: LineaTiempo }) {
  const [n1, n2, n3] = linea.nodos;
  const [c1, c2] = linea.conectores;
  return (
    <div className="cd-linea-tiempo" role="list" aria-label="Avance del comprobante">
      <Nodo nodo={n1} />
      <Conector conector={c1} />
      <Nodo nodo={n2} />
      <Conector conector={c2} />
      <Nodo nodo={n3} />
    </div>
  );
}

function Conector({ conector }: { conector: LineaTiempo["conectores"][number] }) {
  return (
    <div className="cd-cnx" aria-hidden>
      <RellenoAvance avance={conector.avance} tono={conector.tono} />
    </div>
  );
}

function Nodo({ nodo }: { nodo: NodoLinea }) {
  // «Pop» solo cuando el estado AVANZA (no al abrir, no si retrocede por una nota de crédito anulada…):
  // se detecta comparando con el estado de la pintada anterior, sin efectos.
  const [previo, setPrevio] = useState<EstadoNodo>(nodo.estado);
  const [pon, setPon] = useState(false);
  if (nodo.estado !== previo) {
    setPrevio(nodo.estado);
    setPon(ORDEN_ESTADO[nodo.estado] > ORDEN_ESTADO[previo]);
  }
  const Icono = nodo.estado === "hecho" && nodo.clave !== "registrado" ? Check : ICONOS[nodo.clave];
  return (
    <div className="cd-nodo" data-estado={nodo.estado} role="listitem">
      <div className={`cd-pt ${pon ? "anim-pop" : ""}`} onAnimationEnd={() => setPon(false)}>
        {/* Al pasar a «hecho» el ícono cambia de componente (Package/Banknote → Check): React lo monta de nuevo y el tilde se traza (`check-trazo`). */}
        <Icono aria-hidden className={`h-[15px] w-[15px] ${Icono === Check ? "check-trazo" : ""}`} style={{ "--d": "250ms" } as React.CSSProperties} />
      </div>
      <p className="label-cayla text-[11px] text-tinta/65">{nodo.titulo}</p>
      <p className="-mt-1 text-xs text-tinta/55">{nodo.detalle}</p>
    </div>
  );
}
