"use client";

import { ChevronDown, Plus, Tag, Truck } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { ID_CAMPO_AGREGAR } from "@/lib/recepcion-conteo-reglas";
import {
  idCampoParada,
  nombreDeParada,
  origenDelGrupo,
  paradaContada,
  resumenDeCategoria,
  SIN_FILTRO,
  type CategoriaDelEnvio,
  type FiltroDelConteo,
  type ModeloDelConteo,
  type OpcionDelFiltro,
  type ParadaDelConteo,
} from "@/lib/recepcion-modelos-reglas";
import { BaldosaCategoria } from "./piezas";

// Las categorías del envío (Felipe 2026-11-02, sobre el acordeón de ADR-0575): cada categoría UNA vez, aunque venga de varios proveedores o marcas.
// La abierta muestra sus modelos uno por uno, y tocar uno lo pone en el Dial: se cuenta modelo por modelo y la categoría suma sola. Si el envío trae
// más de un proveedor o marca, arriba se filtra por ellos. Con la tarjeta ancha va en una columna a la izquierda; si no, encima de la placa (lo
// decide `rc-mesa` por el ancho de la tarjeta, no de la ventana).

/** Más puntos que estos y la fila se parte: los que sobran los dice el número («3 / 20»). */
const MAX_PUNTOS = 14;

function EstadoModelo({ m }: { m: ModeloDelConteo }) {
  if (m.estado === "fuera") return <Chip tono="pizarra">No estaba anotada</Chip>;
  if (m.estado === "cuadra") return <Chip tono="verde">Cuadra</Chip>;
  if (m.estado === "sobran") return <Chip tono="ambar">{`Sobran ${m.contadas - (m.esperadas ?? 0)}`}</Chip>;
  if (m.estado === "a-medias") return <Chip tono="ambar">{`Faltan ${(m.esperadas ?? 0) - m.contadas}`}</Chip>;
  if (m.estado === "no-llego") return <Chip tono="neutro">No llegó</Chip>;
  return <Chip tono="neutro">Por contar</Chip>;
}

function FilaDeParada({ p, activa, conOrigen, k, onElegir }: { p: ParadaDelConteo; activa: boolean; conOrigen: boolean; k: number; onElegir: (p: ParadaDelConteo) => void }) {
  const m = p.modelo;
  const contadas = m ? m.contadas : p.grupo.contadas;
  const esperadas = m ? m.esperadas : p.grupo.dijeron;
  return (
    <li>
      <button
        type="button"
        className="rc-acord-prenda"
        style={{ "--k": k } as React.CSSProperties}
        data-activa={activa ? "" : undefined}
        data-campo={idCampoParada(p)}
        aria-current={activa ? "true" : undefined}
        onClick={() => onElegir(p)}
      >
        <span className="flex min-w-0 items-baseline justify-between gap-2">
          <b className="min-w-0 truncate text-[14px] text-tinta">{nombreDeParada(p)}</b>
          <span className="shrink-0 text-sm tabular-nums text-taupe">
            <b className="font-semibold text-tinta">{contadas}</b>
            {esperadas != null && ` / ${esperadas}`}
          </span>
        </span>
        {conOrigen && <span className="block truncate text-sm text-taupe">{origenDelGrupo(p.grupo)}</span>}
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {esperadas != null && esperadas <= MAX_PUNTOS && (
            <span aria-hidden className="rc-acord-puntos">
              {Array.from({ length: esperadas }, (_, n) => (
                <i key={n} data-lleno={n < contadas ? "" : undefined} />
              ))}
            </span>
          )}
          {m ? <EstadoModelo m={m} /> : !paradaContada(p) && <Chip tono="neutro">Por contar</Chip>}
        </span>
      </button>
    </li>
  );
}

export function CategoriasAcordeon({
  categorias,
  enFoco,
  sinAviso,
  filtro,
  proveedores,
  marcas,
  filtrarProveedor,
  filtrarMarca,
  totalCategorias,
  onFiltro,
  onElegir,
  onAgregar,
}: {
  categorias: readonly CategoriaDelEnvio[];
  /** Lo que el Dial está contando ahora: su categoría va abierta. */
  enFoco: ParadaDelConteo | null;
  sinAviso: boolean;
  filtro: FiltroDelConteo;
  proveedores: readonly OpcionDelFiltro[];
  marcas: readonly OpcionDelFiltro[];
  /** ¿El envío trae más de un proveedor (o marca)? Si no, ese filtro no se dibuja. */
  filtrarProveedor: boolean;
  filtrarMarca: boolean;
  /** Cuántas categorías trae el envío entero: para decir cuántas se están viendo. */
  totalCategorias: number;
  onFiltro: (f: FiltroDelConteo) => void;
  onElegir: (p: ParadaDelConteo) => void;
  onAgregar: () => void;
}) {
  const hayFiltro = !!filtro.proveedorId || !!filtro.marcaId;
  return (
    <nav aria-label="Categorías del envío" className="rc-acord" data-guia="recepcion.categorias">
      <p className="label-cayla px-1 text-[11px] text-taupe">{sinAviso ? "Lo que llegó" : "Categorías del envío"}</p>
      {(filtrarProveedor || filtrarMarca) && (
        <div className="rc-acord-filtros" data-guia="recepcion.filtros">
          {filtrarProveedor && (
            <DesplegablePildora
              icono={Truck}
              etiqueta="Proveedor"
              encoger
              valor={filtro.proveedorId ?? TODOS}
              onValor={(v) => onFiltro({ ...filtro, proveedorId: v === TODOS ? null : v })}
              opciones={[{ valor: TODOS, texto: "Todos" }, ...proveedores.map((o) => ({ valor: o.valor, texto: o.etiqueta }))]}
            />
          )}
          {filtrarMarca && (
            <DesplegablePildora
              icono={Tag}
              etiqueta="Marca"
              encoger
              valor={filtro.marcaId ?? TODOS}
              onValor={(v) => onFiltro({ ...filtro, marcaId: v === TODOS ? null : v })}
              opciones={[{ valor: TODOS, texto: "Todas" }, ...marcas.map((o) => ({ valor: o.valor, texto: o.etiqueta }))]}
            />
          )}
        </div>
      )}
      {hayFiltro && (
        <p className="px-1 text-sm text-taupe">
          {categorias.length} de {totalCategorias} {totalCategorias === 1 ? "categoría" : "categorías"}. Abajo, los totales siguen siendo de todo el envío.{" "}
          <button type="button" className="btn-cayla btn-enlace" onClick={() => onFiltro(SIN_FILTRO)}>
            Ver todas
          </button>
        </p>
      )}
      {categorias.map((c, i) => {
        const esta = !!enFoco && c.grupos.some((g) => g.clave === enFoco.grupo.clave);
        // Hecha solo con todo contado Y todas sus prendas identificadas (Felipe 2026-10-27).
        const estado = c.hecha ? "hecho" : esta ? "ahora" : "falta";
        const dif = c.dijeron != null && c.hayConteo ? c.contadas - c.dijeron : null;
        const nombre = c.categoria?.nombre ?? "Categoría";
        const fuera = c.grupos.every((g) => !g.principal.linea);
        const idCuerpo = `rc-acord-${c.clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;
        return (
          <div key={c.clave} className="rc-acord-grupo" data-abierta={esta ? "" : undefined} style={{ "--i": i } as React.CSSProperties}>
            <button
              type="button"
              className="rc-acord-cabeza"
              aria-current={esta ? "true" : undefined}
              aria-expanded={esta}
              aria-controls={idCuerpo}
              onClick={() => {
                // Abrir otra categoría es ponerse a contar en ella: su primer modelo sin contar, o el primero. Tocar la abierta no hace nada.
                if (esta) return;
                const destino = c.paradas.find((p) => !paradaContada(p)) ?? c.paradas[0];
                if (destino) onElegir(destino);
              }}
            >
              <BaldosaCategoria categoria={c.categoria} tamano="chico" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px] text-tinta">{nombre}</b>
                <span className="block truncate text-sm text-taupe">{[resumenDeCategoria(c), fuera && !sinAviso ? "no venía" : null].filter(Boolean).join(" · ")}</span>
              </span>
              {dif != null && dif !== 0 && <Chip tono="ambar">{dif > 0 ? `+${dif}` : dif}</Chip>}
              <MarcaCampo estado={estado} />
              <ChevronDown aria-hidden className="rc-acord-flecha h-4 w-4 shrink-0 text-taupe" />
            </button>
            <div id={idCuerpo} className="rc-acord-cuerpo" inert={!esta}>
              <div className="rc-acord-dentro">
                <ul className="space-y-1.5 p-1.5">
                  {c.paradas.map((p, k) => (
                    <FilaDeParada key={p.clave} p={p} k={k} activa={enFoco?.clave === p.clave} conOrigen={c.variosOrigenes} onElegir={onElegir} />
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="rc-cat-agregar rc-acord-agregar"
        onClick={onAgregar}
        data-guia="recepcion.agregar"
        data-campo={totalCategorias === 0 ? ID_CAMPO_AGREGAR : undefined}
        title={sinAviso ? undefined : "Una categoría que no venía en el envío"}
      >
        <Plus aria-hidden className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap text-[14.5px]">{sinAviso ? "Agregar lo que llegó" : "Agregar categoría"}</span>
      </button>
    </nav>
  );
}
