"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { AvisoInline, ChipOpcion } from "@/components/alta-producto/piezas";
import { guardarEjesCategoria, type EjeIds, type TipoVocabulario } from "@/lib/alta-producto-ejes";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import type { ValorVocabulario } from "@/lib/catalogo-v2";

// Una categoría sin tallas (o sin tejidos/patrones, si su familia los exige)
// no tiene con qué armar un producto. En vez de mandar a la Líder a otra
// pantalla —y que pierda lo que llenó— se configura aquí mismo (decidido con
// Felipe, 2026-09-18).
//
// LO QUE ESTE PANEL DICE EN VOZ ALTA: lo que se elige queda guardado en la
// CATEGORÍA, no solo en este producto. Es un cambio del catálogo que verán
// todos los productos futuros (y el censo); esconderlo detrás de un botón
// "Guardar" sin contexto sería dejar que se haga sin saberlo.
//
// NO va dentro de la transacción del alta (mismo criterio que ProponerValor).
// Por lo mismo lleva su propio combo «Responsable» (ADR-0161): es un guardado
// aparte del producto, y quien cambia la categoría firma ese cambio.

const TEXTOS: Record<TipoVocabulario, { faltante: string; accion: string; efecto: string }> = {
  tallas: {
    faltante: "todavía no tiene tallas",
    accion: "Elige las tallas que ofrece",
    efecto: "Las que elijas vendrán marcadas de antemano en cada producto nuevo de esta categoría.",
  },
  tejidos: {
    faltante: "no tiene tejidos habilitados",
    accion: "Elige los tejidos que ofrece",
    efecto: "Quedan disponibles para cada producto nuevo de esta categoría.",
  },
  patrones: {
    faltante: "no tiene patrones habilitados",
    accion: "Elige los patrones que ofrece",
    efecto: "Quedan disponibles para cada producto nuevo de esta categoría.",
  },
};

export function ConfigurarCategoria({
  tipo,
  categoriaId,
  categoriaNombre,
  universo,
  ejesActuales,
  motivoExtra,
  onGuardado,
}: {
  tipo: TipoVocabulario;
  categoriaId: string;
  categoriaNombre: string;
  /** Todo el vocabulario aprobado de este eje. */
  universo: ValorVocabulario[];
  /** Lo que la categoría ofrece HOY en los tres ejes (la RPC reemplaza, no amplía). */
  ejesActuales: EjeIds;
  /** Por qué importa acá y ahora (ej. "Indumentaria exige tejido"). */
  motivoExtra?: string;
  onGuardado: (elegidos: ValorVocabulario[]) => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responsable = useResponsable();
  const t = TEXTOS[tipo];

  function alternar(id: string) {
    setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function guardar() {
    if (elegidos.length === 0 || guardando || !responsable.listo) return;
    setGuardando(true);
    setError(null);
    const nuevos: EjeIds = {
      tallaIds: tipo === "tallas" ? elegidos : ejesActuales.tallaIds,
      tejidoIds: tipo === "tejidos" ? elegidos : ejesActuales.tejidoIds,
      patronIds: tipo === "patrones" ? elegidos : ejesActuales.patronIds,
    };
    // Tallas: todas las elegidas quedan como curva habitual (es lo que la persona acaba de decir que ofrece).
    const err = await guardarEjesCategoria(categoriaId, nuevos, responsable.encabezados(), tipo === "tallas" ? elegidos : undefined);
    setGuardando(false);
    if (err) {
      setError(err);
      return;
    }
    responsable.despues(null);
    avisar.exito(`${categoriaNombre} actualizada`, { detalle: t.efecto });
    onGuardado(universo.filter((v) => elegidos.includes(v.id)));
  }

  return (
    <div className="space-y-3">
      <AvisoInline tono="ambar">
        <p>
          <strong>{categoriaNombre}</strong> {t.faltante}.{motivoExtra ? ` ${motivoExtra}` : ""}
        </p>
        <p className="mt-1 text-xs">{t.efecto} Esto se guarda en la categoría, no solo en este producto.</p>
      </AvisoInline>

      <p className="label-cayla text-[11px] text-tinta/60">{t.accion}</p>
      {universo.length === 0 ? (
        <p className="text-sm text-tinta/60">No hay valores aprobados todavía. Créalos en Catálogo → Atributos.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {universo.map((v) => (
            <ChipOpcion key={v.id} elegido={elegidos.includes(v.id)} onClick={() => alternar(v.id)}>
              {v.texto}
            </ChipOpcion>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-rojo-profundo">
          {error}
        </p>
      )}
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <button
        type="button"
        onClick={() => void guardar()}
        disabled={elegidos.length === 0 || guardando || !responsable.listo}
        title={responsable.motivo ?? undefined}
        className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
      >
        {guardando ? "Guardando…" : `Guardar en ${categoriaNombre}`}
      </button>
    </div>
  );
}
