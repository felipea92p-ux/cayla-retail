"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { camposDeBajadaDesdeVender } from "@/lib/bajada-desde-vender-guia";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { stockDeBajada, textosHojaBajada } from "@/lib/vender-stock-local";

/** Una prenda que el sistema tiene en el almacén y la colaboradora tiene en la mano: lo que la hoja muestra de ella. */
export type PrendaDeLaBajada = {
  varianteId: string;
  referencia: string;
  /** «Beige · L»: color y talla, lo que distingue la prenda en la mano. */
  detalle: string;
  fotoUrl: string | null;
  colorHex: string | null;
  categoria: CategoriaDePrenda;
  /** Lo libre en el piso, en el almacén y lo que ya lleva el ticket (para decir por qué no entró sola). */
  piso: number;
  almacen: number;
  enTicket: number;
};

/**
 * «¿La tienes en la mano?»: registra desde Vender la bajada al piso que se olvidó y agrega la prenda al ticket (ADR-0321).
 *
 * Dos caminos la abren. En el celular y la tablet, tocar una talla del almacén la abre directo, abajo, junto al pulgar
 * (`textosHojaBajada`, `lib/vender-stock-local.ts`): antes salía un aviso arriba, lejos del dedo, con el botón partido en dos
 * líneas, que se iba solo a los 15 s y abría OTRA hoja para elegir quién atiende. En el escritorio la ofrece el aviso, y esta
 * hoja sale solo si todavía no se eligió quién atiende.
 *
 * Quién atiende es el MISMO combo del ticket: lo elegido aquí queda elegido para la venta (es la misma persona atendiendo),
 * así que no se pregunta dos veces. El botón no se apaga por eso (ADR-0611, mejora 4): al tocarlo, el combo dice qué falta.
 *
 * La hoja espera a la base con «Agregando…» y recién entonces se cierra: un doble toque cae en el botón que ya guarda, y no en
 * lo que hay debajo en el mismo lugar (el «Listo» de la hoja de tallas). La base, además, baja solo lo que falta: repetir no
 * cuenta dos veces la misma prenda en el piso (`pisoNecesarioParaUnaMas`).
 */
export function RegistrarBajadaModal({
  prendas,
  responsable,
  onConfirmar,
  onClose,
}: {
  /** Una, o varias (lo que quedó fuera al cerrar la cámara). */
  prendas: PrendaDeLaBajada[];
  /** El combo del ticket (`useResponsable` de `PuntoDeVenta`), no uno propio. */
  responsable: ControlResponsable;
  /** Registra la bajada y agrega al ticket; la hoja espera a que termine (bien o mal: el error lo dice el aviso de la caja). */
  onConfirmar: () => Promise<void>;
  onClose: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const enVuelo = useRef(false);
  // Mientras la base responde, la hoja muestra lo que había al confirmar: el stock en vivo ya cambió y la fila diría «ya está en
  // el ticket» de la prenda que se está agregando.
  const [congeladas, setCongeladas] = useState<PrendaDeLaBajada[] | null>(null);
  const vistas = (enviando && congeladas) || prendas;
  const textos = textosHojaBajada(vistas.length);
  const guia = useGuiaCampos(camposDeBajadaDesdeVender({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));
  return (
    <Modal titulo={textos.titulo} subtitulo={textos.subtitulo} variante="hoja" onClose={onClose} bloqueado={enviando}>
      {(cerrar) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            // `confirma` ya frenó el toque sin responsable; esto cubre un envío que llegue por otro lado.
            if (!responsable.listo || enVuelo.current) return;
            enVuelo.current = true;
            setCongeladas(prendas);
            setEnviando(true);
            try {
              await onConfirmar();
            } finally {
              enVuelo.current = false;
              setEnviando(false);
              cerrar();
            }
          }}
          // Agregar es un acto explícito: un Enter en el buscador del combo no registra la bajada.
          onKeyDown={enterNoGuarda}
          className="mt-4 space-y-4"
        >
          <ul className="space-y-2" aria-label="Lo que entra al ticket">
            {vistas.map((p) => (
              <li key={p.varianteId} className="nota-cayla sin-i flex items-center gap-3">
                <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} tamano="lg" {...p.categoria} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{p.referencia}</p>
                  {p.detalle && <p className="truncate text-detalle text-secundario">{p.detalle}</p>}
                  <p className="text-detalle text-ambar-profundo tabular-nums">{stockDeBajada(p)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-3">
            <CampoGuiado id="quien" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={enviando} compacto />
            </CampoGuiado>
            <PieGuia guia={guia} listo="Todo listo para agregar." />
          </div>
          <div className="pie-hoja-fijo">
            <PieAcciones>
              <Boton type="button" peso="fantasma" onClick={cerrar} disabled={enviando}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={enviando} textoCargando="Agregando…" confirma={guia} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                {textos.boton}
              </Boton>
            </PieAcciones>
          </div>
        </form>
      )}
    </Modal>
  );
}
