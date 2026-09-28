"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { AvisoInline, ChipOpcion } from "@/components/alta-producto/piezas";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import {
  bloqueoPorVenta,
  choqueDeCorreccion,
  codigoQueMuestra,
  nombreVariante,
  puedeQuedarSinColor,
  textoChoque,
  unidadesEnStock,
  vistaPreviaCorreccion,
  type Destino,
  type FilaFicha,
} from "@/lib/variantes-ficha-reglas";
import { ElegirUnColor, PieModal, SIN_COLOR, VistaPreviaCodigos, type ContextoFicha } from "./piezas";

// «Esta prenda se registró mal» (D-136): corrige el color, la talla o los dos de una o varias variantes que ya existen.
// NO es «llegó un color nuevo» (eso es Agregar color): la primera línea del modal lo dice, porque confundirlos es el
// único error caro de esta pantalla (se vendieron 20 Negro S, llega Azul y alguien le cambia el color en vez de
// agregarlo: el análisis diría que se vendieron 20 Azul). La corrección conserva id, stock, historia y etiquetas; el
// código se recalcula y el viejo sigue sonando (D-137). Si cae sobre una combinación que ya existe, no deja confirmar
// y dice cuál es y qué hacer (D-138). Nada se guarda aquí: se aplica en la ficha y viaja con «Guardar cambios».
//
// Corrigiendo UN eje (el chip de un color o de una talla, «Corregir color») no se ofrece el valor que ya tiene: la
// pregunta es «¿cuál es el de verdad?», y elegir el mismo apagaba el botón sin decir por qué. Para una fila NUEVA
// (todavía no existe) el mismo modal es «Cambiar»: no hay stock ni historia que conservar.

export type EjesCorreccion = "color" | "talla" | "ambos";

export function CorregirVarianteModal({
  ctx,
  filas,
  claves,
  ejes,
  tallas,
  onConfirmar,
  onClose,
}: {
  ctx: ContextoFicha;
  /** Todas las filas de la prenda (para ver choques y códigos ocupados). */
  filas: FilaFicha[];
  /** Las que se corrigen. */
  claves: string[];
  ejes: EjesCorreccion;
  /** Las tallas habilitadas en la categoría, ya ordenadas. */
  tallas: ValorVocabulario[];
  onConfirmar: (destino: Destino) => void;
  onClose: () => void;
}) {
  const n = ctx.nombres;
  const afectadas = filas.filter((f) => claves.includes(f.clave));
  const primera = afectadas[0];
  const colorActual = primera?.colorCodigo ?? null;
  const tallaActual = primera?.tallaId ?? null;
  // Corrigiendo UN eje, empieza vacío: la pregunta es «¿cuál es el de verdad?», y mostrar el que tiene se leería como la
  // respuesta. Corrigiendo una fila (los dos ejes), empieza con lo que tiene: casi siempre se cambia solo uno.
  const [color, setColor] = useState<string>(ejes === "ambos" ? (colorActual ?? SIN_COLOR) : "");
  const [talla, setTalla] = useState<string | null>(ejes === "ambos" ? tallaActual : null);
  // Se eligió algo (para decir «es el que ya tiene» solo después de elegir, no al abrir).
  const [tocado, setTocado] = useState(false);
  const nuevas = afectadas.length > 0 && afectadas.every((f) => !f.guardada);

  const tocaColor = ejes !== "talla";
  const tocaTalla = ejes !== "color";
  const colorElegido = color === SIN_COLOR ? null : color;
  const destino: Destino = {
    ...(tocaColor && color !== "" && colorElegido !== colorActual ? { colorCodigo: colorElegido } : {}),
    ...(tocaTalla && (ejes === "ambos" || talla !== null) && talla !== tallaActual ? { tallaId: talla } : {}),
  };
  const sinCambio = destino.colorCodigo === undefined && destino.tallaId === undefined;

  const bloqueo = bloqueoPorVenta(afectadas, ctx.estado, ctx.esLider, n);
  const choque = sinCambio ? null : choqueDeCorreccion(filas, claves, destino);
  const vista = sinCambio ? [] : vistaPreviaCorreccion(filas, claves, destino, ctx.codigoProducto, n);
  const unidades = unidadesEnStock(afectadas, ctx.estado);
  // Corrigiendo solo la talla, la que ya tiene no se ofrece. Corrigiendo la fila entera, sí (empieza marcada), aunque ya
  // no esté habilitada en la categoría: si no, no se vería cuál es.
  const opcionesTalla =
    ejes === "talla"
      ? tallas.filter((t) => t.id !== tallaActual)
      : tallaActual && !tallas.some((t) => t.id === tallaActual)
        ? [{ id: tallaActual, texto: n.talla(tallaActual) }, ...tallas]
        : tallas;
  // Lo mismo con el color: corrigiendo solo el color, el que ya tiene no está en la lista («Sin color» incluido).
  const coloresOfrecidos = ejes === "color" ? ctx.colores.filter((c) => c.codigo !== colorActual) : ctx.colores;
  const ofrecerSinColor = ejes === "color" ? colorActual !== null && puedeQuedarSinColor(filas, claves) : colorActual === null || puedeQuedarSinColor(filas, claves);
  const esElQueTiene = tocado && sinCambio;

  const cuantas = afectadas.length;
  const cuales = cuantas === 1 ? "esta prenda" : `estas ${cuantas} prendas`;
  const deQue = ejes === "color" ? "de otro color" : ejes === "talla" ? "de otra talla" : "de otro color o de otra talla";
  const otroGesto = ejes === "talla" ? "«Agregar talla»" : ejes === "color" ? "«Agregar color»" : "«Agregar color» o «Agregar talla»";
  // El mismo verbo que el botón que lo abre: «Corregir color», «Corregir talla»; «Cambiar» solo para una fila nueva.
  const titulo = nuevas
    ? "Cambiar color o talla"
    : ejes === "color"
      ? "Corregir color"
      : ejes === "talla"
        ? "Corregir talla"
        : "Corregir color o talla";
  const alcance =
    ejes === "color"
      ? `${n.color(colorActual)} · ${afectadas.map((f) => n.talla(f.tallaId) || "sin talla").join(", ")}`
      : ejes === "talla"
        ? `Talla ${n.talla(tallaActual) || "sin talla"} · ${afectadas.map((f) => n.color(f.colorCodigo)).join(", ")}`
        : afectadas.map((f) => codigoQueMuestra(filas, f, ctx.codigoProducto, n) ?? nombreVariante(f, n)).join(", ");
  const queTiene =
    ejes === "color"
      ? "Es el color que ya tiene: elige el de verdad."
      : ejes === "talla"
        ? "Es la talla que ya tiene: elige la de verdad."
        : nuevas
          ? "Es la que ya tiene: elige otro color u otra talla."
          : "Es la que ya tiene: elige su color o su talla de verdad.";

  return (
    <Modal titulo={titulo} subtitulo={nuevas ? "De una variante nueva, antes de guardarla" : "Para cuando se registró mal"} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <div className="space-y-4">
          {nuevas ? (
            <p className="text-sm text-tinta/80">Todavía no existe: cambiarla no toca stock ni historia.</p>
          ) : (
            <p className="text-sm text-tinta/80">
              Úsalo si {cuales}
              {unidades ? ` (${unidades} u.)` : ""} en realidad {cuantas === 1 ? "es" : "son"} {deQue}: {cuantas === 1 ? "conserva" : "conservan"} su stock, su
              historia y sus etiquetas. Si llegó mercadería nueva, usa {otroGesto}.
            </p>
          )}
          <p className="text-[12.5px] text-taupe">
            {nuevas ? "Se cambia" : "Se corrige"}: <span className="text-tinta">{alcance}</span>
          </p>

          {tocaColor && (
            <div>
              <p className="mb-1 text-[12.5px] font-semibold text-tinta">Su color de verdad</p>
              <ElegirUnColor
                valor={color}
                onValor={(v) => {
                  setColor(v);
                  setTocado(true);
                }}
                colores={coloresOfrecidos}
                ofrecerSinColor={ofrecerSinColor}
                etiqueta="Color correcto"
              />
            </div>
          )}

          {tocaTalla && (
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-tinta">Su talla de verdad</p>
              {opcionesTalla.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {opcionesTalla.map((t) => (
                    <ChipOpcion
                      key={t.id}
                      elegido={talla === t.id}
                      onClick={() => {
                        setTalla(t.id);
                        setTocado(true);
                      }}
                      className="min-w-11 justify-center tabular-nums"
                    >
                      {t.texto}
                    </ChipOpcion>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-taupe">{ejes === "talla" ? "Esta categoría no tiene otras tallas habilitadas." : "Esta categoría no tiene tallas habilitadas."}</p>
              )}
            </div>
          )}

          {esElQueTiene && <p className="text-[12.5px] text-ambar-profundo">{queTiene}</p>}
          {bloqueo && (
            <AvisoInline tono="ambar" alerta>
              {bloqueo}
            </AvisoInline>
          )}
          {choque && (
            <AvisoInline tono="rojo" alerta>
              {textoChoque(choque, destino, filas, ctx)}
            </AvisoInline>
          )}
          {!choque && !bloqueo && <VistaPreviaCodigos filas={vista} />}

          <PieModal
            onCancelar={cerrar}
            texto={nuevas ? "Cambiar" : cuantas === 1 ? "Corregir" : `Corregir ${cuantas} variantes`}
            deshabilitado={sinCambio || !!choque || !!bloqueo}
            onConfirmar={() => {
              onConfirmar(destino);
              cerrar();
            }}
          />
        </div>
      )}
    </Modal>
  );
}
