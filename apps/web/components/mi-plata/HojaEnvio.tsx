"use client";

import { useRef, useState, type RefObject } from "react";
import { Ban } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Cajon } from "@/components/ui/Cajon";
import { Modal } from "@/components/ui/Modal";
import { useEnCelular } from "@/components/ui/useEnCelular";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import {
  ESTADO_ENVIO,
  avisosDeEnvio,
  detalleDeEnvio,
  lineaDeTiempo,
  textoDeRondaDelEnvio,
  type EnvioMio,
} from "@/lib/mis-envios-reglas";
import { sePuedeAnularEnvio } from "@/lib/envio-orden-reglas";
import { AnularEnvioModal } from "@/components/ordenes-compra/AnularEnvioModal";
import { AccionesDelCodigo, CodigoDeEnvio } from "./CodigoDeEnvio";

// Mis envíos ▸ un envío (maqueta docs/maquetas/mis-compras-envios-2026-10/): el mismo detalle para cualquier ronda. El código grande
// con copiar y compartir, su historia (salió · la tienda lo cuenta · recibido), los avisos que piden hacer algo (nadie lo abrió hace
// días; la tienda contó menos), la cuenta como un cuaderno y lo que llevaba. Se cierra con la ×. En el celular es la hoja de
// siempre (`Modal`); en PC (Felipe 2026-10-26, «A»), un cajón a la derecha con la lista viva detrás, el mismo del resto de Compras.
//
// Lo único que se hace aquí: «Anular envío», solo mientras va en camino (Felipe 2026-11-13: «que se pueda mientras en Recibir todavía dice
// "En camino"; si ya no, ya no»). Lo que llevaba vuelve a «Para mandar» y se manda otra vez con un código nuevo. La regla la hace cumplir
// la base (`anular_envio` rechaza un envío que la sede ya abrió); la pantalla solo esconde el botón cuando ya no aplica.
export function HojaEnvio({ e, hoy, onClose, volverA }: { e: EnvioMio; hoy?: string; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const enCelular = useEnCelular();
  const [anulando, setAnulando] = useState(false);
  // El botón que abrió «Anular»: al cancelar, el foco vuelve a él (`Boton` no pasa su ref).
  const botonAnular = useRef<HTMLElement | null>(null);
  const estado = ESTADO_ENVIO[e.estado];
  const avisos = avisosDeEnvio(e, hoy);
  const filas: [string, string][] = [
    ["Prendas", String(e.prendas)],
    ["Fardos", String(e.fardos)],
    ["Ronda", textoDeRondaDelEnvio(e)],
  ];
  const cuerpo = (
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
        {sePuedeAnularEnvio(e) && (
          <div className="space-y-2.5 border-t border-sand pt-4">
            <p className="text-sm text-taupe">
              ¿Salió mal? Mientras la tienda no empiece a recibirlo, puedes anularlo: lo que llevaba vuelve a «Para mandar» y lo mandas otra vez.
            </p>
            <Boton
              type="button"
              peso="peligro"
              onClick={(ev) => {
                botonAnular.current = ev.currentTarget;
                setAnulando(true);
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Ban aria-hidden className="h-3.5 w-3.5" /> Anular envío
              </span>
            </Boton>
          </div>
        )}
        {anulando && (
          <AnularEnvioModal
            envio={{ id: e.id, numero: e.numero, sede: e.destino, unidades: e.prendas, version: null }}
            contexto={e.ronda ? `Ronda ${e.ronda}` : "Mis envíos"}
            queVuelve="vuelve a «Para mandar»: corrige lo que haga falta y mándalo otra vez"
            onClose={() => setAnulando(false)}
            alAnular={onClose}
            volverA={botonAnular}
          />
        )}
      </div>
  );
  if (enCelular) {
    return (
      <Modal titulo={e.destino} onClose={onClose} variante="hoja" conCerrar alCerrarEnfocar={volverA}>
        {cuerpo}
      </Modal>
    );
  }
  return (
    <Cajon titulo={e.destino} sobre="Mis envíos" onCerrar={onClose}>
      {cuerpo}
    </Cajon>
  );
}
