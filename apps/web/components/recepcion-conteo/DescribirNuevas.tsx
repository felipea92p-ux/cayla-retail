"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { CategoriaDeLinea } from "@/lib/recepcion-envio-reglas";
import { TOPES_CONTEO } from "@/lib/recepcion-conteo-reglas";
import { sugerirNombre } from "@/lib/sugerencias-alta-producto";
import { PasoDePrendas } from "./SepararPrendas";

// «Describir ahora» (maqueta A, ADR-0393 decisión 8): de las nuevas que se contaron, anotar qué son —nombre, color, tallas, en palabras— sin
// crearlas todavía. Siguen «por crear»: quien las cree después, en «Hacer ahora», ya sabe qué son. No guarda nada por su cuenta: lo descrito
// va al borrador de la línea, que se guarda solo como todo lo contado.

export function DescribirNuevas({
  categoria,
  maximo,
  onDescribir,
  onCerrar,
}: {
  categoria: CategoriaDeLinea;
  /** Cuántas nuevas hay sin describir: no se describen más. */
  maximo: number;
  onDescribir: (descripcion: string, cantidad: number) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [cantidad, setCantidad] = useState(maximo);
  const guia = useGuiaCampos([
    { id: "describir-que", nombre: "Qué son", requerido: true, hecho: texto.trim().length >= 3, pendiente: "Escribe qué son: nombre, color, tallas." },
    { id: "describir-cuantas", nombre: "Cuántas", requerido: true, hecho: cantidad >= 1 && cantidad <= maximo, pendiente: `Di cuántas son (hasta ${maximo}).` },
  ]);

  return (
    <Modal
      titulo="Describir lo nuevo"
      subtitulo={`${categoria.nombre}: lo que sabes ahora de estas prendas. Siguen por crear: quien las cree después ya sabrá qué son.`}
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!guia.puedeConfirmar) return;
            onDescribir(texto, cantidad);
            cerrar();
          }}
          className="space-y-4"
        >
          <CampoGuiado id="describir-que" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("describir-que", "¿Qué son? Nombre, color, tallas")}
              value={texto}
              maxLength={TOPES_CONTEO.descripcionNueva}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`Ej. ${sugerirNombre(categoria).texto}`}
              autoFocus
            />
          </CampoGuiado>
          <CampoGuiado id="describir-cuantas" guia={guia}>
            <p className="campo-etiqueta mb-1.5">{guia.etiqueta("describir-cuantas", `¿Cuántas son? De ${maximo} nuevas`)}</p>
            <PasoDePrendas valor={cantidad} etiqueta="nuevas descritas" minimo={1} onValor={(n) => setCantidad(Math.min(maximo, n))} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Guardar lo que son
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
