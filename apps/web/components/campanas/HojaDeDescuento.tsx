"use client";

import { useState, type FormEvent } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsableDeRebaja } from "@/components/rebajas/RebajasDeTienda";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Interruptor } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { traducirError } from "@/lib/error-escritura";
import { rpcRebaja } from "@/lib/rebaja-rapida";
import {
  PCTS_SUGERIDOS,
  avisoDeListaVieja,
  camposDeLaHojaDeDescuento,
  descuentoConPct,
  pctDeDescuento,
  textoDeLaHojaDeDescuento,
  textoPct,
  type DescuentoDeLista,
} from "@/lib/rebaja-rapida-reglas";
import { firmar } from "@/lib/responsable-reglas";

type Cambio = { etiqueta_id: string; pct: number | string; antes: number | string; juntado: boolean; movidas: string[] };

/**
 * «Nuevo descuento» y «Cambiar el %» (ADR-0677, actividad 4 de la maqueta `docs/maquetas/campanas-simple-2026-11/`): la misma hoja, con el % a
 * un toque o escrito. Si ya hay uno con ese % donde se mira, lo dice: al crear, lo abre; al cambiar, junta las prendas ahí (Felipe 2026-11-17).
 * «En todas las tiendas» solo lo ve un líder (la base lo vuelve a exigir). Lo que guarda va con su «Deshacer» en el aviso.
 */
export function HojaDeDescuento({
  ubicacionId,
  sede,
  esLider,
  descuentos,
  cambiando,
  onClose,
  onListo,
  onListaVieja,
}: {
  ubicacionId: string;
  sede: string;
  esLider: boolean;
  descuentos: readonly DescuentoDeLista[];
  /** El descuento al que se le cambia el %; sin él, es uno nuevo. */
  cambiando: DescuentoDeLista | null;
  onClose: () => void;
  /** El descuento que hay que abrir después (el creado, el que quedó o el que ya existía), y su aviso: sale cuando la lista se vuelve a leer. */
  onListo: (etiquetaId: string, aviso?: () => void) => void;
  /** La base dijo que el descuento ya no está: la hoja se cierra, la pantalla vuelve a leer la lista y después avisa (chaos #2). */
  onListaVieja: (aviso: () => void) => void;
}) {
  const responsable = useResponsableDeRebaja(ubicacionId, sede);
  const [texto, setTexto] = useState(cambiando ? String(cambiando.pct) : "25");
  const [todas, setTodas] = useState(cambiando?.todas ?? false);
  const [guardando, setGuardando] = useState(false);
  // El % llega puesto: la guía lo da por elegido recién cuando la persona lo toca (ADR-0284 act. h).
  const [pctElegido, setPctElegido] = useState(false);
  const pct = pctDeDescuento(texto.trim() === "" ? null : Number(texto.replace(",", ".")));
  const existente = descuentoConPct(descuentos, pct, todas, cambiando?.etiquetaId);
  const mismo = cambiando !== null && pct !== null && Math.round(pct * 100) === Math.round(cambiando.pct * 100);
  const guia = useGuiaCampos(
    camposDeLaHojaDeDescuento({ pct, pctElegido, existeSinCambiar: !cambiando && existente !== null, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }),
  );

  const elegirPct = (valor: string) => {
    setTexto(valor);
    setPctElegido(true);
  };
  const sumar = (n: number) => elegirPct(String(Math.min(70, Math.max(1, Math.round((pct ?? 0) + n)))));

  /** «Deshacer» de un cambio de %: vuelve al % de antes (si se juntó, sus tallas vuelven a ese % de una sola llamada). */
  async function deshacerCambio(c: Cambio) {
    const antes = Number(c.antes);
    const llamada = c.juntado
      ? rpcRebaja<{ etiqueta_id: string }>("poner_rebaja_varias", { p_variantes: c.movidas, p_pct: antes, p_etiqueta_id: null, p_ubicacion_id: ubicacionId, p_todas: todas })
      : rpcRebaja<{ etiqueta_id: string }>("cambiar_pct_de_descuento", { p_etiqueta_id: c.etiqueta_id, p_pct: antes, p_ubicacion_id: ubicacionId, p_todas: todas });
    const { data, error } = await firmar(llamada, responsable.firma());
    responsable.despues(error);
    if (error) {
      const vieja = avisoDeListaVieja(error);
      if (vieja) onListaVieja(() => avisar.aviso(vieja));
      else avisar.error(traducirError(error, "deshacer el cambio"));
      return;
    }
    onListo(data?.etiqueta_id ?? c.etiqueta_id, () => avisar.exito(`Otra vez ${textoPct(antes)}`));
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (pct === null) return;
    // Abrir el que ya existe, o «cambiar» al mismo %: no hay nada que guardar.
    if (!cambiando && existente) {
      onListo(existente.etiquetaId);
      onClose();
      return;
    }
    if (mismo) {
      onClose();
      return;
    }
    setGuardando(true);
    if (!cambiando) {
      const { data, error } = await firmar(
        rpcRebaja<{ etiqueta_id: string }>("crear_descuento", { p_pct: pct, p_ubicacion_id: ubicacionId, p_todas: todas }),
        responsable.firma(),
      );
      responsable.despues(error);
      setGuardando(false);
      if (error || !data) {
        avisar.error(traducirError(error ?? { message: "" }, "crear el descuento"));
        return;
      }
      onListo(data.etiqueta_id, () => avisar.exito(`Descuento ${textoPct(pct)} creado`, { detalle: todas ? "Todas las tiendas" : sede }));
      onClose();
      return;
    }
    const { data, error } = await firmar(
      rpcRebaja<Cambio>("cambiar_pct_de_descuento", { p_etiqueta_id: cambiando.etiquetaId, p_pct: pct, p_ubicacion_id: ubicacionId, p_todas: cambiando.todas }),
      responsable.firma(),
    );
    responsable.despues(error);
    setGuardando(false);
    if (error || !data) {
      const vieja = avisoDeListaVieja(error);
      if (vieja) {
        onClose();
        onListaVieja(() => avisar.aviso(vieja));
        return;
      }
      avisar.error(traducirError(error ?? { message: "" }, "cambiar el %"));
      return;
    }
    const antes = cambiando.pct;
    onListo(data.etiqueta_id, () =>
      avisar.exito(data.juntado ? `Juntado en ${textoPct(pct)}` : `Ahora es ${textoPct(pct)}`, {
        detalle: data.juntado ? `El ${textoPct(antes)} se apagó` : undefined,
        accion: { texto: "Deshacer", onClick: () => void deshacerCambio(data) },
      }),
    );
    onClose();
  }

  return (
    <Modal titulo={cambiando ? `Cambiar el ${textoPct(cambiando.pct)}` : "Nuevo descuento"} onClose={onClose}>
      <form onSubmit={confirmar} onKeyDown={enterNoGuarda} className="space-y-6">
        <CampoGuiado id="pct" guia={guia} titulo="Porcentaje">
          <div className="space-y-3">
            {/* El % es lo único que decide esta hoja: va en el paso «grande» del sistema (68 px, el número a 36 px), como en la hoja de una oferta
                (Felipe 2026-11-18: «las cosas muy pequeñas no funcionan»). */}
            <PasoCantidad
              tamano="grande"
              sufijo="%"
              className="w-full"
              menos={{ onClick: () => sumar(-1), deshabilitado: (pct ?? 0) <= 1, etiqueta: "Un % menos" }}
              mas={{ onClick: () => sumar(1), deshabilitado: (pct ?? 0) >= 70, etiqueta: "Un % más" }}
              campo={{ value: texto, onChange: (ev) => elegirPct(ev.target.value), inputMode: "decimal", "aria-label": "Porcentaje de descuento" }}
            />
            <div className="of-opciones" role="group" aria-label="Porcentajes a un toque">
              {PCTS_SUGERIDOS.map((v) => (
                <button key={v} type="button" className="pildora-cayla" aria-pressed={pct === v} onClick={() => elegirPct(String(v))}>
                  {textoPct(v)}
                </button>
              ))}
            </div>
          </div>
        </CampoGuiado>

        {esLider && !cambiando && <Interruptor activo={todas} onActivo={setTodas} etiqueta="En todas las tiendas" />}

        {existente && (
          <Aviso tono="info" chico titulo={`Ya existe, con ${existente.prendas} ${existente.prendas === 1 ? "prenda" : "prendas"}`}>
            {cambiando ? "Sus prendas se juntan ahí." : undefined}
          </Aviso>
        )}

        {!(existente && !cambiando) && (
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
        )}

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="ml-auto pie-acciones">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} confirma={guia} className={guia.claseConfirmar}>
              {textoDeLaHojaDeDescuento({ cambiando: cambiando !== null, existe: existente !== null, pct })}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
