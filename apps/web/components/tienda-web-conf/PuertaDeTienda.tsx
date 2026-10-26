"use client";

import type { CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight, GripVertical, Lock } from "lucide-react";
import { Anillo } from "@/components/ui/Anillo";
import { Chip } from "@/components/ui/Chip";
import { Interruptor } from "@/components/ui/campos";
import { Fachada } from "@/components/tienda-web-conf/Fachada";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import {
  PALABRA_FALTA,
  avanceDeSede,
  colorDeSede,
  estadoSedeWeb,
  faltaParaMostrar,
  limpiarTexto,
  type BorradorSede,
  type SedeWeb,
} from "@/lib/tienda-web-reglas";

/**
 * Una tienda en la fila de arriba (maqueta de Conf. Tienda, ADR-0518): su fachada, el nombre que lee el cliente, lo que ve hoy el cliente
 * de ella, el anillo de los tres datos que necesita y —con una palabra cada uno— lo que le falta. Tocarla la abre en el taller de abajo. El
 * interruptor «Se ve en la web» enciende o apaga el BORRADOR (se guarda con el botón del taller) y abre esa tienda para que el botón se vea.
 */
export function PuertaDeTienda({
  sede,
  borrador,
  guardado,
  enWeb,
  activa,
  sucia,
  indice,
  bloqueada,
  guiaInterruptor,
  ordenable,
  arrastrando,
  encima,
  onElegir,
  onMostrar,
  onMover,
  onArrastre,
}: {
  sede: SedeWeb;
  /** Lo que está escrito ahora (con lo sin guardar): el nombre y los datos que faltan. */
  borrador: BorradorSede;
  /** Lo que la base ya tiene: el estado dice lo que el cliente ve HOY, no lo que está escrito sin guardar. */
  guardado: { mostrar: boolean } & BorradorSede;
  enWeb: boolean;
  activa: boolean;
  sucia: boolean;
  indice: number;
  /** Mientras algo se guarda, el interruptor espera. */
  bloqueada: boolean;
  guiaInterruptor?: string;
  /** Hay más de una tienda: se pueden ordenar (arrastrar, Alt + flechas, o los botones del celular). */
  ordenable: boolean;
  arrastrando: boolean;
  /** Otra puerta se está arrastrando por encima de esta. */
  encima: boolean;
  onElegir: () => void;
  onMostrar: (valor: boolean) => void;
  /** Un lugar a la izquierda (-1) o a la derecha (1). */
  onMover: (paso: -1 | 1) => void;
  /** El arrastre con el mouse: empieza, pasa por encima, se suelta o se cancela. */
  onArrastre: (fase: "empieza" | "encima" | "suelta" | "termina") => void;
}) {
  const falta = faltaParaMostrar(borrador);
  const avance = avanceDeSede(borrador);
  const estado = estadoSedeWeb(guardado);
  const nombre = limpiarTexto(borrador.nombreWeb) ?? nombreCorto(sede.nombre);

  return (
    <div
      className="twc-puerta tw-entra"
      data-activa={activa || undefined}
      data-oculta={!enWeb || undefined}
      data-arrastrando={arrastrando || undefined}
      data-encima={encima || undefined}
      style={{ "--i": indice } as CSSProperties}
      draggable={ordenable}
      onDragStart={ordenable ? (e) => { e.dataTransfer.effectAllowed = "move"; onArrastre("empieza"); } : undefined}
      onDragOver={ordenable ? (e) => { e.preventDefault(); onArrastre("encima"); } : undefined}
      onDrop={ordenable ? (e) => { e.preventDefault(); onArrastre("suelta"); } : undefined}
      onDragEnd={ordenable ? () => onArrastre("termina") : undefined}
    >
      {ordenable && (
        <>
          <span className="twc-asa" title="Arrastra para ordenar" aria-hidden>
            <GripVertical />
          </span>
          {/* El celular no arrastra: dos botones mueven la tienda un lugar. Solo se ven con el dedo (pointer: coarse). */}
          <span className="twc-mover">
            <button type="button" aria-label={`Mover ${nombre} antes`} onClick={() => onMover(-1)}>
              <ChevronLeft aria-hidden />
            </button>
            <button type="button" aria-label={`Mover ${nombre} después`} onClick={() => onMover(1)}>
              <ChevronRight aria-hidden />
            </button>
          </span>
        </>
      )}
      <button
        type="button"
        className="twc-cara"
        aria-pressed={activa}
        aria-keyshortcuts={ordenable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
        onClick={onElegir}
        onKeyDown={
          ordenable
            ? (e) => {
                if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
                e.preventDefault();
                onMover(e.key === "ArrowLeft" ? -1 : 1);
              }
            : undefined
        }
      >
        <Fachada color={colorDeSede(sede.nombre)} />
        <span className="twc-cara-texto">
          <span className="twc-nombre">{nombre}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Chip tono={estado.tono}>{estado.texto}</Chip>
            {sucia && <span className="twc-sin-guardar">Sin guardar</span>}
          </span>
        </span>
      </button>
      <div className="twc-pie">
        <Anillo pct={avance.pct} tamano="chico" etiqueta={`${nombre}: ${avance.listos} de ${avance.total} datos listos`}>
          {avance.listos === avance.total ? <Check aria-hidden className="h-4 w-4" /> : <b className="text-[11px]">{avance.listos}</b>}
        </Anillo>
        <div className="twc-faltan">
          {falta.map((d) => (
            <Chip key={d} tono="ambar" versalitas={false}>
              {PALABRA_FALTA[d]}
            </Chip>
          ))}
        </div>
        <span className="twc-sw" data-guia={guiaInterruptor} title={falta.length > 0 && !enWeb ? "Completa lo que falta para encenderla" : undefined}>
          {falta.length > 0 && !enWeb && <Lock aria-hidden />}
          <Interruptor
            activo={enWeb}
            onActivo={onMostrar}
            disabled={bloqueada || (!enWeb && falta.length > 0)}
            etiqueta={<span className="sr-only">{`Se ve en la web: ${nombre}`}</span>}
          />
        </span>
      </div>
    </div>
  );
}
