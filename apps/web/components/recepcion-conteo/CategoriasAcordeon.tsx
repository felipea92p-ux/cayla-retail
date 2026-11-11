"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Lock, Plus, SearchX, Sparkles, Trash2 } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { SalidaDelEnvio } from "@/lib/recepcion-salida-reglas";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { Punto } from "@/components/alta-producto/Punto";
import type { ColorAlta } from "@/lib/alta-producto";
import { colorDeAvance } from "@/lib/avance-color";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { ID_CAMPO_AGREGAR, marcaDeLinea } from "@/lib/recepcion-conteo-reglas";
import {
  avanceDeCategoria,
  categoriaAbierta,
  conMiles,
  conSigno,
  hayFiltro,
  idCampoCategoria,
  idCampoParada,
  modeloSeQuita,
  sePuedeQuitarCategoria,
  nombreDeParada,
  origenDelGrupo,
  resumenDeCategoria,
  SIN_FILTRO,
  tallasDeYaEnStock,
  tipoDeParada,
  totalesPorTalla,
  type CategoriaDelEnvio,
  type CifrasDelResumen,
  type FiltroDelConteo,
  type ModeloDelConteo,
  type OpcionDelFiltro,
  type OrdenDelConteo,
  type ParadaDelConteo,
  type YaEnStock,
} from "@/lib/recepcion-modelos-reglas";
import { sinIdentificarDelGrupo } from "@/lib/recepcion-grupos-reglas";
import { FiltrosDelEnvio } from "./FiltrosDelEnvio";
import { BaldosaCategoria } from "./piezas";
import { useFilaActivaALaVista } from "./useFilaActivaALaVista";

// La mitad izquierda (Felipe 2026-11-02, sobre el acordeón de ADR-0575; en dos mitades desde el 2026-11-11, ADR-0645): arriba, cómo va todo el envío, el buscador y el botón «Filtros»;
// al medio, las categorías del envío, cada una UNA vez aunque venga de varios proveedores o marcas, con su banda de color para no confundirse con los modelos de adentro; abajo, lo del
// envío entero (quién cuenta y «Revisar y cerrar»). La categoría abierta muestra lo que anotó Compras modelo por modelo, y tocar uno lo pone en el contador: se cuenta modelo por modelo
// y la categoría suma sola. Abrir o plegar una categoría no cambia lo que se está contando (Felipe 2026-11-03).

/** Un solo estado por fila, el de lo que le toca: ámbar por las tallas solo si la persona pidió hacerlas ahora y le faltan (pueden esperar). */
export function EstadoModelo({ m, faltanTallas, sinAviso = false }: { m: ModeloDelConteo; faltanTallas: boolean; sinAviso?: boolean }) {
  if (m.estado === "por-contar") return <Chip tono="neutro">Por contar</Chip>;
  if (m.porDefecto) return <Chip tono="ambar">Falta su nombre</Chip>;
  // Lo que cuadra es la categoría: el modelo no tiene contra qué compararse.
  if (m.estado === "contado") return faltanTallas ? <Chip tono="ambar">Faltan tallas</Chip> : null;
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

function FilaDeParada({ p, activa, conOrigen, foto, faltanTallas, sinAviso, onElegir, onQuitar }: { p: ParadaDelConteo; activa: boolean; conOrigen: boolean; foto: string | null; faltanTallas: boolean; sinAviso: boolean; onElegir: (p: ParadaDelConteo) => void; onQuitar: (p: ParadaDelConteo) => void }) {
  const m = p.modelo;
  const cat = p.grupo.principal.categoria;
  const contadas = m ? m.contadas : sinIdentificarDelGrupo(p.grupo);
  const esperadas = m ? m.esperadas : null;
  const seQuita = !!m && modeloSeQuita(m);
  const cifras = esperadas != null ? <><b>{conMiles(contadas)}</b> de {conMiles(esperadas)}</> : <><b>{conMiles(contadas)}</b> {contadas === 1 ? "contada" : "contadas"}</>;
  return (
    <li className="rc-modelo-fila">
      <button type="button" className="rc-modelo" data-con-tacho={seQuita ? "" : undefined} data-activa={activa ? "" : undefined} data-campo={idCampoParada(p)} aria-current={activa ? "true" : undefined} onClick={() => onElegir(p)}>
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
          <span className="rc-modelo-cifras" title={[conOrigen ? origenDelGrupo(p.grupo) : null, m?.nota].filter(Boolean).join(" · ") || undefined}>
            {cifras}
            {conOrigen && ` · ${origenDelGrupo(p.grupo)}`}
            {m?.nota && ` · ${m.nota}`}
          </span>
        </span>
        {m ? <EstadoModelo m={m} faltanTallas={faltanTallas} sinAviso={sinAviso} /> : <Chip tono="ambar">Falta decir cuál</Chip>}
      </button>
      {seQuita && m && (
        <button type="button" className="rc-modelo-tacho" aria-label={`Quitar ${m.nombre}`} title={`Quitar ${m.nombre}`} onClick={() => onQuitar(p)}>
          <Trash2 aria-hidden className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** Lo que ya entró al stock, con lo que dice cómo corregirlo. */
type YaEnStockDeLaLista = YaEnStock & { salida: SalidaDelEnvio | null };

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("es");
const fecha = (iso: string): string => new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

/**
 * Una prenda que ya entró al stock, dentro de su categoría (Felipe 2026-11-07, maqueta «A · Matriz», docs/maquetas/recibir-ya-en-stock-2026-11): plegada dice
 * cuántas y de cuántas tallas, con un punto por color; abierta, la matriz talla × color de lo que entró y cómo corregirlo. No se cuenta: lleva candado.
 */
function FilaYaEnStock({ y, cat, colores, onCorregirSalida, guia }: { y: YaEnStockDeLaLista; cat: CategoriaDelEnvio["categoria"]; colores: readonly ColorAlta[]; onCorregirSalida: (s: SalidaDelEnvio) => void; guia?: string }) {
  const [abierta, setAbierta] = useState(false);
  const id = useId();
  const colorDe = (nombre: string | null) => (nombre ? (colores.find((c) => sinTildes(c.nombre) === sinTildes(nombre)) ?? null) : null);
  const nTallas = tallasDeYaEnStock(y);
  const primero = colorDe(y.colores[0]?.color ?? null);
  const porTalla = totalesPorTalla(y);
  return (
    <li className="rc-stock" data-abierta={abierta ? "" : undefined} data-guia={guia}>
      <button type="button" className="rc-modelo" aria-expanded={abierta} aria-controls={id} onClick={() => setAbierta((a) => !a)}>
        {cat && <MiniaturaPrenda fotoUrl={null} colorHex={primero?.hex ?? null} tamano="md" prefijo={cat.prefijo} familia={cat.familia} categoria={cat.nombre} />}
        <span className="rc-modelo-textos">
          <span className="rc-modelo-nombre">
            <b title={y.prenda}>{y.prenda}</b>
          </span>
          <span className="rc-modelo-cifras">
            {/* Lo que entró con ESTE envío, no el stock de hoy: si después se vendió una, no coincide con Existencias (formidable 2026-11-07). */}
            <b>{conMiles(y.cantidad)}</b> {y.cantidad === 1 ? "entró" : "entraron"} · {nTallas} {nTallas === 1 ? "talla" : "tallas"}
            <span className="rc-stock-puntos" aria-hidden>
              {y.colores.map((c) => {
                const color = colorDe(c.color);
                return color ? <Punto key={c.color ?? ""} hex={color.hex} familia={color.familiaColor} tipo={color.tipo} /> : null;
              })}
            </span>
          </span>
        </span>
        <Chip tono="verde" versalitas={false} title="Ya entró al stock: no se vuelve a contar">
          <Lock aria-hidden className="h-3 w-3" />
          En stock
        </Chip>
        <ChevronDown aria-hidden className="rc-stock-flecha h-4 w-4" />
      </button>
      <div id={id} className="rc-stock-cuerpo" inert={!abierta}>
        <div className="rc-stock-dentro">
          <div className="rc-matriz-caja scroll-cayla">
            <table // unificar-fijo: la matriz talla × color de lo que ya entró, no una lista de registros
              className="rc-tabla-tallas rc-tabla-stock"
              aria-label={`Tallas y colores de ${y.prenda} que ya entraron`}
            >
              <thead>
                <tr>
                  <th scope="col">Color</th>
                  {y.tallas.map((t) => (
                    <th key={t ?? ""} scope="col">
                      {t ?? "Única"}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {y.colores.map((c, fila) => {
                  const color = colorDe(c.color);
                  return (
                    <tr key={c.color ?? ""}>
                      <th scope="row">
                        <span className="rc-color">
                          {color && <Punto hex={color.hex} familia={color.familiaColor} tipo={color.tipo} />}
                          {c.color ?? "Sin color"}
                        </span>
                      </th>
                      {c.porTalla.map((n, i) => (
                        <td key={y.tallas[i] ?? ""}>
                          {/* Un número suelto, sin caja: una caja invitaba a escribir ahí, como en la matriz del contador (formidable 2026-11-07). */}
                          <span className={n > 0 ? "rc-stock-celda" : "rc-stock-celda rc-stock-cero"} style={{ "--j": fila * c.porTalla.length + i } as React.CSSProperties}>
                            {conMiles(n)}
                          </span>
                        </td>
                      ))}
                      <td className="rc-fila-total">{conMiles(c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {y.colores.length > 1 && (
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {porTalla.map((n, i) => (
                      <td key={y.tallas[i] ?? ""}>{conMiles(n)}</td>
                    ))}
                    <td>{conMiles(y.cantidad)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Lo que salió antes de cerrar se corrige aquí mientras siga en el almacén; lo demás, en Existencias. */}
          <div className="rc-stock-pie">
            <span>
              {y.salida
                ? `No se cuenta aquí: entró el ${fecha(y.salida.creadoEn)}${y.salida.quien ? ` (${y.salida.quien})` : ""}. Si hubo un error:`
                : "No se cuenta aquí: ya está en el stock. Para cambiar cuántas hay hoy:"}
            </span>
            {y.salida ? (
              <button type="button" className="btn-cayla btn-enlace text-sm" onClick={() => onCorregirSalida(y.salida as SalidaDelEnvio)}>
                Corregir {conMiles(y.salida.unidades)}
              </button>
            ) : (
              <Link className="btn-cayla btn-enlace text-sm" href={`/inventario?q=${encodeURIComponent(y.prenda)}`}>
                Ajustar stock
              </Link>
            )}
          </div>
        </div>
      </div>
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
  onAgregarModelo,
  onNoLlego,
  onQuitar,
  onQuitarCategoria,
  yaEnStock,
  colores,
  onCorregirSalida,
  guiaYaEnStock,
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
  onAgregarModelo: () => void;
  /** Vino en la guía y no llegó nada: queda contada en 0. */
  onNoLlego: () => void;
  onQuitar: (p: ParadaDelConteo) => void;
  onQuitarCategoria: () => void;
  /** Lo de esta categoría que ya entró al stock: va al final de sus modelos, con candado. */
  yaEnStock: readonly YaEnStockDeLaLista[];
  colores: readonly ColorAlta[];
  onCorregirSalida: (s: SalidaDelEnvio) => void;
  /** La primera categoría con algo en el stock lleva el ancla de la guía. */
  guiaYaEnStock: boolean;
}) {
  useFotosDeLaCategoria(c, abierta, onFotos);
  const enStock = yaEnStock.reduce((a, y) => a + y.cantidad, 0);
  const esta = !!enFoco && c.grupos.some((g) => g.clave === enFoco.grupo.clave);
  // Hecha solo con todo contado Y todas sus prendas identificadas (Felipe 2026-10-27).
  const estado = c.hecha ? "hecho" : esta ? "ahora" : "falta";
  // La diferencia es un resultado: solo con toda la categoría contada. A medias, cada modelo dice cómo va.
  const dif = c.dijeron != null && c.contada ? c.contadas - c.dijeron : null;
  const nombre = c.categoria?.nombre ?? "Categoría";
  const fuera = c.grupos.every((g) => !g.principal.linea);
  const idCuerpo = `rc-cat-${c.clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;
  const pct = avanceDeCategoria(c);
  const seQuita = sePuedeQuitarCategoria(c);
  return (
    <div className="rc-cat" data-abierta={abierta ? "" : undefined} style={{ "--i": i } as React.CSSProperties}>
      <div className="rc-cat-tira" data-campo={idCampoCategoria(c.clave)}>
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
            <span className="rc-cat-resumen">
              {[resumenDeCategoria(c), fuera && !sinAviso ? "no venía" : null].filter(Boolean).join(" · ")}
              {enStock > 0 && (
                <>
                  {" · "}
                  <span className="rc-cat-en-stock">
                    <Lock aria-hidden className="h-3 w-3" />
                    {conMiles(enStock)} ya {enStock === 1 ? "entró" : "entraron"}
                  </span>
                </>
              )}
            </span>
            {c.dijeron != null && (
              <span className="rc-cat-barra">
                {/* Toda contada pero no cuadra: se queda en ámbar aunque falte poco, que es lo que dice su chip. */}
                <BarraAvance pct={Math.min(100, pct)} alto="fina" color={dif ? "var(--color-avance-medio)" : colorDeAvance(pct)} decorativa />
              </span>
            )}
          </span>
          {dif != null && dif !== 0 && <Chip tono="ambar">{conSigno(dif)}</Chip>}
          {/* Su lugar: el «+» va al lado, fuera de este botón (un botón no puede llevar otro adentro). */}
          {seQuita && <span aria-hidden className="rc-cat-hueco-mas" />}
          <span aria-hidden className="rc-cat-hueco-mas" />
          <MarcaCampo estado={estado} />
          <ChevronDown aria-hidden className="rc-cat-flecha h-4 w-4" />
        </button>
        <button type="button" className="rc-cat-mas mov-boton" aria-label={`Agregar otro modelo de ${nombre}`} title={`Agregar otro modelo de ${nombre}`} onClick={onAgregarModelo} data-guia={i === 0 ? "recepcion.agregar-modelo" : undefined}>
          <Plus aria-hidden className="h-4 w-4" />
        </button>
        {seQuita && (
          <button type="button" className="rc-cat-tacho" aria-label={`Quitar ${nombre} del envío`} title={`Quitar ${nombre} del envío`} onClick={onQuitarCategoria}>
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
      <div id={idCuerpo} className="rc-cat-cuerpo" inert={!abierta}>
        <div className="rc-cat-dentro">
          {c.paradas.length === 0 && yaEnStock.length === 0 && (
            <div className="rc-cat-sin-modelos">
              <p>Aún sin modelos. Agrégalos con el «+».</p>
              {!c.hayConteo && c.grupos.some((g) => g.principal.linea) && (
                <button type="button" className="btn-cayla btn-enlace" onClick={onNoLlego}>
                  No llegó nada
                </button>
              )}
            </div>
          )}
          <ul className="rc-modelos">
            {c.paradas.map((p) => (
              <FilaDeParada key={p.clave} p={p} activa={enFoco?.clave === p.clave} conOrigen={c.variosOrigenes} foto={p.modelo?.productoId ? (fotos.get(p.modelo.productoId) ?? null) : null} faltanTallas={faltanTallas(p)} sinAviso={sinAviso} onElegir={onElegir} onQuitar={onQuitar} />
            ))}
            {/* Con modelos por contar al lado, un divisor dice dónde empieza lo que ya entró. */}
            {c.paradas.length > 0 && yaEnStock.length > 0 && (
              <li className="rc-stock-divisor" aria-hidden>
                <TituloGrupo cuenta={yaEnStock.length}>Ya en stock</TituloGrupo>
              </li>
            )}
            {yaEnStock.map((y, k) => (
              <FilaYaEnStock key={`${y.categoria ?? ""}|${y.prenda}`} y={y} cat={c.categoria} colores={colores} onCorregirSalida={onCorregirSalida} guia={guiaYaEnStock && k === 0 ? "recepcion.ya-en-stock" : undefined} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ListaDelEnvio({
  yaEnStock,
  sueltos,
  colores,
  onCorregirSalida,
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
  onAgregarModelo,
  onNoLlego,
  onQuitar,
  onQuitarCategoria,
  onFotos,
  cifras,
  avance,
  aviso,
  pie,
  enHoja = false,
}: {
  /** Las cifras de TODO el envío: el número de cada filtro. */
  cifras: CifrasDelResumen;
  /** Cómo va todo el envío, en una línea (`AvanceDelEnvio`). */
  avance?: ReactNode;
  /** Algo que no se pudo guardar: se dice arriba, esté donde esté quien cuenta. */
  aviso?: ReactNode;
  /** Lo del envío entero: quién cuenta y «Revisar y cerrar» (`PieDeLaLista`). */
  pie?: ReactNode;
  /** En el celular la lista se abre en una hoja (ADR-0645): sin su marco ni su título, que los pone la hoja. */
  enHoja?: boolean;
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
  /** El «+» de una categoría: otro modelo para contar aparte. */
  onAgregarModelo: (categoria: string) => void;
  /** Lo que ya entró al stock, en un cierre anterior o en una tanda, por la clave de su categoría (`categoriasConLoQueYaEntro`). Se ve con candado y no se cuenta. */
  yaEnStock: ReadonlyMap<string, readonly YaEnStockDeLaLista[]>;
  /** Lo que ya entró y no encontró su categoría en el envío: va al pie, para que nunca se pierda. */
  sueltos: readonly YaEnStockDeLaLista[];
  /** El catálogo de colores: el punto de cada color en la matriz. */
  colores: readonly ColorAlta[];
  onCorregirSalida: (s: SalidaDelEnvio) => void;
  onNoLlego: (c: CategoriaDelEnvio) => void;
  /** El tacho de un modelo agregado al contar. */
  onQuitar: (p: ParadaDelConteo) => void;
  /** El tacho de una categoría entera que nada de ella venía en la guía. */
  onQuitarCategoria: (c: CategoriaDelEnvio) => void;
  onFotos: (fotos: ReadonlyMap<string, string | null>) => void;
}) {
  // Buscando o filtrando por estado se lee la lista: todas las que quedan, abiertas.
  const leyendo = !!filtro.texto.trim() || !!filtro.estado;
  const lista = useFilaActivaALaVista<HTMLDivElement>(enFoco?.clave ?? null, categorias[0]?.paradas[0]?.clave ?? null);
  const vistos = categorias.reduce((a, c) => a + c.paradas.filter((p) => p.modelo).length, 0);
  const cuantos = hayFiltro(filtro) ? `${conMiles(vistos)} de ${conMiles(modelosTotales)} modelos` : `${conMiles(modelosTotales)} ${modelosTotales === 1 ? "modelo" : "modelos"}`;
  const conOrden = categorias.flatMap((c) => c.paradas).length > 1;
  const primeraConStock = categorias.find((c) => (yaEnStock.get(c.clave)?.length ?? 0) > 0)?.clave ?? null;
  return (
    <section className={enHoja ? "rc-panel rc-lista rc-lista-en-hoja" : "rc-panel rc-lista"} aria-label={sinAviso ? "Lo que llegó" : "Categorías del envío"}>
      <div className="rc-lista-cabeza">
        {!enHoja && <TituloSeccion dato={modelosTotales > 0 ? cuantos : undefined}>{sinAviso ? "Lo que llegó" : "Categorías del envío"}</TituloSeccion>}
        {aviso}
        {avance}
        {modelosTotales > 0 && (
          <FiltrosDelEnvio
            filtro={filtro}
            orden={orden}
            cifras={cifras}
            sinAviso={sinAviso}
            proveedores={proveedores}
            marcas={marcas}
            filtrarProveedor={filtrarProveedor}
            filtrarMarca={filtrarMarca}
            conOrden={conOrden || !!orden}
            onFiltro={onFiltro}
            onOrden={onOrden}
            onElegirPrimero={onElegirPrimero}
          />
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
            return <Categoria key={c.clave} c={c} i={i} yaEnStock={yaEnStock.get(c.clave) ?? []} colores={colores} onCorregirSalida={onCorregirSalida} guiaYaEnStock={c.clave === primeraConStock} enFoco={enFoco} abierta={categoriaAbierta(esta, leyendo, alternadas.has(c.clave))} sinAviso={sinAviso} fotos={fotos} faltanTallas={faltanTallas} onAlternar={() => onAlternar(c.clave)} onElegir={onElegir} onFotos={onFotos} onAgregarModelo={() => onAgregarModelo(c.clave)} onNoLlego={() => onNoLlego(c)} onQuitar={onQuitar} onQuitarCategoria={() => onQuitarCategoria(c)} />;
          })}
        </nav>
        {/* Lo que ya entró sin una categoría de este envío (un recibido viejo que no la trae): al pie, para que no se pierda. */}
        {sueltos.length > 0 && (
          <section aria-label="Ya en stock, sin categoría" className="rc-ya-en-stock">
            <TituloGrupo cuenta={sueltos.length}>Ya en stock · sin categoría</TituloGrupo>
            <ul className="rc-modelos">
              {sueltos.map((y, k) => (
                <FilaYaEnStock key={`${y.categoria ?? ""}|${y.prenda}`} y={y} cat={null} colores={colores} onCorregirSalida={onCorregirSalida} guia={!primeraConStock && k === 0 ? "recepcion.ya-en-stock" : undefined} />
              ))}
            </ul>
          </section>
        )}
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
      {pie}
    </section>
  );
}
