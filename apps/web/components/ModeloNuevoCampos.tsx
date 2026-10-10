"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import type { ColorAlta } from "@/lib/alta-producto";
import { agruparPorFamilia } from "@/lib/colores-familias";
import { sugerirNombre } from "@/lib/sugerencias-alta-producto";
import { hrefAltaDesdeProduccion } from "@/lib/modelo-nuevo-orden-reglas";
import { MAX_NOMBRE_MODELO, type CategoriaDeModelo, type VocabularioModeloNuevo } from "@/lib/modelo-nuevo-reglas";

// Los campos de «Modelo nuevo» dentro de «Nueva orden» (ADR-0361, segunda parte). El Taller crea modelos nuevos como parte normal de su trabajo (una Muestra
// desarrolla un modelo que todavía no existe): acá se piden SOLO los datos que la base necesita para abrir la orden, con tallas y colores del vocabulario (nunca
// escritos a mano: «Negro»/«negro» fue el problema de V1). El resto del modelo —marca, proveedor, tejido, patrón, fotos— lo completa quien edita el catálogo.
//
// No tiene estado propio: el formulario de la orden es el dueño de todo (así la matriz de cantidades, el costo por prenda y el margen lo tratan como a cualquier
// otro modelo). Cada campo está envuelto en `CampoGuiado` con el mismo id que usa `problemasDelModelo`, así «Falta: …» lleva a su campo.

export function ModeloNuevoCampos({
  guia,
  vocabulario,
  fallo,
  colores,
  nombre,
  onNombre,
  categoria,
  onCategoria,
  tallaIds,
  onTallas,
  colorCodigos,
  onAlternarColor,
  onColorCreado,
  precio,
  onPrecio,
  esMuestra,
  puedeEditarCatalogo,
  tipo,
}: {
  guia: GuiaCampos;
  /** `null` = no se pudieron leer las tallas y los colores. */
  vocabulario: VocabularioModeloNuevo | null;
  fallo: string | null;
  colores: ColorAlta[];
  nombre: string;
  onNombre: (v: string) => void;
  categoria: CategoriaDeModelo | null;
  onCategoria: (id: string) => void;
  tallaIds: string[];
  onTallas: (ids: string[]) => void;
  colorCodigos: string[];
  onAlternarColor: (codigo: string) => void;
  onColorCreado: (color: ColorAlta) => void;
  precio: string;
  onPrecio: (v: string) => void;
  esMuestra: boolean;
  puedeEditarCatalogo: boolean;
  tipo: "produccion" | "muestra";
}) {
  const grupos = useMemo(() => agruparPorFamilia(colores, (c) => c.familiaColor), [colores]);
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
      <Aviso tono="info" chico>
        Se crea en el catálogo al abrir la orden, con su código y su precio. Marca, proveedor, tejido, patrón y fotos los completa quien edita el catálogo.
        {puedeEditarCatalogo && (
          <>
            {" "}
            ¿Prefieres cargarlo completo, con fotos?{" "}
            <Link href={hrefAltaDesdeProduccion(tipo)} className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
              Créalo en Productos
            </Link>{" "}
            y vuelves aquí con la orden lista.
          </>
        )}
      </Aviso>

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

      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-tinta">
          Colores
          <span className="text-[12px] font-normal text-taupe">{colorCodigos.length > 0 ? `${colorCodigos.length} elegido${colorCodigos.length === 1 ? "" : "s"}` : "opcional: si no tiene color, déjalo vacío"}</span>
        </p>
        <ElegirColores colores={colores} grupos={grupos} elegidos={colorCodigos} onAlternar={onAlternarColor} onCreado={onColorCreado} />
      </div>

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
    </section>
  );
}
