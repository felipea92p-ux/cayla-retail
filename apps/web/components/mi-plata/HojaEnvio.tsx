"use client";

import type { RefObject } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import {
  ESTADO_ENVIO,
  avisosDeEnvio,
  detalleDeEnvio,
  lineaDeTiempo,
  textoDeRondaDelEnvio,
  type EnvioMio,
} from "@/lib/mis-envios-reglas";
import { AccionesDelCodigo, CodigoDeEnvio } from "./CodigoDeEnvio";

// Mis envíos ▸ un envío (maqueta docs/maquetas/mis-compras-envios-2026-10/): el mismo detalle para cualquier ronda. El código grande
// con copiar y compartir, su historia (salió · la tienda lo cuenta · recibido), los avisos que piden hacer algo (nadie lo abrió hace
// días; la tienda contó menos), la cuenta como un cuaderno y lo que llevaba. Solo se lee: se cierra con la ×.
export function HojaEnvio({ e, hoy, onClose, volverA }: { e: EnvioMio; hoy?: string; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const estado = ESTADO_ENVIO[e.estado];
  const avisos = avisosDeEnvio(e, hoy);
  const filas: [string, string][] = [
    ["Prendas", String(e.prendas)],
    ["Fardos", String(e.fardos)],
    ["Ronda", textoDeRondaDelEnvio(e)],
  ];
  return (
    <Modal titulo={e.destino} onClose={onClose} variante="hoja" conCerrar alCerrarEnfocar={volverA}>
      <div className="space-y-4">
        <div className="flex flex-col items-stretch gap-2.5">
          <CodigoDeEnvio numero={e.numero} linea={detalleDeEnvio(e, hoy)} />
          <div className="flex justify-center">
            <Chip tono={estado.tono}>{estado.texto}</Chip>
          </div>
        </div>
        <AccionesDelCodigo envio={{ numero: e.numero, destino: e.destino, prendas: e.prendas, fardos: e.fardos }} />
        <ul className="envio-tiempo" aria-label="Cómo va el envío">
          {lineaDeTiempo(e, hoy).map((p) => (
            <li key={p.texto} data-paso={p.estado}>
              <span>{p.texto}</span>
            </li>
          ))}
        </ul>
        {avisos.map((a) => (
          <Aviso key={a.titulo} tono="atencion" titulo={a.titulo}>
            {a.texto}
          </Aviso>
        ))}
        <dl className="rounded-[14px] bg-hueso px-3.5 py-1.5 text-sm tabular-nums">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-t border-sand py-2 first:border-t-0">
              <dt className="text-taupe">{k}</dt>
              <dd className="text-right text-tinta">{v}</dd>
            </div>
          ))}
        </dl>
        {e.lineas.length > 0 && (
          <div>
            <TituloGrupo cuenta={e.lineas.length}>Lo que llevaba</TituloGrupo>
            <ul className="divide-y divide-sand">
              {e.lineas.map((l, i) => (
                <li key={`${l.nombre}-${i}`} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 text-tinta">{l.nombre}</span>
                  <span className="whitespace-nowrap tabular-nums text-tinta">× {l.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
