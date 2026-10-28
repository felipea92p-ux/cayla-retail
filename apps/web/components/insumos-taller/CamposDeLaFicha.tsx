"use client";

import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CampoSelect } from "@/components/ui/campos";
import type { VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import type { TipoInsumo } from "@/lib/insumos-reglas";

// Los dos combos de la ficha de una tela —de qué tejido y de qué color es— que comparten «Nuevo insumo» y «Ficha de la tela» (ADR-0400, actividad 8e). Son SUGERIDOS: de ellos vive la sugerencia de «Nueva orden»
// (la tela del color de la prenda), pero nunca bloquean. Un avío no tiene tejido. Con más de 8 opciones el combo trae su buscador solo (ADR-0209).

export function CamposDeLaFicha({
  tipo,
  tejidoId,
  colorCodigo,
  onTejido,
  onColor,
  vocabulario,
  leyo,
  foco,
  guia,
}: {
  tipo: TipoInsumo;
  tejidoId: string;
  colorCodigo: string;
  onTejido: (id: string) => void;
  onColor: (codigo: string) => void;
  vocabulario: VocabularioDeTelas;
  /** `false`: el vocabulario no se pudo leer; se dice en vez de ofrecer una lista vacía. */
  leyo: boolean;
  /** La guía de foco de la hoja que lo usa (qué campo sigue, qué falta). */
  foco: GuiaCampos;
  /** El ancla de la guía interactiva (`data-guia`, ADR-0389). */
  guia: string;
}) {
  if (!leyo) {
    return (
      <p data-guia={guia} className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">
        No se pudieron cargar los tejidos y los colores. Cierra esta ventana y vuelve a abrirla; lo demás se puede guardar igual.
      </p>
    );
  }
  return (
    <div data-guia={guia} className={`grid gap-3 ${tipo === "tela" ? "sm:grid-cols-2" : ""}`}>
      {tipo === "tela" && (
        <CampoGuiado id="tejido" guia={foco}>
          <CampoSelect
            id="insumo-tejido"
            etiqueta={foco.etiqueta("tejido", "Tejido")}
            valor={tejidoId}
            onValor={onTejido}
            opciones={[{ valor: "", texto: "Sin tejido" }, ...vocabulario.tejidos.map((t) => ({ valor: t.id, texto: t.nombre }))]}
            marcador="Elegir el tejido"
          />
        </CampoGuiado>
      )}
      <CampoGuiado id="color" guia={foco}>
        <CampoSelect
          id="insumo-color"
          etiqueta={foco.etiqueta("color", "Color")}
          valor={colorCodigo}
          onValor={onColor}
          opciones={[{ valor: "", texto: "Sin color" }, ...vocabulario.colores.map((c) => ({ valor: c.codigo, texto: c.nombre }))]}
          marcador="Elegir el color"
        />
      </CampoGuiado>
    </div>
  );
}
