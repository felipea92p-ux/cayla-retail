"use client";

import { useId, useState } from "react";
import { PencilLine, SearchX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Buscador } from "@/components/ui/Buscador";
import { ListaSugerencias, ariaDelBuscador } from "@/components/ui/ListaSugerencias";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { Vacio } from "@/components/ui/Vacio";
import { detalleDelModelo, detalleSinStock, modelosParaAjustar, TOPE_MODELOS } from "@/lib/existencias-buscar-ajuste";
import { sinStockQueCoincide, type ProductoSinStock } from "@/lib/existencias-vacio";
import type { IndiceBusquedaEspecial } from "@/lib/filtro-busqueda-especial";
import type { FilaExistencias } from "@/lib/inventario-v2";

// «¿Qué prenda vas a ajustar?» — lo que abre «Ajustar stock» de la cabecera de Existencias (ADR-0494). Se escribe el nombre o el código
// (o se escanea la etiqueta), se elige el modelo y el modal de la prenda abre su planilla con esa talla en foco. Busca mientras se
// escribe, con el mismo índice que el buscador de la lista (`indiceDeExistencias`).
//
// Una prenda que esta sede NUNCA movió (recién creada, o que no llegó) no tiene ni una fila de `stock`, así que el índice no la conoce: se
// busca también entre «en el catálogo, sin stock aquí» (`sinStock`) y, al elegirla, abre la planilla del producto entero, donde cada talla
// entra como stock inicial (ADR-0235). Es donde se le carga su primer stock: sin esto, «Polo Venus» no aparecía.

export function BuscarPrendaParaAjustar({
  indice,
  sedeNombre,
  sinStock,
  onElegir,
  onElegirSinStock,
  onClose,
}: {
  indice: IndiceBusquedaEspecial<FilaExistencias>;
  sedeNombre: string;
  /** Los productos del catálogo que esta sede nunca movió: también se pueden ajustar (su primera carga). */
  sinStock: readonly ProductoSinStock[];
  /** La prenda (modelo + color) y la talla en que entra la planilla. */
  onElegir: (clave: string, varianteId: string) => void;
  /** Un producto sin ninguna fila aquí: la planilla abre con todos sus colores y tallas. */
  onElegirSinStock: (productoId: string) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [activa, setActiva] = useState(0);
  const idLista = useId();
  const modelos = modelosParaAjustar(indice, texto);
  // Los que la sede nunca movió van después de los que sí, y entre los dos no pasan del tope de la lista.
  const sinFila = texto.trim() ? sinStockQueCoincide(texto, indice.vocabulario, sinStock, { limite: Math.max(0, TOPE_MODELOS - modelos.length) }).productos : [];
  const total = modelos.length + sinFila.length;
  const abierta = total > 0;

  function elegir(i: number) {
    const m = modelos[i];
    if (m) return onElegir(m.clave, m.varianteId);
    const p = sinFila[i - modelos.length];
    if (p) onElegirSinStock(p.id);
  }

  return (
    <Modal variante="hoja" tamano="mediana" conCerrar titulo="¿Qué prenda vas a ajustar?" subtitulo="Escribe su nombre o su código, o escanea su etiqueta." onClose={onClose}>
      {() => (
        <div className="grid gap-3">
          <Buscador
            valor={texto}
            onCambio={(t) => {
              setTexto(t);
              setActiva(0);
            }}
            autoFocus
            etiqueta="Buscar la prenda que vas a ajustar"
            // sugerir-fijo: dice qué se puede buscar; no depende de nada elegido antes
            placeholder="Nombre, código o color"
            {...ariaDelBuscador(idLista, abierta, abierta ? activa : null)}
            onKeyDown={(e) => {
              if (!abierta) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActiva((a) => (a + (e.key === "ArrowDown" ? 1 : total - 1)) % total);
              } else if (e.key === "Enter") {
                e.preventDefault();
                elegir(activa);
              }
            }}
          />
          {!texto.trim() ? (
            <Vacio tamano="chico" alinear="izquierda" icono={<PencilLine aria-hidden className="h-5 w-5" />}>
              Elige una prenda y se abre su planilla, con todos sus colores y tallas en {sedeNombre}.
            </Vacio>
          ) : abierta ? (
            <ListaSugerencias
              id={idLista}
              enLinea
              etiqueta="Prendas que coinciden"
              activa={activa}
              onActiva={setActiva}
              onElegir={elegir}
              sugerencias={[
                ...modelos.map((m) => ({
                  clave: m.productoId,
                  miniatura: <MiniaturaPrenda fotoUrl={m.fila.fotoUrl} colorHex={m.fila.colorHex} tamano="md" {...categoriaDe(m.fila)} />,
                  titulo: m.referencia,
                  detalle: detalleDelModelo(m),
                })),
                ...sinFila.map((p) => ({
                  clave: p.id,
                  miniatura: <MiniaturaPrenda fotoUrl={null} colorHex={null} tamano="md" categoria={p.categoria} />,
                  titulo: p.referencia,
                  detalle: detalleSinStock(p),
                })),
              ]}
            />
          ) : (
            <Vacio tamano="chico" alinear="izquierda" icono={<SearchX aria-hidden className="h-5 w-5" />}>
              No encuentro «{texto.trim()}» en {sedeNombre}. Prueba con otra palabra o con el código de la etiqueta.
            </Vacio>
          )}
        </div>
      )}
    </Modal>
  );
}
