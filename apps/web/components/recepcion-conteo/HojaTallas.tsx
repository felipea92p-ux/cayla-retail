"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { BloquePrenda } from "@/components/recepcion-envio/BloquePrenda";
import type { ColorAlta } from "@/lib/alta-producto";
import { sumasDe, type CategoriaDeLinea, type Conteo, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { conteoDeVariantes, variantesDeConteo, type VarianteSeparada } from "@/lib/recepcion-conteo-reglas";

// «Tallas y colores» de una prenda separada (ADR-0393; decisión 1: solo lo que tiene talla y color entra al stock). Es la matriz de la
// recepción de la fase 4 —el mismo bloque: cuántas de cada talla y color, si llegó algo dañado y si tiene arreglo—, en una hoja. Sirve al
// contar (lo detallado queda en el borrador y entra al cerrar) y en «Hacer ahora» (entra al stock en el acto). Si al poner las tallas se ve
// que era otra prenda, se cambia aquí («Cambiar»), o se crea («Es nueva») o se le suma una talla o color («+ talla o color»).

const IDS = { prenda: "tallas-prenda", conteo: "tallas-cuantas", danadas: "tallas-danadas", arreglo: "tallas-arreglo" } as const;

export function HojaTallas({
  prenda: prendaInicial,
  categoria,
  marca,
  colores,
  variantes,
  sugeridas,
  maximo = null,
  textoListo,
  guardando = false,
  error = null,
  onListo,
  onAbrirHoja,
  onCerrar,
}: {
  prenda: PrendaRecepcion;
  categoria: CategoriaDeLinea;
  marca: { id: string; nombre: string };
  colores: readonly ColorAlta[];
  /** Lo ya detallado (para seguir corrigiéndolo). */
  variantes: readonly VarianteSeparada[] | null;
  /** Cuántas se contaron de esta prenda: «Contaste 12». */
  sugeridas: number | null;
  /** En «Hacer ahora», lo que queda del pendiente: la base no deja meter más (si llegaron más, se reabre el conteo). */
  maximo?: number | null;
  /** «Listo» al contar; «Meter al stock» en «Hacer ahora». */
  textoListo: string;
  guardando?: boolean;
  error?: string | null;
  onListo: (prenda: PrendaRecepcion, variantes: VarianteSeparada[]) => void;
  /** «Es nueva» o «+ talla o color»: la pantalla abre la hoja de la prenda y vuelve aquí con la que quedó. */
  onAbrirHoja: (modo: "nueva" | "agregar", prenda: PrendaRecepcion | null) => void;
  onCerrar: () => void;
}) {
  const [prenda, setPrenda] = useState<PrendaRecepcion | null>(prendaInicial);
  const [conteo, setConteo] = useState<Conteo>(() => conteoDeVariantes(variantes));
  const s = sumasDe(conteo, prenda);
  const campos = useMemo(
    () => [
      { id: IDS.prenda, nombre: "Qué prenda es", requerido: true, hecho: prenda !== null, pendiente: "Elige la prenda." },
      {
        id: IDS.conteo,
        nombre: "Tallas y colores",
        requerido: true,
        hecho: s.contado > 0 && s.invalidas === 0 && (maximo == null || s.contado <= maximo),
        pendiente:
          maximo != null && s.contado > maximo
            ? `Quedan ${maximo.toLocaleString("es-PE")} y pusiste ${s.contado.toLocaleString("es-PE")}. Si llegaron más, reabre el conteo.`
            : "Reparte cuántas llegaron de cada talla y color.",
      },
      ...(conteo.conDanadas
        ? [
            { id: IDS.danadas, nombre: "Dañadas", requerido: true, hecho: s.danadas > 0 && s.danadasDeMas.length === 0, pendiente: "Di cuántas llegaron dañadas, o cierra «¿Llegó algo dañado?»." },
            ...(s.danadas > 0 ? [{ id: IDS.arreglo, nombre: "Si tienen arreglo", requerido: true, hecho: conteo.arreglo !== null, pendiente: "Di si tienen arreglo." }] : []),
          ]
        : []),
    ],
    [prenda, s.contado, s.invalidas, s.danadas, s.danadasDeMas.length, conteo.conDanadas, conteo.arreglo, maximo],
  );
  const guia = useGuiaCampos(campos);

  return (
    <Modal
      titulo={prenda ? `Tallas y colores · ${prenda.nombre}` : "¿Qué prenda es?"}
      subtitulo={
        sugeridas != null
          ? `Contaste ${sugeridas.toLocaleString("es-PE")}. Reparte cuántas llegaron de cada talla y color: con eso entran al stock del almacén.`
          : "Reparte cuántas llegaron de cada talla y color: con eso entran al stock del almacén."
      }
      ancho="max-w-3xl"
      bloqueado={guardando}
      conCerrar
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (prenda && guia.puedeConfirmar) onListo(prenda, variantesDeConteo(conteo, prenda));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
          }}
          className="space-y-4"
        >
          <BloquePrenda
            ids={IDS}
            guia={guia}
            etiqueta={guia.etiqueta}
            conteo={conteo}
            prenda={prenda}
            categoria={categoria}
            marca={marca}
            colores={colores}
            enviado={sugeridas}
            onPrenda={(p) => {
              setPrenda(p);
              setConteo(conteoDeVariantes(null));
            }}
            onConteo={(cambios) => setConteo((c) => ({ ...c, ...cambios }))}
            onAbrirHoja={(modo) => onAbrirHoja(modo, prenda)}
          />
          {maximo == null && sugeridas != null && prenda && s.contado > 0 && s.contado !== sugeridas && (
            <p className="text-xs text-taupe">Contaste {sugeridas.toLocaleString("es-PE")} de esta prenda: al guardar, pasan a ser {s.contado.toLocaleString("es-PE")}.</p>
          )}
          {maximo != null && s.contado > maximo && (
            <Aviso tono="atencion" chico titulo={`Quedan ${maximo.toLocaleString("es-PE")} por meter y pusiste ${s.contado.toLocaleString("es-PE")}`}>
              Si llegaron más de las que se contaron, reabre el conteo del envío y corrígelo ahí.
            </Aviso>
          )}
          {error && (
            <Aviso tono="error" titulo="No se pudo guardar">
              {error}
            </Aviso>
          )}
          <div className="pie-hoja-fijo">
            <div className="space-y-3 border-t border-sand pt-3">
              <PieGuia guia={guia} listo="Todo listo." />
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <Boton type="button" onClick={cerrar} disabled={guardando}>
                  Dejar para después
                </Boton>
                <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  {guardando ? "Guardando…" : textoListo}
                </Boton>
              </div>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
