"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { sugerirNombre } from "@/lib/sugerencias-alta-producto";
import { hrefAltaDesdeProduccion } from "@/lib/modelo-nuevo-orden-reglas";
import { MAX_NOMBRE_MODELO, type CategoriaDeModelo, type VocabularioModeloNuevo } from "@/lib/modelo-nuevo-reglas";

// Los campos de «Modelo nuevo» dentro de «Nueva orden» (ADR-0361, segunda parte). El Taller crea modelos nuevos como parte normal de su trabajo (una Muestra
// desarrolla un modelo que todavía no existe): acá se piden SOLO los datos que la base necesita para abrir la orden, con tallas y colores del vocabulario (nunca
// escritos a mano: «Negro»/«negro» fue el problema de V1). El resto del modelo —marca, proveedor, tejido, patrón, fotos— lo completa quien edita el catálogo.
//
// No tiene estado propio: el formulario de la orden es el dueño de todo (así la matriz de cantidades, el costo por prenda y el margen lo tratan como a cualquier
// otro modelo). Los COLORES ya no se eligen aquí (ADR-0396, A2): cada color es una fila de la tabla de cantidades y se suma con «+ Agregar color» (`orden-produccion/AgregarColor`). Cada campo está envuelto en `CampoGuiado` con el mismo id que usa `problemasDelModelo`, así «Falta: …» lleva a su campo.

export function ModeloNuevoCampos({
  guia,
  vocabulario,
  fallo,
  nombre,
  onNombre,
  categoria,
  onCategoria,
  tallaIds,
  onTallas,
  precio,
  onPrecio,
  esMuestra,
  puedeEditarCatalogo,
  tipo,
  onElegirExistente,
}: {
  guia: GuiaCampos;
  /** `null` = no se pudieron leer las tallas y los colores. */
  vocabulario: VocabularioModeloNuevo | null;
  fallo: string | null;
  nombre: string;
  onNombre: (v: string) => void;
  categoria: CategoriaDeModelo | null;
  onCategoria: (id: string) => void;
  tallaIds: string[];
  onTallas: (ids: string[]) => void;
  precio: string;
  onPrecio: (v: string) => void;
  esMuestra: boolean;
  puedeEditarCatalogo: boolean;
  tipo: "produccion" | "muestra";
  /** «Mejor elegir uno que ya existe»: vuelve al buscador (ADR-0396). Sin él (el catálogo está vacío) no se ofrece. */
  onElegirExistente?: () => void;
}) {
  const nombreDeFamilia = useMemo(() => new Map((vocabulario?.familias ?? []).map((f) => [f.codigo, f.nombre])), [vocabulario]);

  if (!vocabulario) {
    return <Aviso tono="atencion">{fallo ?? "No se pudieron cargar las tallas y los colores."} Mientras tanto, elige un modelo que ya exista.</Aviso>;
  }

  const opcionesCategoria = vocabulario.categorias.map((c) => ({
    valor: c.id,
    texto: c.nombre,
    grupo: nombreDeFamilia.get(c.familia ?? "") ?? c.familia ?? "Otras",
  }));
  const sugerencia = sugerirNombre({ familia: categoria?.familia, prefijo: categoria?.prefijo });

  return (
    <section aria-label="Modelo nuevo" className="space-y-4 rounded-2xl border border-sand bg-crema p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoGuiado id="nombre" guia={guia}>
          <CampoTexto
            etiqueta={guia.etiqueta("nombre", "Nombre del modelo")}
            value={nombre}
            onChange={(e) => onNombre(e.target.value)}
            placeholder={sugerencia.texto}
            autoComplete="off"
            maxLength={MAX_NOMBRE_MODELO}
          />
        </CampoGuiado>
        <CampoGuiado id="categoria" guia={guia}>
          <CampoSelect
            etiqueta={guia.etiqueta("categoria", "Categoría")}
            valor={categoria?.id ?? ""}
            onValor={onCategoria}
            opciones={opcionesCategoria}
            marcador="Elegir la categoría"
          />
        </CampoGuiado>
      </div>

      {categoria && (
        <CampoGuiado id="tallas" guia={guia} retiene="fila" titulo="Tallas" ayuda={categoria.tallas.length > 0 ? "vienen marcadas las habituales de la categoría" : undefined}>
          {categoria.tallas.length === 0 ? (
            <Aviso tono="atencion" chico>
              {categoria.nombre} no tiene tallas habilitadas. Pídele a un líder que las habilite en Catálogo ▸ Categorías.
            </Aviso>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categoria.tallas.map((t) => (
                <ChipOpcion
                  key={t.id}
                  elegido={tallaIds.includes(t.id)}
                  onClick={() => onTallas(tallaIds.includes(t.id) ? tallaIds.filter((x) => x !== t.id) : [...tallaIds, t.id])}
                  className="tabular-nums"
                >
                  {t.valor}
                </ChipOpcion>
              ))}
            </div>
          )}
        </CampoGuiado>
      )}

      <CampoGuiado id="precio" guia={guia}>
        <CampoMonto
          etiqueta={guia.etiqueta("precio", "Precio a tienda (c/u)")}
          pie={esMuestra ? "Una muestra puede ir sin precio: se completa al aprobarla." : "Con este precio sale el margen de la orden."}
          inputMode="decimal"
          placeholder="0.00"
          value={precio}
          onChange={(e) => onPrecio(e.target.value)}
        />
      </CampoGuiado>

      {(onElegirExistente || puedeEditarCatalogo) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-tinta/70">
          {onElegirExistente && (
            <button type="button" onClick={onElegirExistente} className="btn-cayla btn-enlace text-[12.5px]">
              Mejor elegir uno que ya existe
            </button>
          )}
          {puedeEditarCatalogo && (
            <span>
              ¿Cargarlo completo, con fotos?{" "}
              <Link href={hrefAltaDesdeProduccion(tipo)} className="btn-enlace">
                Créalo en Productos
              </Link>
            </span>
          )}
        </p>
      )}
    </section>
  );
}
