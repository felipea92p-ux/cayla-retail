"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { guardarMensajesAvisos } from "@/lib/club-avisos-acciones";
import { INFO_TIPO_AVISO, TIPOS_AVISO, type TipoAviso } from "@/lib/club-avisos-reglas";
import {
  DATOS_POR_TIPO,
  LINEA_BAJA,
  MAX_CIERRE,
  MAX_MENSAJE,
  NOMBRE_DEL_DATO,
  mensajeDeEjemplo,
  nombreDeEjemplo,
  problemaDelCierre,
  problemaDelMensaje,
  type TextosDeAvisos,
} from "@/lib/club-avisos-mensajes";
import { BurbujaAviso } from "./BurbujaAviso";

// Clientes ▸ Avisos, «Editar mensajes» (Felipe 2026-10-20; maqueta `docs/maquetas/avisos-club-2026-10/`, migración 20261020144000).
// Arriba, los cuatro avisos; en el medio, el mensaje del elegido y el cierre común; a la derecha, cómo le llega a un miembro de
// ejemplo. La BAJA no se escribe: la pone la base al final de todo mensaje (Ley 29733). Solo el líder guarda (la base lo exige,
// `avisos_solo_lider`); lo que guarda llega a las 3 tiendas desde el próximo aviso, y lo ya enviado no cambia.
//
// Guía de foco: cada aviso es un campo (está bien o dice qué le falta) y el cierre otro, opcional; los cuatro llegan escritos, así que
// la guía solo se enciende cuando algo se rompe. No agrega reglas: son las de `fn_club_aviso_problema`.

const recortar = (s: string) => s.trim();

export function EditarMensajesAvisos({
  textos,
  tienda,
  onClose,
}: {
  textos: TextosDeAvisos;
  /** El nombre de la tienda activa: completa {tienda} en la vista previa. */
  tienda: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [tipo, setTipo] = useState<TipoAviso>("cumpleanos");
  const [cuerpos, setCuerpos] = useState<Record<TipoAviso, string>>(textos.cuerpos);
  const [cierre, setCierre] = useState(textos.cierre);
  const [guardando, setGuardando] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const problemas = Object.fromEntries(TIPOS_AVISO.map((t) => [t, problemaDelMensaje(t, cuerpos[t])])) as Record<TipoAviso, string | null>;
  const problemaCierre = problemaDelCierre(cierre);
  const cambiados = TIPOS_AVISO.filter((t) => recortar(cuerpos[t]) !== recortar(textos.cuerpos[t]));
  const cambioCierre = recortar(cierre) !== recortar(textos.cierre);
  const sinCambios = cambiados.length === 0 && !cambioCierre;

  const guia = useGuiaCampos([
    ...TIPOS_AVISO.map((t) => ({
      id: `mensaje-${t}`,
      nombre: INFO_TIPO_AVISO[t].titulo,
      requerido: true,
      hecho: problemas[t] === null,
      pendiente: problemas[t] ?? "",
    })),
    { id: "cierre", nombre: "Cierre", requerido: false, hecho: problemaCierre === null, pendiente: problemaCierre ?? "" },
    { id: "responsable", nombre: "Quién lo cambia", requerido: true, hecho: responsable.listo, pendiente: "Elige quién cambia los mensajes." },
  ]);

  function cambiarCuerpo(t: TipoAviso, valor: string) {
    setCuerpos((c) => ({ ...c, [t]: valor }));
  }

  /** «+ Nombre»: pone el dato donde está el cursor (o al final) y deja el cursor justo después. */
  function poner(dato: string) {
    const caja = area.current;
    const texto = cuerpos[tipo];
    const desde = caja?.selectionStart ?? texto.length;
    const hasta = caja?.selectionEnd ?? desde;
    const marca = `{${dato}}`;
    cambiarCuerpo(tipo, texto.slice(0, desde) + marca + texto.slice(hasta));
    requestAnimationFrame(() => {
      caja?.focus();
      caja?.setSelectionRange(desde + marca.length, desde + marca.length);
    });
  }

  async function guardar() {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { cambiados: n, error } = await guardarMensajesAvisos(cuerpos, cierre, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      // La base dice en `detail` qué aviso rechazó: se abre ese.
      const cual = error.details && (TIPOS_AVISO as readonly string[]).includes(error.details) ? (error.details as TipoAviso) : null;
      if (cual) setTipo(cual);
      avisar.error(traducirError(error, "guardar los mensajes"));
      return;
    }
    avisar.exito("Mensajes guardados", {
      detalle: n ? "Los próximos avisos de las 3 tiendas ya salen con el texto nuevo. Lo que ya se mandó no cambia." : "No había nada distinto que guardar.",
    });
    router.refresh();
    onClose();
  }

  const cuerpo = cuerpos[tipo];
  const largo = [...cuerpo.trim()].length;

  return (
    <Modal
      titulo="Editar mensajes"
      subtitulo="El texto de cada aviso. Lo que guardes llega a los miembros de las 3 tiendas desde el próximo aviso; lo que ya se mandó no cambia."
      onClose={onClose}
      ancho="max-w-[1000px]" /* unificar-fijo: hoja de diseño propio, el mensaje y su vista previa lado a lado */
      bloqueado={guardando}
    >
      <div className="space-y-5">
        <nav className="flex flex-wrap gap-2" aria-label="Qué mensaje editas" data-guia="avisos.editar-tipos">
          {TIPOS_AVISO.map((t) => (
            <CampoGuiado key={t} id={`mensaje-${t}`} guia={guia} className="rounded-full">
              <button type="button" className="pildora-cayla" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                {INFO_TIPO_AVISO[t].titulo}
                {problemas[t] ? (
                  <span className="text-[11px] font-semibold">· Revisar</span>
                ) : cambiados.includes(t) ? (
                  <span className="text-[11px]">· Cambiado</span>
                ) : null}
              </button>
            </CampoGuiado>
          ))}
        </nav>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div data-guia="avisos.editar-mensaje">
              <Campo
                etiqueta={`El mensaje de ${INFO_TIPO_AVISO[tipo].titulo.toLowerCase()}`}
                htmlFor="mensaje-aviso"
                tono={problemas[tipo] ? "error" : "neutro"}
                pie={problemas[tipo] ?? `${largo} de ${MAX_MENSAJE} letras. Lo que va entre *asteriscos* sale en negrita en WhatsApp.`}
              >
                <textarea
                  ref={area}
                  id="mensaje-aviso"
                  className="caja-campo-input min-h-40 resize-y"
                  value={cuerpo}
                  onChange={(e) => cambiarCuerpo(tipo, e.target.value)}
                  rows={7}
                  maxLength={MAX_MENSAJE + 200}
                />
              </Campo>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-taupe">Pon un dato del miembro:</span>
                {DATOS_POR_TIPO[tipo].map((d) => (
                  <button key={d} type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => poner(d)}>
                    + {NOMBRE_DEL_DATO[d]}
                  </button>
                ))}
                {cambiados.includes(tipo) && (
                  <BotonDeshacer onClick={() => cambiarCuerpo(tipo, textos.cuerpos[tipo])}>Volver al guardado</BotonDeshacer>
                )}
              </div>
            </div>

            <CampoGuiado id="cierre" guia={guia}>
              <div data-guia="avisos.editar-cierre">
                <Campo
                  etiqueta="El cierre de todos los mensajes"
                  htmlFor="cierre-avisos"
                  tono={problemaCierre ? "error" : "neutro"}
                  pie={problemaCierre ?? `Va igual al final de los cuatro avisos. ${[...cierre.trim()].length} de ${MAX_CIERRE} letras.`}
                >
                  <textarea
                    id="cierre-avisos"
                    className="caja-campo-input resize-y"
                    value={cierre}
                    onChange={(e) => setCierre(e.target.value)}
                    rows={2}
                    maxLength={MAX_CIERRE + 100}
                  />
                </Campo>
              </div>
            </CampoGuiado>

            <p className="nota-cayla sin-i flex items-start gap-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Y al final, siempre: <b>«{LINEA_BAJA}»</b> Lo pide la ley de datos personales, así que no se quita ni se cambia.
              </span>
            </p>
          </div>

          <aside className="self-start rounded-xl border border-sand bg-crema p-4 md:sticky md:top-0" aria-label="Así le llega" data-guia="avisos.editar-previa">
            <p className="label-cayla mb-2.5 text-[11px] text-taupe">Así le llega a {nombreDeEjemplo(tipo)}</p>
            <BurbujaAviso texto={mensajeDeEjemplo(tipo, cuerpo, cierre, tienda)} cierre={cierre} hora="10:24" />
            <p className="mt-2.5 text-xs text-taupe">Con los datos de un miembro de ejemplo. A cada miembro le llegan los suyos.</p>
          </aside>
        </div>

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </CampoGuiado>

        <PieGuia guia={guia} listo={sinCambios ? "Todo en orden. Cambia un mensaje para guardar." : "Todo listo para guardar."} />

        <PieAcciones className="pie-hoja-fijo" guia="avisos.editar-guardar">
          <Boton peso="fantasma" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            peso="primario"
            onClick={() => void guardar()}
            cargando={guardando}
            disabled={!guia.puedeConfirmar || sinCambios}
            title={responsable.motivo ?? guia.frase ?? (sinCambios ? "No cambiaste ningún mensaje." : undefined)}
            className={sinCambios ? "" : guia.claseConfirmar}
          >
            Guardar mensajes
          </Boton>
        </PieAcciones>
      </div>
    </Modal>
  );
}
