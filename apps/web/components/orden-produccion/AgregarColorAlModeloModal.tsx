"use client";

import { useMemo, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ColorAlta } from "@/lib/alta-producto";
import { agruparPorFamilia } from "@/lib/colores-familias";
import { coloresQueFaltan, fraseDeLosColoresNuevos } from "@/lib/agregar-variantes-orden-reglas";
import { useAgregarVariantes } from "./useAgregarVariantes";

// «+ Color» de la matriz de Nueva orden (Felipe, 2026-10-31): los colores que le faltan al modelo se agregan aquí, sin salir a Catálogo ▸ Editar producto. Es el mismo buscador y la
// misma carta de Nuevo producto (`ElegirColores`), con la opción de crear un color que no existe. Se pueden elegir varios de una vez: la base los crea todos o ninguno, una prenda por
// cada talla del modelo, con su precio y su costo y sin stock.
//
// Va SIN `<form>` por lo mismo que `AgregarTallaModal`: un «submit» de una hoja abierta desde el formulario de la orden subiría por el árbol de React y abriría la orden entera (ADR-0128).

export function AgregarColorAlModeloModal({
  tallerId,
  productoId,
  referencia,
  colores,
  variantes,
  onClose,
}: {
  tallerId: string;
  productoId: string;
  referencia: string;
  /** El vocabulario de colores (el mismo de «Modelo nuevo»). */
  colores: ColorAlta[];
  variantes: readonly { talla: string | null; color: string | null; colorCodigo: string | null }[];
  onClose: () => void;
}) {
  const { responsable, cargando, agregar } = useAgregarVariantes({ tallerId, productoId, onClose });
  // Un color creado desde el buscador todavía no está en `colores` (la lista llega de la página): se suma aquí y se elige.
  const [creados, setCreados] = useState<ColorAlta[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const disponibles = useMemo(() => {
    const vistos = new Set<string>();
    return coloresQueFaltan([...colores, ...creados], variantes).filter((c) => !vistos.has(c.codigo) && vistos.add(c.codigo));
  }, [colores, creados, variantes]);
  const grupos = useMemo(() => agruparPorFamilia(disponibles, (c) => c.familiaColor), [disponibles]);
  const nombres = elegidos.map((cod) => disponibles.find((c) => c.codigo === cod)?.nombre ?? cod);

  const alternar = (codigo: string) => setElegidos((xs) => (xs.includes(codigo) ? xs.filter((x) => x !== codigo) : [...xs, codigo]));

  return (
    <Modal titulo="Agregar colores" subtitulo={`A ${referencia}. Quedan en el catálogo, como si los hubieras agregado desde Editar producto.`} variante="hoja" tamano="mediana" onClose={onClose}>
      <div className="mt-3.5 space-y-5">
        <div className="space-y-2">
          <span className={campoEtiqueta}>Qué colores</span>
          <ElegirColores
            colores={disponibles}
            grupos={grupos}
            elegidos={elegidos}
            onAlternar={alternar}
            onCreado={(c) => {
              setCreados((xs) => [...xs, c]);
              setElegidos((xs) => (xs.includes(c.codigo) ? xs : [...xs, c.codigo]));
            }}
            cartaAbierta={false}
            enfocarBuscador
          />
        </div>

        {elegidos.length > 0 && (
          <Aviso tono="info" chico>
            {fraseDeLosColoresNuevos(nombres, variantes)}
          </Aviso>
        )}

        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose} disabled={cargando}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              cargando={cargando}
              textoCargando="Agregando…"
              onClick={() =>
                void agregar(
                  { colorCodigos: elegidos },
                  `${elegidos.length === 1 ? `Color ${nombres[0]} agregado` : `Colores ${nombres.join(", ")} agregados`} a ${referencia}`,
                  "agregar los colores"
                )
              }
              disabled={elegidos.length === 0 || !responsable.listo}
              title={elegidos.length === 0 ? "Elige los colores que faltan." : (responsable.motivo ?? undefined)}
            >
              {elegidos.length === 0 ? "Agregar colores" : elegidos.length === 1 ? `Agregar ${nombres[0]}` : `Agregar ${elegidos.length} colores`}
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
