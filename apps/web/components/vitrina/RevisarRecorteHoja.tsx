"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { avisar } from "@/components/ui/Avisos";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { errorDeRecorte, recorteDeRespuesta, textoDelMotivo, type FotoDelProbador, type RecorteDeFoto } from "@/lib/recorte-probador-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeRecortes } from "@/lib/vitrina-probador-guia";

/**
 * Revisar recortes de Vitrina ▸ Probador (ADR-0434, actividad 1): cada recorte sobre claro y sobre oscuro, que es donde se notan un hueco o
 * un borde con fondo. «Usar en el probador» lo deja listo; «Descartar» lo saca del probador y la foto sigue igual (se puede volver a usar).
 * Pide quién lo hace una vez (ADR-0162) y va de una foto a la siguiente; con una sola, se cierra al decidir.
 */
export function RevisarRecorteHoja({
  fotos,
  onHecho,
  onClose,
}: {
  fotos: FotoDelProbador[];
  onHecho: (foto: string, recorte: RecorteDeFoto) => void;
  onClose: () => void;
}) {
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposDeRecortes({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));
  const [lista] = useState(fotos);
  const [i, setI] = useState(0);
  const [guardando, setGuardando] = useState<"usar" | "descartar" | null>(null);
  const enVuelo = useRef(false);
  const f = lista[Math.min(i, lista.length - 1)];
  const r = f.recorte;
  const color = f.colorNombre ?? "Todos los colores";
  const motivo = textoDelMotivo(r?.motivo ?? null);

  async function decidir(usar: boolean) {
    if (enVuelo.current || !guia.puedeConfirmar || !r) return;
    enVuelo.current = true;
    setGuardando(usar ? "usar" : "descartar");
    const { data, error } = await firmar(createClient().rpc("revisar_recorte", { p_foto: f.foto, p_usar: usar }), responsable.firma());
    enVuelo.current = false;
    setGuardando(null);
    if (error || !data) {
      responsable.despues(error);
      avisar.error(errorDeRecorte(`${error?.message ?? ""} ${error?.hint ?? ""}`) ?? traducirError(error ?? { message: "sin respuesta" }, "revisar el recorte"));
      return;
    }
    const nuevo = recorteDeRespuesta(data, f.url);
    if (nuevo) onHecho(f.foto, nuevo);
    if (i + 1 < lista.length) {
      setI(i + 1);
      return;
    }
    responsable.despues(null);
    avisar.exito(lista.length === 1 ? (usar ? "Listo: sale en el probador." : "Descartado: no sale en el probador.") : "Listo: revisaste todos.");
    onClose();
  }

  return (
    <Modal
      titulo={lista.length === 1 ? "Revisar el recorte" : "Revisar recortes"}
      subtitulo="Míralo sobre claro y sobre oscuro: ahí se nota un hueco o un borde con fondo. Descarta el que muestre el gancho o un pedazo de fondo; la foto de la tienda no cambia."
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      bloqueado={guardando !== null}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[14px] font-medium text-tinta">{f.nombre}</p>
          <p className="text-[13px] text-taupe">{color}</p>
          {r?.estado === "listo" && <Chip tono="verde">En el probador</Chip>}
          {r?.estado === "descartado" && <Chip tono="apagado" tachado={false}>Descartada</Chip>}
          {r?.estado === "por_revisar" && <Chip tono="ambar">Por revisar</Chip>}
          {lista.length > 1 && <span className="ml-auto text-[12.5px] text-taupe">{`${i + 1} de ${lista.length}`}</span>}
        </div>
        {motivo && <p className="text-[13px] text-tinta">{motivo}</p>}

        {r && (
          <div className="grid grid-cols-2 gap-3" data-guia="recortes.vista">
            {/* Claro y oscuro FIJOS: es como se verá en la tienda y donde se nota un borde, no un color del tema. */}
            <div className="papel-fijo relative aspect-[4/5] overflow-hidden rounded-xl border border-sand bg-hueso">
              <ImagenDePrenda key={`${r.url}-claro`} src={r.url} alt={`El recorte de ${f.nombre} sobre claro`} fill sizes="280px" fallback={null} className="object-contain p-4" />
            </div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-tinta-fija">
              <ImagenDePrenda key={`${r.url}-oscuro`} src={r.url} alt={`El recorte de ${f.nombre} sobre oscuro`} fill sizes="280px" fallback={null} className="object-contain p-4" />
            </div>
          </div>
        )}

        <CampoGuiado id="responsable" guia={guia}>
          <div data-guia="recortes.responsable-revisar">
            <ComboResponsable control={responsable} deshabilitado={guardando !== null} />
          </div>
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} />
          <div className="ml-auto pie-acciones" data-guia="recortes.decidir">
            <Boton type="button" onClick={onClose} disabled={guardando !== null}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              cargando={guardando === "descartar"}
              textoCargando="Descartando…"
              disabled={!guia.puedeConfirmar || guardando !== null || r?.estado === "descartado"}
              title={guia.frase ?? undefined}
              onClick={() => void decidir(false)}
            >
              Descartar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              cargando={guardando === "usar"}
              textoCargando="Guardando…"
              disabled={!guia.puedeConfirmar || guardando !== null || r?.estado === "listo"}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
              onClick={() => void decidir(true)}
            >
              Usar en el probador
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
