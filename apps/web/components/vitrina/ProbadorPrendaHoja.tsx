"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { avisar } from "@/components/ui/Avisos";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { sugerirLargo } from "@/lib/sugerencias-largo-probador";
import { camposDeLargo } from "@/lib/vitrina-probador-guia";
import { coloresPorFotografiar, errorDeLargo, leerLargo, queHacerConLaPrenda, veredictoDelProbador, type PrendaDelProbador } from "@/lib/vitrina-probador-reglas";

/**
 * Una prenda en Vitrina ▸ Probador (ADR-0434, actividad 3): su largo para el probador —vacío usa el típico de su categoría; vestidos,
 * faldas, conjuntos y enterizos no tienen típico (Felipe, 2026-10-16)—, qué colores tienen su foto y cómo van sus recortes. Las fotos se
 * cambian en Editar producto (el enlace lleva ahí). Guardar firma el «Responsable» (ADR-0162).
 */
export function ProbadorPrendaHoja({
  prenda: p,
  onClose,
  onGuardado,
}: {
  prenda: PrendaDelProbador;
  onClose: () => void;
  onGuardado: (productoId: string, largo: number | null) => void;
}) {
  const responsable = useResponsable();
  const [escrito, setEscrito] = useState(p.largo === null ? "" : String(p.largo));
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);
  const guia = useGuiaCampos(camposDeLargo({ escrito, tipico: p.tipico, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));
  const leido = leerLargo(escrito);
  const sinCambios = !("error" in leido) && leido.valor === p.largo;
  const sugerencia = sugerirLargo({ prefijo: p.categoria?.prefijo ?? null, tipico: p.tipico });
  const porFotografiar = coloresPorFotografiar(p);
  const categoria = p.categoria?.nombre ?? "su categoría";
  // Lo guardado, no lo que se está escribiendo: «Lista» recién vale cuando el largo se guardó.
  const veredicto = veredictoDelProbador(p);
  const sinFoto = (
    <div className="absolute inset-0">
      <SinFoto tamano="h-full w-full" colorHex={p.colores.find((c) => c.hex)?.hex ?? null} prefijo={p.categoria?.prefijo} categoria={p.categoria?.nombre} conNombre />
    </div>
  );

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar || "error" in leido) return;
    if (sinCambios) {
      onClose();
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc("vitrina_guardar_largo", { p_producto_id: p.productoId, p_largo_cm: leido.valor }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error || !data) {
      avisar.error(errorDeLargo(`${error?.message ?? ""} ${error?.hint ?? ""}`) ?? traducirError(error ?? { message: "sin respuesta" }, "guardar el largo"));
      return;
    }
    onGuardado(p.productoId, leido.valor);
    avisar.exito(leido.valor === null ? `«${p.nombre}» vuelve al largo típico.` : `Largo de «${p.nombre}»: ${leido.valor} cm.`);
    onClose();
  }

  return (
    <Modal
      titulo={p.nombre}
      subtitulo={[p.codigo, p.categoria?.nombre].filter(Boolean).join(" · ") || undefined}
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      bloqueado={guardando}
    >
      <form onSubmit={guardar} className="space-y-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-tinta">
          <Chip tono={veredicto.sale ? "verde" : "ambar"}>{veredicto.texto}</Chip>
          <span>{queHacerConLaPrenda(veredicto)}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="papel-fijo relative aspect-[4/5] w-36 overflow-hidden rounded-xl border border-sand bg-hueso">
            {p.miniatura ? (
              <ImagenDePrenda src={p.miniatura} alt={p.nombre} fill sizes="144px" fallback={sinFoto} className={`object-contain ${p.miniaturaEsRecorte ? "p-3" : ""}`} />
            ) : (
              sinFoto
            )}
          </div>
          <div className="space-y-3 text-[13px] text-tinta">
            <p>
              <span className="text-taupe">Recortes · </span>
              {p.recortes.listos > 0 ? `${p.recortes.listos} ${p.recortes.listos === 1 ? "listo" : "listos"}` : "ninguno listo"}
              {p.recortes.porRevisar > 0 && ` · ${p.recortes.porRevisar} por revisar`}
              {p.recortes.sin > 0 && ` · ${p.recortes.sin} sin recorte`}
            </p>
            <div>
              <p className="text-taupe">Colores con su foto</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Los colores de la prenda y si tienen su foto">
                {p.colores.map((c) => (
                  <li key={c.codigo}>
                    {c.foto ? (
                      <Chip tono="verde">{c.nombre}</Chip>
                    ) : c.hay > 0 ? (
                      <Chip tono="ambar" title="Hay stock y todavía no tiene su foto">{`${c.nombre} · falta foto`}</Chip>
                    ) : (
                      <Chip tono="neutro" title="Sin stock: se fotografía cuando vuelva">{`${c.nombre} · sin stock`}</Chip>
                    )}
                  </li>
                ))}
              </ul>
              {porFotografiar.length > 0 && (
                <p className="mt-2 text-[12.5px] text-taupe">Un color sin foto se elige igual en el probador: se ve otra foto de la prenda y se avisa.</p>
              )}
            </div>
            <EnlaceVer href={`/productos/${p.productoId}/editar`} alNavegar={onClose}>
              Editar sus fotos
            </EnlaceVer>
          </div>
        </div>

        <CampoGuiado id="largo" guia={guia}>
          <div data-guia="largo.campo">
            <CampoTexto
              etiqueta="Largo (cm)"
              inputMode="numeric"
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              placeholder={sugerencia.texto}
              tono={"error" in leido ? "error" : undefined}
              pie={
                "error" in leido
                  ? leido.error
                  : `${p.tipico === null ? `${p.categoria ? `La categoría ${p.categoria.nombre}` : "Su categoría"} no tiene largo típico: sin el suyo, no sale en el probador.` : `Vacío: usa el típico de ${categoria}, ${p.tipico} cm.`} Se mide de arriba abajo, como cae puesta.`
              }
              disabled={guardando}
            />
          </div>
        </CampoGuiado>

        <CampoGuiado id="responsable" guia={guia}>
          <div data-guia="largo.responsable">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </div>
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} listo={sinCambios ? "No cambiaste nada." : "Todo listo."} />
          <div className="ml-auto pie-acciones" data-guia="largo.guardar">
            <Boton type="button" onClick={onClose} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Guardar
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
