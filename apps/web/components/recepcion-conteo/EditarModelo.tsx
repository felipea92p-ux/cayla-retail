"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { CategoriaDeLinea } from "@/lib/recepcion-envio-reglas";
import { TOPES_CONTEO } from "@/lib/recepcion-conteo-reglas";
import { paradaDelNombre, type CategoriaDelEnvio, type ModeloDelConteo } from "@/lib/recepcion-modelos-reglas";
import { sugerirDescripcion, sugerirNombre } from "@/lib/sugerencias-alta-producto";

// Ponerle su nombre a un modelo agregado al contar, o cambiárselo («Blusa 1» no deja cerrar el envío). No toca lo contado (Felipe 2026-11-03, ADR-0604).

export function EditarModelo({
  modelo,
  categoria,
  enLista,
  onGuardar,
  onCerrar,
}: {
  modelo: ModeloDelConteo;
  categoria: CategoriaDeLinea;
  enLista: CategoriaDelEnvio;
  onGuardar: (cambio: { nombre: string; nota: string | null }) => void;
  onCerrar: () => void;
}) {
  // Un nombre por defecto no se ofrece para corregirlo: se reemplaza.
  const [nombre, setNombre] = useState(modelo.porDefecto ? "" : modelo.nombre);
  const [nota, setNota] = useState(modelo.nota ?? "");
  const texto = nombre.trim();
  const otro = texto ? paradaDelNombre(enLista, texto) : null;
  const repetido = !!otro && otro.modelo?.clave !== modelo.clave;

  const guia = useGuiaCampos([
    { id: "editar-nombre", nombre: "El nombre", requerido: true, hecho: texto !== "" && !repetido, pendiente: repetido ? "Ya hay un modelo con ese nombre." : "Escribe cómo se llama." },
    { id: "editar-nota", nombre: "La descripción", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
  ]);

  return (
    <Modal titulo={modelo.porDefecto ? `¿Cómo se llama ${modelo.nombre}?` : `Editar ${modelo.nombre}`} subtitulo="Lo contado no cambia." onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            if (!guia.puedeConfirmar) return;
            onGuardar({ nombre: texto, nota: nota.trim() || null });
            onCerrar();
          }}
          className="space-y-4"
        >
          <CampoGuiado id="editar-nombre" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("editar-nombre", "El nombre")}
              value={nombre}
              maxLength={TOPES_CONTEO.descripcionNueva}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={`Ej. ${sugerirNombre(categoria).texto}`}
              tono={repetido ? "error" : undefined}
              pie={repetido ? "Ya hay un modelo con ese nombre en esta categoría." : undefined}
              autoFocus
            />
          </CampoGuiado>
          <CampoGuiado id="editar-nota" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("editar-nota", "La descripción (para no confundirlo con otro)")}
              value={nota}
              maxLength={TOPES_CONTEO.descripcionNueva}
              onChange={(e) => setNota(e.target.value)}
              placeholder={`Ej. ${sugerirDescripcion(categoria).texto}`}
            />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Guardar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
