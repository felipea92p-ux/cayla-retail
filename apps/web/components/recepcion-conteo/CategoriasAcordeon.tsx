"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, SearchX, Sparkles, Tag, Truck } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { colorDeAvance } from "@/lib/avance-color";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { ID_CAMPO_AGREGAR, marcaDeLinea } from "@/lib/recepcion-conteo-reglas";
import {
  avanceDeCategoria,
  categoriaAbierta,
  conMiles,
  conSigno,
  hayFiltro,
  idCampoParada,
  nombreDeParada,
  origenDelGrupo,
  paradaContada,
  resumenDeCategoria,
  SIN_FILTRO,
  tipoDeParada,
  type CategoriaDelEnvio,
  type EstadoDelResumen,
  type FiltroDelConteo,
  type ModeloDelConteo,
  type OpcionDelFiltro,
  type OrdenDelConteo,
  type ParadaDelConteo,
} from "@/lib/recepcion-modelos-reglas";
import { BaldosaCategoria } from "./piezas";
import { useFilaActivaALaVista } from "./useFilaActivaALaVista";

// La lista de la izquierda (Felipe 2026-11-02, sobre el acordeón de ADR-0575): el título, el buscador, los filtros y las categorías del envío, cada una UNA vez aunque venga de varios
// proveedores o marcas, cada una con su banda de color para no confundirse con los modelos de adentro. La abierta muestra lo que anotó Compras modelo por modelo, y tocar uno lo pone en
// el contador: se cuenta modelo por modelo y la categoría suma sola. Abrir o plegar una categoría no cambia lo que se está contando (Felipe 2026-11-03).

const NOMBRE_ESTADO: Record<EstadoDelResumen, string> = { cuadran: "Cuadran", diferencia: "Con diferencia", "por-contar": "Por contar", despues: "Tallas para después" };

/** Un solo estado por fila, el de lo que le toca: ámbar por las tallas solo si la persona pidió hacerlas ahora y le faltan (pueden esperar). */
export function EstadoModelo({ m, faltanTallas, sinAviso = false }: { m: ModeloDelConteo; faltanTallas: boolean; sinAviso?: boolean }) {
  if (m.estado === "por-contar") return <Chip tono="neutro">Por contar</Chip>;
  if (m.estado === "no-llego") return <Chip tono="neutro">No llegó</Chip>;
  // Sin aviso nada estaba anotado: decirlo en cada fila no dice nada.
  if (m.estado === "fuera") {
    if (faltanTallas) return <Chip tono="ambar">Faltan tallas</Chip>;
    return sinAviso ? null : <Chip tono="pizarra">No estaba anotada</Chip>;
  }
  if (m.estado === "sobran") return <Chip tono="ambar">{`Sobran ${conMiles(m.contadas - (m.esperadas ?? 0))}`}</Chip>;
  if (m.estado === "a-medias") return <Chip tono="ambar">{`Faltan ${conMiles((m.esperadas ?? 0) - m.contadas)}`}</Chip>;
  if (faltanTallas) return <Chip tono="ambar">Faltan tallas</Chip>;
  return <Chip tono="verde">Cuadra</Chip>;
}

/** Las fotos de los modelos de una categoría, de su catálogo por marca. Solo se piden al abrirla; si no responde, cada fila dibuja su prenda sin foto. */
function useFotosDeLaCategoria(c: CategoriaDelEnvio, enUso: boolean, onFotos: (fotos: ReadonlyMap<string, string | null>) => void) {
  const pares = new Map<string, { categoriaId: string; marcaId: string | null }>();
  for (const g of c.grupos) {
    const categoriaId = g.principal.categoria?.id;
    if (!categoriaId) continue;
    const marcaId = marcaDeLinea(g.principal).id;
    pares.set(`${categoriaId}|${marcaId ?? ""}`, { categoriaId, marcaId });
  }
  const clave = [...pares.keys()].sort().join(",");
  const [leida, setLeida] = useState<string | null>(null);
  useEffect(() => {
    if (!enUso || !clave || leida === clave) return;
    let vigente = true;
    void Promise.all([...pares.values()].map((par) => buscarPrendasParaRecibir(par.categoriaId, par.marcaId, ""))).then((respuestas) => {
      if (!vigente) return;
      setLeida(clave);
      onFotos(new Map(respuestas.flatMap((r) => r.prendas.map((prenda) => [prenda.productoId, prenda.fotoUrl] as const))));
    });
    return () => {
      vigente = false;
    };
    // `clave` ya dice qué pares hay: `pares` se rearma en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enUso, clave, leida]);
}

function FilaDeParada({ p, activa, conOrigen, foto, faltanTallas, sinAviso, onElegir }: { p: ParadaDelConteo; activa: boolean; conOrigen: boolean; foto: string | null; faltanTallas: boolean; sinAviso: boolean; onElegir: (p: ParadaDelConteo) => void }) {
  const m = p.modelo;
  const cat = p.grupo.principal.categoria;
  const contadas = m ? m.contadas : p.grupo.contadas;
  const esperadas = m ? m.esperadas : p.grupo.dijeron;
  const cifras = esperadas != null ? <><b>{conMiles(contadas)}</b> de {conMiles(esperadas)}</> : <><b>{conMiles(contadas)}</b> {contadas === 1 ? "contada" : "contadas"}</>;
  return (
    <li>
      <button type="button" className="rc-modelo" data-activa={activa ? "" : undefined} data-campo={idCampoParada(p)} aria-current={activa ? "true" : undefined} onClick={() => onElegir(p)}>
        {cat && <MiniaturaPrenda fotoUrl={foto} tamano="md" prefijo={cat.prefijo} familia={cat.familia} categoria={cat.nombre} />}
        <span className="rc-modelo-textos">
          <span className="rc-modelo-nombre">
            <b title={nombreDeParada(p)}>{nombreDeParada(p)}</b>
            {tipoDeParada(p) === "nuevo" && (
              <Chip tono="pizarra" versalitas={false}>
                <Sparkles aria-hidden className="h-3 w-3" />
                Nuevo
              </Chip>
            )}
          </span>
          {/* Si la categoría junta varios, de qué proveedor y marca, junto a sus cifras. */}
          <span className="rc-modelo-cifras" title={conOrigen ? origenDelGrupo(p.grupo) : undefined}>
            {cifras}
            {conOrigen && ` · ${origenDelGrupo(p.grupo)}`}
          </span>
        </span>
        {m ? <EstadoModelo m={m} faltanTallas={faltanTallas} sinAviso={sinAviso} /> : !paradaContada(p) && <Chip tono="neutro">Por contar</Chip>}
      </button>
    </li>
  );
}

function Categoria({
  c,
  i,
  enFoco,
  abierta,
  sinAviso,
  fotos,
  faltanTallas,
  onAlternar,
  onElegir,
  onFotos,
}: {
  c: CategoriaDelEnvio;
  i: number;
  enFoco: ParadaDelConteo | null;
  abierta: boolean;
  sinAviso: boolean;
  fotos: ReadonlyMap<string, string | null>;
  faltanTallas: (p: ParadaDelConteo) => boolean;
  onAlternar: () => void;
  onElegir: (p: ParadaDelConteo) => void;
  onFotos: (fotos: ReadonlyMap<string, string | null>) => void;
}) {
  useFotosDeLaCategoria(c, abierta, onFotos);
  const esta = !!enFoco && c.grupos.some((g) => g.clave === enFoco.grupo.clave);
  // Hecha solo con todo contado Y todas sus prendas identificadas (Felipe 2026-10-27).
  const estado = c.hecha ? "hecho" : esta ? "ahora" : "falta";
  // La diferencia es un resultado: solo con toda la categoría contada. A medias, cada modelo dice cómo va.
  const dif = c.dijeron != null && c.contada ? c.contadas - c.dijeron : null;
  const nombre = c.categoria?.nombre ?? "Categoría";
  const fuera = c.grupos.every((g) => !g.principal.linea);
  const idCuerpo = `rc-cat-${c.clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;
  const pct = avanceDeCategoria(c);
  return (
    <div className="rc-cat" data-abierta={abierta ? "" : undefined} style={{ "--i": i } as React.CSSProperties}>
      <div className="rc-cat-tira">
        <button
          type="button"
          className="rc-cat-cabeza"
          aria-current={esta ? "true" : undefined}
          aria-expanded={abierta}
          aria-controls={idCuerpo}
          onClick={onAlternar}
        >
          <BaldosaCategoria categoria={c.categoria} tamano="chico" />
          <span className="rc-cat-textos">
            <b>{nombre}</b>
            <span className="rc-cat-resumen">{[resumenDeCategoria(c), fuera && !sinAviso ? "no venía" : null].filter(Boolean).join(" · ")}</span>
            {c.dijeron != null && (
              <span className="rc-cat-barra">
                {/* Toda contada pero no cuadra: se queda en ámbar aunque falte poco, que es lo que dice su chip. */}
                <BarraAvance pct={Math.min(100, pct)} alto="fina" color={dif ? "var(--color-avance-medio)" : colorDeAvance(pct)} decorativa />
              </span>
            )}
          </span>
          {dif != null && dif !== 0 && <Chip tono="ambar">{conSigno(dif)}</Chip>}
          <MarcaCampo estado={estado} />
          <ChevronDown aria-hidden className="rc-cat-flecha h-4 w-4" />
        </button>
      </div>
      <div id={idCuerpo} className="rc-cat-cuerpo" inert={!abierta}>
        <div className="rc-cat-dentro">
          <ul className="rc-modelos">
            {c.paradas.map((p) => (
              <FilaDeParada key={p.clave} p={p} activa={enFoco?.clave === p.clave} conOrigen={c.variosOrigenes} foto={p.modelo?.productoId ? (fotos.get(p.modelo.productoId) ?? null) : null} faltanTallas={faltanTallas(p)} sinAviso={sinAviso} onElegir={onElegir} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ListaDelEnvio({
  categorias,
  enFoco,
  alternadas,
  sinAviso,
  totalCategorias,
  filtro,
  proveedores,
  marcas,
  filtrarProveedor,
  filtrarMarca,
  modelosTotales,
  orden,
  fotos,
  faltanTallas,
  onFiltro,
  onOrden,
  onAlternar,
  onElegir,
  onElegirPrimero,
  onAgregar,
  onFotos,
}: {
  categorias: readonly CategoriaDelEnvio[];
  /** Lo que el contador está contando ahora: su categoría va abierta. */
  enFoco: ParadaDelConteo | null;
  /** Las categorías que la persona abrió o plegó a mano. */
  alternadas: ReadonlySet<string>;
  sinAviso: boolean;
  /** Cuántas categorías trae el envío entero: sin ninguna, «Agregar» es lo primero que se pide. */
  totalCategorias: number;
  filtro: FiltroDelConteo;
  proveedores: readonly OpcionDelFiltro[];
  marcas: readonly OpcionDelFiltro[];
  /** ¿El envío trae más de un proveedor (o marca)? Si no, ese filtro no se dibuja. */
  filtrarProveedor: boolean;
  filtrarMarca: boolean;
  /** Cuántos modelos trae el envío entero: para decir cuántos se están viendo. */
  modelosTotales: number;
  orden: OrdenDelConteo;
  fotos: ReadonlyMap<string, string | null>;
  faltanTallas: (p: ParadaDelConteo) => boolean;
  onFiltro: (f: FiltroDelConteo) => void;
  onOrden: (o: OrdenDelConteo) => void;
  /** Tocó una categoría: se abre o se pliega. Lo que el contador cuenta no cambia. */
  onAlternar: (clave: string) => void;
  onElegir: (p: ParadaDelConteo) => void;
  /** Enter en el buscador: a contar lo primero que se encontró. */
  onElegirPrimero: () => void;
  onAgregar: () => void;
  onFotos: (fotos: ReadonlyMap<string, string | null>) => void;
}) {
  // Buscando o filtrando por estado se lee la lista: todas las que quedan, abiertas.
  const leyendo = !!filtro.texto.trim() || !!filtro.estado;
  const lista = useFilaActivaALaVista<HTMLDivElement>(enFoco?.clave ?? null, categorias[0]?.paradas[0]?.clave ?? null);
  const vistos = categorias.reduce((a, c) => a + c.paradas.length, 0);
  const cuantos = hayFiltro(filtro) ? `${conMiles(vistos)} de ${conMiles(modelosTotales)} modelos` : `${conMiles(modelosTotales)} ${modelosTotales === 1 ? "modelo" : "modelos"}`;
  const volver = " · tócala otra vez para volver al orden de la compra";
  const conOrden = categorias.flatMap((c) => c.paradas).length > 1;
  const hayPuestos = !!filtro.tipo || !!filtro.estado;
  return (
    <section className="rc-panel rc-lista" aria-label={sinAviso ? "Lo que llegó" : "Categorías del envío"}>
      <div className="rc-lista-cabeza">
        <TituloSeccion dato={modelosTotales > 0 ? cuantos : undefined}>{sinAviso ? "Lo que llegó" : "Categorías del envío"}</TituloSeccion>
        {modelosTotales > 0 && <Buscador
          atajo
          valor={filtro.texto}
          onCambio={(texto) => onFiltro({ ...filtro, texto })}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !filtro.texto.trim()) return;
            e.preventDefault();
            onElegirPrimero();
          }}
          etiqueta="Buscar modelo, proveedor o marca"
          placeholder="Buscar modelo o proveedor…" // sugerir-fijo: dice dónde busca, no depende de nada elegido antes
          guia="recepcion.buscar"
        />}
        {(filtrarProveedor || filtrarMarca || conOrden) && (
          <div className="rc-filtros" data-guia="recepcion.filtros">
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
            {conOrden && (
              <div data-orden data-guia="recepcion.orden">
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
          </div>
        )}
        {hayPuestos && (
          <div className="rc-puestos">
            {filtro.tipo && (
              <FiltroPuesto etiqueta="Quitar el filtro de tipo" onQuitar={() => onFiltro({ ...filtro, tipo: null })}>
                Solo {filtro.tipo === "restock" ? "re stock" : "producto nuevo"}
              </FiltroPuesto>
            )}
            {filtro.estado && (
              <FiltroPuesto etiqueta="Quitar el filtro de estado" onQuitar={() => onFiltro({ ...filtro, estado: null })}>
                {NOMBRE_ESTADO[filtro.estado]}
              </FiltroPuesto>
            )}
          </div>
        )}
      </div>
      <div ref={lista} className="rc-scroll scroll-cayla">
        <nav aria-label="Categorías del envío" data-guia="recepcion.categorias">
          {categorias.length === 0 && totalCategorias > 0 && (
            <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Ver todo", onClick: () => onFiltro(SIN_FILTRO) }}>
              {filtro.texto.trim() ? `Nada coincide con «${filtro.texto.trim()}».` : "Nada coincide con lo que filtraste."}
            </Vacio>
          )}
          {categorias.map((c, i) => {
            const esta = !!enFoco && c.grupos.some((g) => g.clave === enFoco.grupo.clave);
            return <Categoria key={c.clave} c={c} i={i} enFoco={enFoco} abierta={categoriaAbierta(esta, leyendo, alternadas.has(c.clave))} sinAviso={sinAviso} fotos={fotos} faltanTallas={faltanTallas} onAlternar={() => onAlternar(c.clave)} onElegir={onElegir} onFotos={onFotos} />;
          })}
        </nav>
        <div className="rc-lista-agregar">
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
        </div>
      </div>
    </section>
  );
}
