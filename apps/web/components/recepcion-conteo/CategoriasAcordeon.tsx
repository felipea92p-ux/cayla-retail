"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Tag, Truck } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { ID_CAMPO_AGREGAR, marcaDeLinea } from "@/lib/recepcion-conteo-reglas";
import {
  conMiles,
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
  type OrdenDelConteo,
  type ParadaDelConteo,
} from "@/lib/recepcion-modelos-reglas";
import { BaldosaCategoria } from "./piezas";
import { useFilaActivaALaVista } from "./useFilaActivaALaVista";

// Las categorías del envío (Felipe 2026-11-02, sobre el acordeón de ADR-0575): cada categoría UNA vez, aunque venga de varios proveedores o marcas.
// La abierta muestra todo lo que anotó Compras, modelo por modelo y en columnas, y tocar uno lo pone en el Dial: se cuenta modelo por modelo y la
// categoría suma sola. Si el envío trae más de un proveedor o marca, arriba se filtra por ellos. Con la tarjeta ancha toma el ancho que deja la
// placa; si no, va encima de ella (lo decide `rc-mesa` por el ancho de la tarjeta, no de la ventana).

/** Más puntos que estos y la fila se parte: los que sobran los dice el número («3 / 20»). */
const MAX_PUNTOS = 14;

function EstadoModelo({ m }: { m: ModeloDelConteo }) {
  if (m.estado === "fuera") return <Chip tono="pizarra">No estaba anotada</Chip>;
  if (m.estado === "cuadra") return <Chip tono="verde">Cuadra</Chip>;
  if (m.estado === "sobran") return <Chip tono="ambar">{`Sobran ${conMiles(m.contadas - (m.esperadas ?? 0))}`}</Chip>;
  if (m.estado === "a-medias") return <Chip tono="ambar">{`Faltan ${conMiles((m.esperadas ?? 0) - m.contadas)}`}</Chip>;
  if (m.estado === "no-llego") return <Chip tono="neutro">No llegó</Chip>;
  return <Chip tono="neutro">Por contar</Chip>;
}

/** Las fotos de los modelos de la categoría en la que se cuenta, de su catálogo por marca. Solo se piden al llegar a ella; si no responde, cada fila dibuja su prenda sin foto. */
function useFotosDeLaCategoria(c: CategoriaDelEnvio, enUso: boolean): ReadonlyMap<string, string | null> {
  const [fotos, setFotos] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const pares = new Map<string, { categoriaId: string; marcaId: string | null }>();
  for (const g of c.grupos) {
    const categoriaId = g.principal.categoria?.id;
    if (!categoriaId) continue;
    const marcaId = marcaDeLinea(g.principal).id;
    pares.set(`${categoriaId}|${marcaId ?? ""}`, { categoriaId, marcaId });
  }
  const clave = [...pares.keys()].sort().join(",");
  useEffect(() => {
    if (!enUso || !clave) return;
    let vigente = true;
    void Promise.all([...pares.values()].map((par) => buscarPrendasParaRecibir(par.categoriaId, par.marcaId, ""))).then((respuestas) => {
      if (vigente) setFotos(new Map(respuestas.flatMap((r) => r.prendas.map((prenda) => [prenda.productoId, prenda.fotoUrl] as const))));
    });
    return () => {
      vigente = false;
    };
    // `clave` ya dice qué pares hay: `pares` se rearma en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enUso, clave]);
  return fotos;
}

/** Los modelos de la categoría abierta, en tantas columnas como quepan: con muchos, la lista tiene su propio scroll y la fila activa se queda a la vista. */
function ListaDeParadas({ c, enFoco, onElegir }: { c: CategoriaDelEnvio; enFoco: ParadaDelConteo | null; onElegir: (p: ParadaDelConteo) => void }) {
  // También al ordenar: la fila activa cambia de lugar sin que cambie lo que se cuenta.
  const lista = useFilaActivaALaVista<HTMLUListElement>(`${enFoco?.clave ?? ""}|${c.paradas[0]?.clave ?? ""}`);
  const fotos = useFotosDeLaCategoria(c, !!enFoco);
  return (
    <ul ref={lista} className="rc-acord-lista scroll-cayla p-1.5">
      {c.paradas.map((p, k) => (
        <FilaDeParada
          key={p.clave}
          p={p}
          k={k}
          activa={enFoco?.clave === p.clave}
          conOrigen={c.variosOrigenes}
          foto={p.modelo?.productoId ? (fotos.get(p.modelo.productoId) ?? null) : null}
          onElegir={onElegir}
        />
      ))}
    </ul>
  );
}

function FilaDeParada({
  p,
  activa,
  conOrigen,
  foto,
  k,
  onElegir,
}: {
  p: ParadaDelConteo;
  activa: boolean;
  conOrigen: boolean;
  foto: string | null;
  k: number;
  onElegir: (p: ParadaDelConteo) => void;
}) {
  const m = p.modelo;
  const cat = p.grupo.principal.categoria;
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
        {m && cat && <MiniaturaPrenda fotoUrl={foto} prefijo={cat.prefijo} familia={cat.familia} categoria={cat.nombre} />}
        <span className="rc-acord-prenda-datos">
          <span className="flex min-w-0 items-start justify-between gap-2">
            <b className="line-clamp-2 min-w-0 text-[14px] text-tinta" title={nombreDeParada(p)}>
              {nombreDeParada(p)}
            </b>
            <span className="shrink-0 text-sm tabular-nums text-taupe">
              <b className="font-semibold text-tinta">{conMiles(contadas)}</b>
              {esperadas != null && ` / ${conMiles(esperadas)}`}
            </span>
          </span>
          {/* Si la categoría junta varios, de qué proveedor y marca: en su línea, para que se lea entero. */}
          {conOrigen && (
            <span className="block truncate text-sm text-taupe" title={origenDelGrupo(p.grupo)}>
              {origenDelGrupo(p.grupo)}
            </span>
          )}
          {/* En qué va y, al lado, cuánto lleva: con pocas prendas, un punto por prenda; con muchas, una barra fina. */}
          <span className="flex min-w-0 items-center gap-x-2">
            {m ? <EstadoModelo m={m} /> : !paradaContada(p) && <Chip tono="neutro">Por contar</Chip>}
            {esperadas != null && (
              <span className="min-w-0 flex-1">
                {esperadas <= MAX_PUNTOS ? (
                  <span aria-hidden className="rc-acord-puntos">
                    {Array.from({ length: esperadas }, (_, n) => (
                      <i key={n} data-lleno={n < contadas ? "" : undefined} />
                    ))}
                  </span>
                ) : (
                  <BarraAvance pct={esperadas > 0 ? (contadas / esperadas) * 100 : 0} alto="fina" tono={contadas > esperadas ? "ambar" : undefined} decorativa />
                )}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Lo que va sobre la mesa: el título, los filtros (si el envío trae más de un proveedor o marca) y el orden por cantidad, con dos flechas. En su propia fila,
 * sobre las dos columnas, para que la primera categoría y la placa del Dial empiecen a la misma altura (Felipe 2026-11-02).
 */
export function FiltrosDelEnvio({
  cuantas,
  sinAviso,
  filtro,
  proveedores,
  marcas,
  filtrarProveedor,
  filtrarMarca,
  totalCategorias,
  onFiltro,
  orden,
  conOrden,
  onOrden,
}: {
  /** Cuántas categorías se están viendo con el filtro puesto. */
  cuantas: number;
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
  orden: OrdenDelConteo;
  /** ¿Hay más de una cosa que ordenar? Si no, las flechas no se dibujan. */
  conOrden: boolean;
  onOrden: (o: OrdenDelConteo) => void;
}) {
  const hayFiltro = !!filtro.proveedorId || !!filtro.marcaId;
  const volver = " · tócala otra vez para volver al orden de la compra";
  return (
    <div className="rc-mesa-cabeza">
      <p className="label-cayla text-[11px] text-taupe">{sinAviso ? "Lo que llegó" : "Categorías del envío"}</p>
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
      {conOrden && (
        <div data-guia="recepcion.orden">
          {/* Tocar la flecha que ya está puesta vuelve al orden de la compra. */}
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Ordenar por cantidad"
            valor={orden ?? ""}
            onCambio={(o) => onOrden(o === orden ? null : (o as OrdenDelConteo))}
            opciones={[
              { clave: "asc", icono: <ArrowUp aria-hidden />, etiqueta: <span className="sr-only">De menos a más</span>, ayuda: `De menos a más${orden === "asc" ? volver : ""}` },
              { clave: "desc", icono: <ArrowDown aria-hidden />, etiqueta: <span className="sr-only">De más a menos</span>, ayuda: `De más a menos${orden === "desc" ? volver : ""}` },
            ]}
          />
        </div>
      )}
      {hayFiltro && (
        <p className="text-sm text-taupe">
          {cuantas} de {totalCategorias} {totalCategorias === 1 ? "categoría" : "categorías"}. Abajo, los totales siguen siendo de todo el envío.{" "}
          <button type="button" className="btn-cayla btn-enlace" onClick={() => onFiltro(SIN_FILTRO)}>
            Ver todas
          </button>
        </p>
      )}
    </div>
  );
}

export function CategoriasAcordeon({
  categorias,
  enFoco,
  plegada,
  sinAviso,
  totalCategorias,
  onPlegar,
  onElegir,
  onAgregar,
}: {
  categorias: readonly CategoriaDelEnvio[];
  /** Lo que el Dial está contando ahora: su categoría va abierta, salvo que la persona la pliegue (`plegada`). */
  enFoco: ParadaDelConteo | null;
  plegada: boolean;
  sinAviso: boolean;
  /** Cuántas categorías trae el envío entero: sin ninguna, «Agregar» es lo primero que se pide. */
  totalCategorias: number;
  /** Tocó la categoría abierta (`true`, se pliega) o la plegada (`false`, se abre). Lo que el Dial cuenta no cambia. */
  onPlegar: (plegar: boolean) => void;
  onElegir: (p: ParadaDelConteo) => void;
  onAgregar: () => void;
}) {
  return (
    <nav aria-label="Categorías del envío" className="rc-acord" data-guia="recepcion.categorias">
      {categorias.map((c, i) => {
        const esta = !!enFoco && c.grupos.some((g) => g.clave === enFoco.grupo.clave);
        const abierta = esta && !plegada;
        // Hecha solo con todo contado Y todas sus prendas identificadas (Felipe 2026-10-27).
        const estado = c.hecha ? "hecho" : esta ? "ahora" : "falta";
        // La diferencia es un resultado: solo con toda la categoría contada. A medias, cada modelo dice cómo va.
        const dif = c.dijeron != null && c.contada ? c.contadas - c.dijeron : null;
        const nombre = c.categoria?.nombre ?? "Categoría";
        const fuera = c.grupos.every((g) => !g.principal.linea);
        const idCuerpo = `rc-acord-${c.clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;
        return (
          <div key={c.clave} className="rc-acord-grupo" data-abierta={abierta ? "" : undefined} style={{ "--i": i } as React.CSSProperties}>
            <button
              type="button"
              className="rc-acord-cabeza"
              aria-current={esta ? "true" : undefined}
              aria-expanded={abierta}
              aria-controls={idCuerpo}
              onClick={() => {
                // La de lo que se cuenta se pliega y se vuelve a abrir sin cambiar lo que está en el Dial (Felipe 2026-11-02). Abrir otra es ponerse a contar en
                // ella: su primer modelo sin contar, o el primero.
                if (esta) return onPlegar(abierta);
                const destino = c.paradas.find((p) => !paradaContada(p)) ?? c.paradas[0];
                if (destino) onElegir(destino);
              }}
            >
              <BaldosaCategoria categoria={c.categoria} tamano="chico" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px] text-tinta">{nombre}</b>
                <span className="block truncate text-sm text-taupe">{[resumenDeCategoria(c), fuera && !sinAviso ? "no venía" : null].filter(Boolean).join(" · ")}</span>
              </span>
              {dif != null && dif !== 0 && <Chip tono="ambar">{dif > 0 ? `+${conMiles(dif)}` : conMiles(dif)}</Chip>}
              <MarcaCampo estado={estado} />
              <ChevronDown aria-hidden className="rc-acord-flecha h-4 w-4 shrink-0 text-taupe" />
            </button>
            <div id={idCuerpo} className="rc-acord-cuerpo" inert={!abierta}>
              <div className="rc-acord-dentro">
                <ListaDeParadas c={c} enFoco={esta ? enFoco : null} onElegir={onElegir} />
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
