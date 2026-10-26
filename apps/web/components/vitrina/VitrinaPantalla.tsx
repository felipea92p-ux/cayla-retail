"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LayoutGrid, List, MonitorSmartphone, SearchX, Shirt, Sparkles } from "lucide-react";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Casilla } from "@/components/ui/Casilla";
import { Chip } from "@/components/ui/Chip";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { FiltrosFlotantes } from "@/components/ui/FiltrosFlotantes";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { MiniaturaPrenda, SinFoto } from "@/components/ui/PrendaCelda";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { useAnchoDe } from "@/components/ui/useAnchoDe";
import { paginar } from "@/lib/paginacion";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import { Vacio } from "@/components/ui/Vacio";
import {
  categoriasDe,
  cifrasDe,
  coloresSinFoto,
  contarPorEstado,
  esEmpaque,
  filtrarVitrina,
  interruptorEncendido,
  MODELOS_POR_PAGINA,
  modoDeLista,
  razonNoSeMuestra,
  stockEnTiendas,
  type FiltroLoNuevo,
  type FiltroVitrina,
  type FiltrosVitrina,
  type LecturaVitrina,
  type ModeloVitrina,
  type ModoLote,
} from "@/lib/vitrina-reglas";

// Cómo se llama cada estado en la píldora y en el filtro puesto. «Encendidos sin precio» es lo que el Resumen cuenta: los que alguien
// prendió y no se ven porque ninguna tienda de la web les pone precio.
const ESTADOS: { valor: FiltroVitrina; texto: string }[] = [
  { valor: "todos", texto: "Todos" },
  { valor: "en_la_web", texto: "Se ven en la web" },
  { valor: "sin_stock", texto: "Sin stock en ninguna tienda" },
  { valor: "sin_precio", texto: "Encendidos sin precio" },
  { valor: "ocultos", texto: "Ocultos" },
  { valor: "empaque", texto: "Empaque" },
];
// La píldora se da por «puesta» cuando su valor no es `TODOS`: «todos» de aquí se le dice con ese mismo valor.
const aPildora = (v: string) => (v === "todos" ? TODOS : v);
const dePildora = (v: string) => (v === TODOS ? "todos" : v);
const LO_NUEVO: { valor: FiltroLoNuevo; texto: string }[] = [
  { valor: "todos", texto: "Todos" },
  { valor: "fijo", texto: "Fijados en Lo nuevo" },
  { valor: "quitado", texto: "Fuera de Lo nuevo" },
];

// Las dos hojas solo se abren al tocar un modelo o al mostrar/ocultar: no viajan con la pantalla (carga diferida, ADR-0136 / skill de velocidad).
// Para que la primera vez no espere a que baje su archivo, se piden en un rato libre después de dibujar la pantalla (`precargarHojas`).
const cargarHojaModelo = () => import("@/components/vitrina/VitrinaModeloHoja").then((m) => m.VitrinaModeloHoja);
const cargarHojaLote = () => import("@/components/vitrina/VitrinaLoteHoja").then((m) => m.VitrinaLoteHoja);
const VitrinaModeloHoja = dynamic(cargarHojaModelo);
const VitrinaLoteHoja = dynamic(cargarHojaLote);

// En el celular la fila es una tarjeta: casilla, modelo e interruptor arriba y lo libre en cada tienda bajo el nombre; desde `sm`,
// columnas.
const PLANTILLA = "grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_12rem_4.5rem]";

// «Columnas» (pantalla grande, hasta 8 tiendas): casilla · modelo · categoría · colores · una columna por tienda · estado · interruptor.
// Los anchos tienen tope (el modelo, 22 rem; la categoría, 10) para que el stock no quede a un mundo del nombre; lo que sobra lo toma el
// estado. Tailwind necesita las clases escritas enteras, por eso una por cantidad de tiendas. Los mínimos suman lo que `modoDeLista` supone.
const PLANTILLA_COLUMNAS: Record<number, string> = {
  1: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(1,4rem)_minmax(7rem,1fr)_3rem]",
  2: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(2,4rem)_minmax(7rem,1fr)_3rem]",
  3: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(3,4rem)_minmax(7rem,1fr)_3rem]",
  4: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(4,4rem)_minmax(7rem,1fr)_3rem]",
  5: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(5,4rem)_minmax(7rem,1fr)_3rem]",
  6: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(6,4rem)_minmax(7rem,1fr)_3rem]",
  7: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(7,4rem)_minmax(7rem,1fr)_3rem]",
  8: "grid-cols-[1.5rem_minmax(14rem,22rem)_minmax(6.5rem,10rem)_4rem_repeat(8,4rem)_minmax(7rem,1fr)_3rem]",
};

/**
 * Tienda web ▸ Vitrina (ADR-0408, actividad 3; maqueta v4, «vitrina»): todos los modelos que se pueden vender, con su stock libre en
 * cada tienda y si se ven en la web. No hay precio web: en la web cada modelo vale lo que vale en la tienda que el cliente elige (y con
 * «Todas», lo más que vale entre ellas). Tocar un modelo abre su hoja (mostrar, Lo nuevo y lo que ve el cliente); el interruptor de una
 * fila muestra u oculta ese modelo, y marcar varios abre la barra para mostrarlos u ocultarlos juntos. Toda escritura pasa por una hoja
 * con el combo «Responsable» (ADR-0162).
 */
export function VitrinaPantalla({
  lectura,
  esperan,
  inicial,
}: {
  lectura: LecturaVitrina;
  /** Personas que esperan una talla (actividad 12); `null`: no se pudo leer. */
  esperan: number | null;
  /** Los filtros con los que abre la lista (los de la dirección: un enlace del Resumen llega ya filtrado). */
  inicial: FiltrosVitrina;
}) {
  const router = useRouter();
  const [modelos, setModelos] = useState(lectura.modelos);
  // Lo que trae el servidor al refrescar manda (sin un efecto: se ajusta al dibujar, como pide React).
  const [deServidor, setDeServidor] = useState(lectura.modelos);
  if (deServidor !== lectura.modelos) {
    setDeServidor(lectura.modelos);
    setModelos(lectura.modelos);
  }
  const [filtro, setFiltro] = useState<FiltroVitrina>(inicial.estado);
  const [categoria, setCategoria] = useState<string | null>(inicial.categoria);
  const [loNuevo, setLoNuevo] = useState<FiltroLoNuevo>(inicial.loNuevo);
  // Cómo se ve la lista (ADR-0430): «Vitrina», las prendas en mosaico como las ve el cliente (de fábrica), o «Lista», la tabla de
  // siempre, más compacta para revisar muchas. Las dos hacen lo mismo: tocar abre su hoja, la casilla elige, el interruptor muestra.
  const [vista, setVista] = useState<"vitrina" | "lista">("vitrina");
  const [texto, setTexto] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [lote, setLote] = useState<{ modo: ModoLote; ids: string[] } | null>(null);

  const { tiendas } = lectura;
  const cifras = cifrasDe(modelos);
  const extra = { categoria, loNuevo };
  // La lista entera según lo que se filtró, y de ella solo una página (30 modelos): con ~300 en producción, sin tope era una página de
  // ~24 000 px. Cambiar cualquier filtro o lo que se escribe vuelve a la primera página.
  const lista = filtrarVitrina(modelos, filtro, texto, extra);
  const [pagina, setPagina] = useState(1);
  const claveDeLista = `${filtro}|${categoria ?? ""}|${loNuevo}|${texto}`;
  const [claveVista, setClaveVista] = useState(claveDeLista);
  if (claveVista !== claveDeLista) {
    setClaveVista(claveDeLista);
    setPagina(1);
  }
  const pag = paginar(lista, pagina, MODELOS_POR_PAGINA);
  const visibles = pag.filas;
  const cajaRef = useRef<HTMLElement>(null);
  // Un rato después de dibujar, las hojas se piden en segundo plano: abrirlas por primera vez no espera su archivo.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void cargarHojaModelo();
      void cargarHojaLote();
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);
  // Pantalla grande y pocas tiendas: una columna por tienda; angosta, o más de 8 tiendas: las filas de siempre (`modoDeLista`).
  const modoLista = modoDeLista(useAnchoDe(cajaRef), tiendas.length);
  const plantillaLista = modoLista === "columnas" ? PLANTILLA_COLUMNAS[tiendas.length]! : PLANTILLA;
  const saltoAlInicio = useRef(false);
  // Cambiar de página lleva la vista al inicio de la lista (ADR-0185): una paginación al pie no se queda abajo.
  const irAPagina = (n: number) => {
    saltoAlInicio.current = true;
    setPagina(n);
  };
  useLayoutEffect(() => {
    if (!saltoAlInicio.current) return;
    saltoAlInicio.current = false;
    soltarPaginaEstable();
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cajaRef.current?.scrollIntoView({ block: "start", behavior: sinMovimiento ? "auto" : "smooth" });
  });
  // Las categorías de lo que se está mirando: con «Empaque», las del empaque; si no, las de la ropa (una categoría de bolsas no
  // serviría de filtro: «todos» no trae el empaque).
  const categorias = categoriasDe(modelos.filter((m) => (filtro === "empaque") === esEmpaque(m)));
  const hayRopa = modelos.some((m) => !esEmpaque(m));
  // Pasar a «Empaque» o volver de él suelta la categoría: la de un lado no existe en el otro.
  const cambiarEstado = (v: FiltroVitrina) => {
    if ((v === "empaque") !== (filtro === "empaque")) setCategoria(null);
    setFiltro(v);
  };
  const porEstado = contarPorEstado(modelos, extra);
  // Cada filtro puesto, para decirlo y quitarlo con un toque. El buscador no cuenta: tiene su propia ✕.
  const puestos = [
    filtro !== "todos" ? { clave: "estado", texto: ESTADOS.find((e) => e.valor === filtro)!.texto, quitar: () => cambiarEstado("todos") } : null,
    categoria ? { clave: "categoria", texto: categoria, quitar: () => setCategoria(null) } : null,
    loNuevo !== "todos" ? { clave: "lo-nuevo", texto: LO_NUEVO.find((e) => e.valor === loNuevo)!.texto, quitar: () => setLoNuevo("todos") } : null,
  ].filter((p) => p !== null);
  const limpiarFiltros = () => {
    setFiltro("todos");
    setCategoria(null);
    setLoNuevo("todos");
  };
  // «Elegir los N de esta página» marca (o quita) solo lo que se ve: elegir todo lo que coincide en todas las páginas haría fácil
  // ocultar 200 modelos con un clic de más.
  const elegidosVisibles = visibles.filter((m) => elegidos.includes(m.id));
  const paginaEntera = visibles.length > 0 && elegidosVisibles.length === visibles.length;
  // «de esta página» solo dice algo cuando hay más de una; con una sola, «Elegir los 27» alcanza.
  const deEstaPagina = pag.totalPaginas > 1 ? " de esta página" : "";
  // «Elegir los N que coinciden»: lo de todas las páginas (aparece cuando hay más de una). El lote igual muestra qué le pasa a cada modelo.
  const hayMasPaginas = lista.length > visibles.length;
  const todosLosQueCoinciden = lista.length > 0 && lista.every((m) => elegidos.includes(m.id));
  const alternarTodos = () => setElegidos((ids) => (todosLosQueCoinciden ? ids.filter((id) => !lista.some((m) => m.id === id)) : [...new Set([...ids, ...lista.map((m) => m.id)])]));
  const alternarPagina = () => setElegidos((ids) => (paginaEntera ? ids.filter((id) => !visibles.some((m) => m.id === id)) : [...new Set([...ids, ...visibles.map((m) => m.id)])]));
  const modeloAbierto = abierto ? modelos.find((m) => m.id === abierto) ?? null : null;
  const delLote = lote ? modelos.filter((m) => lote.ids.includes(m.id)) : [];

  const alternarFiltro = (f: FiltroVitrina) => cambiarEstado(filtro === f ? "todos" : f);
  const alternar = (id: string) => setElegidos((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const actualizar = (nuevo: ModeloVitrina) => {
    setModelos((ms) => ms.map((m) => (m.id === nuevo.id ? nuevo : m)));
    router.refresh();
  };

  return (
    <div className="tw space-y-6">
      <div className="grid gap-3 sm:grid-cols-3" data-guia="vitrina.cifras">
        <TarjetaCifra
          punto="verde"
          etiqueta="Se ven en la web"
          compacta
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.seVen} alMontar />}
          activa={filtro === "en_la_web"}
          onClick={() => alternarFiltro("en_la_web")}
        >
          {`de ${cifras.total} ${cifras.total === 1 ? "modelo" : "modelos"}`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.sinStock > 0 ? "ambar" : "neutro"}
          etiqueta="Sin stock en ninguna tienda"
          compacta
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.sinStock} alMontar />}
          activa={filtro === "sin_stock"}
          onClick={() => alternarFiltro("sin_stock")}
        >
          {cifras.sinStock > 0 ? "Se ven, pero no hay qué separar" : "Todos los que se ven tienen algo"}
        </TarjetaCifra>
        {/* Lo que piden los clientes con «Avísame» (actividad 12, maqueta: «Esperan una talla · Tocaron «Avísame»»): lleva a su lista. */}
        <TarjetaCifra
          punto={esperan ? "ambar" : "neutro"}
          etiqueta="Esperan una talla"
          compacta
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={esperan === null ? null : <CifraQueCuenta valor={esperan} alMontar />}
          noSePudoLeer={esperan === null}
          href="/tienda-web/vitrina/esperan"
        >
          {esperan === null ? "No se pudo leer: entra para volver a intentar" : esperan === 1 ? "Persona que tocó «Avísame»" : "Personas que tocaron «Avísame»"}
        </TarjetaCifra>
      </div>

      <section ref={cajaRef} className="card-cayla scroll-mt-20 space-y-0">
        {/* El buscador, los filtros (un botón que abre un panel flotante) y cómo ver la lista, en una sola fila: bajo `sm` los dos últimos son solo
            íconos y el buscador conserva su ancho. */}
        <div className="flex items-center gap-3 border-b border-sand px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <Buscador
              valor={texto}
              onCambio={setTexto}
              atajo
              guia="vitrina.buscador"
              placeholder="Busca un modelo"
              conteo={texto.trim() ? `${lista.length} ${lista.length === 1 ? "coincide" : "coinciden"}` : undefined}
            />
          </div>
          {modelos.length > 0 && (
            <FiltrosFlotantes activos={puestos.length} guia="vitrina.filtros" pie={puestos.length > 0 ? <BotonLimpiar onClick={limpiarFiltros}>Limpiar filtros</BotonLimpiar> : undefined}>
              <DesplegablePildora
                icono={CircleCheck}
                etiqueta="Estado"
                valor={aPildora(filtro)}
                onValor={(v) => cambiarEstado(dePildora(v) as FiltroVitrina)}
                rotuloCantidad="Modelos"
                opciones={ESTADOS.map((e) => ({ valor: aPildora(e.valor), texto: e.texto, cantidad: porEstado[e.valor] }))}
              />
              {categorias.length > 0 && (
                <DesplegablePildora
                  icono={Shirt}
                  etiqueta="Categoría"
                  valor={categoria ?? TODOS}
                  onValor={(v) => setCategoria(v === TODOS ? null : v)}
                  rotuloCantidad="Modelos"
                  opciones={[{ valor: TODOS, texto: "Todas las categorías" }, ...categorias.map((c) => ({ valor: c.nombre, texto: c.nombre, cantidad: c.modelos }))]}
                />
              )}
              <DesplegablePildora
                icono={Sparkles}
                etiqueta="Lo nuevo"
                valor={aPildora(loNuevo)}
                onValor={(v) => setLoNuevo(dePildora(v) as FiltroLoNuevo)}
                opciones={LO_NUEVO.map((e) => ({ valor: aPildora(e.valor), texto: e.texto }))}
              />
            </FiltrosFlotantes>
          )}
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Cómo ver los modelos"
            valor={vista}
            onCambio={(v) => setVista(v === "lista" ? "lista" : "vitrina")}
            opciones={[
              { clave: "vitrina", etiqueta: "Vitrina", icono: <LayoutGrid />, ayuda: "Las prendas como las ve el cliente", guia: "vitrina.vista-vitrina", soloIcono: true },
              { clave: "lista", etiqueta: "Lista", icono: <List />, ayuda: "Una fila por modelo, para revisar muchos", soloIcono: true },
            ]}
          />
        </div>

        {/* Lo que se filtró, para quitarlo con un toque; a la derecha, cuántos se ven y cómo elegirlos. */}
        {modelos.length > 0 && (puestos.length > 0 || lista.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-sand px-4 py-2.5 sm:px-5">
            {puestos.map((p) => (
              <FiltroPuesto key={p.clave} onQuitar={p.quitar} etiqueta={`Quitar el filtro: ${p.texto}`}>
                {p.texto}
              </FiltroPuesto>
            ))}
            {puestos.length > 0 && <BotonLimpiar onClick={limpiarFiltros}>Limpiar filtros</BotonLimpiar>}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
              {vista === "vitrina" && visibles.length > 0 && (
                <button type="button" className="btn-cayla btn-sutil btn-chico" data-guia="vitrina.elegir-pagina" onClick={alternarPagina}>
                  {paginaEntera ? `Quitar los ${visibles.length}${deEstaPagina}` : `Elegir los ${visibles.length}${deEstaPagina}`}
                </button>
              )}
              {hayMasPaginas && (
                <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={alternarTodos}>
                  {todosLosQueCoinciden ? `Quitar los ${lista.length} que coinciden` : `Elegir los ${lista.length} que coinciden`}
                </button>
              )}
              {lista.length > 0 && (
                <p className="text-[13px] tabular-nums text-taupe" aria-live="polite">
                  Mostrando{" "}
                  <b className="font-semibold text-tinta">
                    {pag.desde}–{pag.hasta}
                  </b>{" "}
                  de <b className="font-semibold text-tinta">{lista.length}</b>
                </p>
              )}
            </div>
          </div>
        )}

        {filtro === "empaque" && (
          <div className="border-b border-sand px-5 py-3">
            <p className="nota-cayla text-[13px]">
              El empaque (bolsas, cajas) se vende desde el ticket, en la caja: no va en la web ni se puede prender. Se ve aquí solo para saber cuánto hay.
            </p>
          </div>
        )}

        {lista.length === 0 ? (
          texto.trim() ? (
            <Vacio icono={<SearchX />} titulo={`Nada coincide con «${texto.trim()}»`} acciones={<Boton onClick={() => setTexto("")}>Borrar la búsqueda</Boton>}>
              Busca por el nombre del modelo, su código o su categoría.
            </Vacio>
          ) : !hayRopa && filtro !== "empaque" ? (
            <Vacio icono={<MonitorSmartphone />} titulo="Todavía no hay modelos para la web">
              Los modelos que se pueden vender (activos y con precio en alguna tienda que se ve en la web) aparecen aquí para mostrarlos en la
              tienda online.
            </Vacio>
          ) : (
            <Vacio
              icono={<SearchX />}
              tamano="chico"
              acciones={puestos.length > 0 ? <Boton onClick={limpiarFiltros}>Limpiar filtros</Boton> : undefined}
            >
              {filtro === "sin_stock" && !categoria && loNuevo === "todos"
                ? "Todos los modelos que se ven en la web tienen algo en alguna tienda."
                : filtro === "sin_precio" && !categoria && loNuevo === "todos"
                  ? "Ningún modelo encendido se queda sin verse por falta de precio."
                  : puestos.length > 0
                    ? "Ningún modelo cumple estos filtros a la vez."
                    : "Ningún modelo se ve en la web todavía."}
            </Vacio>
          )
        ) : vista === "vitrina" ? (
          <ul className="tw-vitrina" data-guia="vitrina.lista" aria-label="Los modelos, como los ve el cliente">
            {visibles.map((m, i) => (
              <CartaModelo
                key={m.id}
                modelo={m}
                tiendas={tiendas}
                i={i}
                elegido={elegidos.includes(m.id)}
                onElegir={() => alternar(m.id)}
                onAbrir={() => setAbierto(m.id)}
                onInterruptor={() => setLote({ modo: m.vitrina?.publicado ? "ocultar" : "mostrar", ids: [m.id] })}
              />
            ))}
          </ul>
        ) : (
          <Tabla className="rounded-none border-0 shadow-none" guia="vitrina.lista">
            <Encabezado
              plantilla={plantillaLista}
              columnas={[
                {
                  titulo: (
                    <Casilla
                      marcada={paginaEntera}
                      aMedias={!paginaEntera && elegidosVisibles.length > 0}
                      onCambio={alternarPagina}
                      etiqueta={paginaEntera ? `Quitar los ${visibles.length}${deEstaPagina}` : `Elegir los ${visibles.length}${deEstaPagina}`}
                    />
                  ),
                },
                { titulo: "Modelo" },
                ...(modoLista === "columnas"
                  ? [
                      { titulo: "Categoría" },
                      { titulo: "Colores", alinear: "der" as const },
                      ...tiendas.map((t) => ({ titulo: nombreCortoSede(t.nombre), alinear: "der" as const, ayuda: `Libre en ${t.nombre}` })),
                      { titulo: "En la web" },
                      { titulo: "" },
                    ]
                  : [{ titulo: "Libre en tiendas" }, { titulo: "En la web", alinear: "der" as const }]),
              ]}
            />
            {visibles.map((m) => {
              const comunes = {
                modelo: m,
                tiendas,
                elegido: elegidos.includes(m.id),
                onElegir: () => alternar(m.id),
                onAbrir: () => setAbierto(m.id),
                onInterruptor: () => setLote({ modo: m.vitrina?.publicado ? ("ocultar" as const) : ("mostrar" as const), ids: [m.id] }),
              };
              return modoLista === "columnas" ? <FilaColumnas key={m.id} {...comunes} /> : <FilaModelo key={m.id} {...comunes} />;
            })}
          </Tabla>
        )}

        {pag.totalPaginas > 1 && (
          <div className="flex justify-center border-t border-sand px-5 py-4" data-guia="vitrina.paginas">
            <PaginacionLocal pagina={pag.pagina} totalPaginas={pag.totalPaginas} onPagina={irAPagina} />
          </div>
        )}
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="vitrina.nota">
        <p>
          En la web cada modelo vale lo mismo que en la tienda que el cliente elige; con «Todas», el precio más alto entre ellas. Las campañas se
          aplican encima con la misma regla de la caja. El precio, las fotos, los colores y las tallas se cambian en su ficha, en Catálogo ▸
          Productos.
        </p>
      </div>

      {/* Lo elegido: abajo, pegado al borde, a la vista aunque la lista sea larga (la misma barra de «Pagar juntos»). El aire de abajo es
          para que no tape la última fila. */}
      {elegidos.length > 0 && <div aria-hidden className="h-20" />}
      <BarraFija
        visible={elegidos.length > 0}
        guia="vitrina.seleccion"
        resumen={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold text-tinta">
              {elegidos.length} {elegidos.length === 1 ? "modelo elegido" : "modelos elegidos"}
            </span>
            <button type="button" className="btn-enlace text-[13px]" data-guia="vitrina.desmarcar" onClick={() => setElegidos([])}>
              Desmarcar todos
            </button>
          </span>
        }
        acciones={
          <span className="flex flex-wrap items-center gap-2">
            <Boton type="button" aria-haspopup="dialog" onClick={() => setLote({ modo: "ocultar", ids: elegidos })}>
              Ocultar
            </Boton>
            <Boton type="button" peso="primario" aria-haspopup="dialog" data-guia="vitrina.lote-mostrar" onClick={() => setLote({ modo: "mostrar", ids: elegidos })}>
              Mostrar en la web
            </Boton>
          </span>
        }
      />
      {modeloAbierto && <VitrinaModeloHoja key={modeloAbierto.id} modelo={modeloAbierto} onClose={() => setAbierto(null)} onGuardado={actualizar} />}
      {lote && delLote.length > 0 && (
        <VitrinaLoteHoja
          modo={lote.modo}
          modelos={delLote}
          onClose={() => setLote(null)}
          onHecho={() => {
            setLote(null);
            setElegidos([]);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Una fila: la casilla para elegir varios, el modelo (que abre su hoja), lo libre en cada tienda y el interruptor. La fila entera
 *  también abre la hoja con el mouse; la casilla y el interruptor no la disparan. */
function FilaModelo({
  modelo: m,
  tiendas,
  elegido,
  onElegir,
  onAbrir,
  onInterruptor,
}: {
  modelo: ModeloVitrina;
  tiendas: LecturaVitrina["tiendas"];
  elegido: boolean;
  onElegir: () => void;
  onAbrir: () => void;
  onInterruptor: () => void;
}) {
  const v = m.vitrina;
  const sinFoto = coloresSinFoto(m);
  // Por qué no se puede mostrar (si no se puede): el empaque se vende en la caja y su interruptor queda apagado y quieto (Felipe
  // 2026-10-15, «Solo ropa en la web»); lo demás, como antes.
  const razon = razonNoSeMuestra(m);
  const empaque = esEmpaque(m);
  return (
    <div
      role="row"
      onClick={(e) => {
        // Un clic que sube desde una hoja abierta (vive en un portal) o desde la casilla, el interruptor o el nombre no abre otra vez.
        if (!e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest("a,button,input,label")) return;
        onAbrir();
      }}
      className={`${fila(PLANTILLA, "cursor-pointer items-center sm:items-center")} ${elegido ? "bg-rojo/[0.045]" : ""}`}
    >
      <span data-guia="vitrina.casilla" className="row-span-2 pt-0.5 sm:row-span-1">
        <Casilla marcada={elegido} onCambio={onElegir} etiqueta={`Elegir ${m.nombre}`} />
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <MiniaturaPrenda
          fotoUrl={m.foto ?? m.colores.find((c) => c.foto)?.foto ?? null}
          colorHex={m.colores[0]?.hex ?? null}
          tamano="md"
          prefijo={m.prefijo}
          familia={m.familia}
          categoria={m.categoria}
        />
        <span className="min-w-0">
          <button type="button" onClick={onAbrir} data-guia="vitrina.abrir" className="block max-w-full truncate text-left font-medium text-tinta hover:text-rojo-profundo">
            <span data-guia="vitrina.modelo">{m.nombre}</span>
          </button>
          <span className="block truncate text-[12px] text-taupe">
            {[m.categoria, `${m.colores.length} ${m.colores.length === 1 ? "color" : "colores"}`, sinFoto ? `${sinFoto} sin foto propia` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {(razon || (v && v.enLoNuevo !== "automatico")) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {razon && <Chip tono={razon.tono}>{razon.chip}</Chip>}
              {v?.enLoNuevo === "fijo" && <Chip tono="verde">Fijado en Lo nuevo</Chip>}
              {v?.enLoNuevo === "quitado" && <Chip tono="neutro">Fuera de Lo nuevo</Chip>}
            </span>
          )}
        </span>
      </span>
      <span className="col-start-2 row-start-2 text-[13px] tabular-nums text-tinta sm:col-start-auto sm:row-start-auto">
        {stockEnTiendas(m, tiendas).map((s, i) => (
          <span key={s.sede} className={s.cantidad === 0 ? "text-tinta/40" : ""}>
            {i > 0 && <span className="text-taupe"> · </span>}
            {s.sede} {s.cantidad}
          </span>
        ))}
      </span>
      <span className="col-start-3 row-start-1 flex justify-end self-center sm:col-start-auto sm:row-start-auto" data-guia="vitrina.interruptor">
        <button
          type="button"
          role="switch" // unificar-fijo: la cara del interruptor del sistema en una fila de tabla; su título es la columna «En la web»
          aria-checked={interruptorEncendido(m)}
          aria-label={`${m.nombre} en la web`}
          // El empaque no va en la web: el interruptor no se puede prender (la insignia dice por qué).
          disabled={empaque}
          onClick={onInterruptor}
          className="interruptor disabled:opacity-50"
        >
          <span aria-hidden className="interruptor-perilla" />
        </button>
      </span>
    </div>
  );
}

/** Una fila en modo «columnas» (pantalla grande, hasta 8 tiendas): lo libre de cada tienda en su propia columna, con su título arriba, para
 *  comparar de un vistazo; la categoría y los colores también tienen la suya. Hace lo mismo que `FilaModelo`: tocar abre su hoja, la casilla
 *  elige, el interruptor muestra. */
function FilaColumnas({
  modelo: m,
  tiendas,
  elegido,
  onElegir,
  onAbrir,
  onInterruptor,
}: {
  modelo: ModeloVitrina;
  tiendas: LecturaVitrina["tiendas"];
  elegido: boolean;
  onElegir: () => void;
  onAbrir: () => void;
  onInterruptor: () => void;
}) {
  const v = m.vitrina;
  const sinFoto = coloresSinFoto(m);
  const razon = razonNoSeMuestra(m);
  const empaque = esEmpaque(m);
  const encendido = interruptorEncendido(m);
  return (
    <div
      role="row"
      onClick={(e) => {
        if (!e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest("a,button,input,label")) return;
        onAbrir();
      }}
      className={`${fila(PLANTILLA_COLUMNAS[tiendas.length]!, "cursor-pointer items-center sm:items-center")} ${elegido ? "bg-rojo/[0.045]" : ""}`}
    >
      <span data-guia="vitrina.casilla">
        <Casilla marcada={elegido} onCambio={onElegir} etiqueta={`Elegir ${m.nombre}`} />
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <MiniaturaPrenda fotoUrl={m.foto ?? m.colores.find((c) => c.foto)?.foto ?? null} colorHex={m.colores[0]?.hex ?? null} tamano="md" prefijo={m.prefijo} familia={m.familia} categoria={m.categoria} />
        <span className="min-w-0">
          <button type="button" onClick={onAbrir} data-guia="vitrina.abrir" className="block max-w-full truncate text-left font-medium text-tinta hover:text-rojo-profundo">
            <span data-guia="vitrina.modelo">{m.nombre}</span>
          </button>
          {sinFoto > 0 && <span className="block truncate text-[12px] text-taupe">{sinFoto} sin foto propia</span>}
          {(razon || (v && v.enLoNuevo !== "automatico")) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {razon && <Chip tono={razon.tono}>{razon.chip}</Chip>}
              {v?.enLoNuevo === "fijo" && <Chip tono="verde">Fijado en Lo nuevo</Chip>}
              {v?.enLoNuevo === "quitado" && <Chip tono="neutro">Fuera de Lo nuevo</Chip>}
            </span>
          )}
        </span>
      </span>
      <span className="truncate text-[13px] text-taupe">{m.categoria ?? "—"}</span>
      <span className="text-right text-[13px] tabular-nums text-tinta">{m.colores.length}</span>
      {stockEnTiendas(m, tiendas).map((s) => (
        <span key={s.sede} className={`text-right text-[13px] tabular-nums ${s.cantidad === 0 ? "text-tinta/40" : "text-tinta"}`}>
          {s.cantidad}
        </span>
      ))}
      <span className="text-[13px] text-taupe">{encendido ? "Se ve en la web" : "No se ve"}</span>
      <span className="flex justify-end" data-guia="vitrina.interruptor">
        <button
          type="button"
          role="switch" // unificar-fijo: la cara del interruptor del sistema en una fila de tabla; su título es la columna «En la web»
          aria-checked={encendido}
          aria-label={`${m.nombre} en la web`}
          disabled={empaque}
          onClick={onInterruptor}
          className="interruptor disabled:opacity-50"
        >
          <span aria-hidden className="interruptor-perilla" />
        </button>
      </span>
    </div>
  );
}

/** Un modelo en la vista «Vitrina» (ADR-0430): su foto vertical como la ve el cliente (sin foto, su categoría sobre su color, ADR-0333),
 *  la casilla para elegir varios, el nombre que abre su hoja, lo libre en cada tienda y el interruptor. Apagado, la foto se atenúa:
 *  así se ve de un vistazo qué no ve el cliente. Entra en cascada al llegar (`.tw-carta`). */
function CartaModelo({
  modelo: m,
  tiendas,
  i,
  elegido,
  onElegir,
  onAbrir,
  onInterruptor,
}: {
  modelo: ModeloVitrina;
  tiendas: LecturaVitrina["tiendas"];
  i: number;
  elegido: boolean;
  onElegir: () => void;
  onAbrir: () => void;
  onInterruptor: () => void;
}) {
  const v = m.vitrina;
  const razon = razonNoSeMuestra(m);
  const empaque = esEmpaque(m);
  const encendido = interruptorEncendido(m);
  const foto = m.foto ?? m.colores.find((c) => c.foto)?.foto ?? null;
  const sinFoto = <SinFoto tamano="h-full w-full !rounded-none" colorHex={m.colores[0]?.hex ?? null} prefijo={m.prefijo} familia={m.familia} categoria={m.categoria} conNombre />;
  return (
    <li
      className="tw-carta"
      style={{ "--i": i } as CSSProperties}
      data-elegida={elegido ? "" : undefined}
      data-oculta={encendido ? undefined : ""}
    >
      <span className="tw-carta-casilla" data-guia="vitrina.casilla">
        <Casilla marcada={elegido} onCambio={onElegir} etiqueta={`Elegir ${m.nombre}`} />
      </span>
      <button type="button" onClick={onAbrir} className="tw-carta-foto" aria-label={`Abrir ${m.nombre}`} tabIndex={-1}>
        <span>{foto ? <ImagenDePrenda src={foto} alt="" fill sizes="200px" className="object-cover" fondo={m.colores[0]?.hex ?? null} fallback={sinFoto} /> : sinFoto}</span>
      </button>
      <span className="tw-carta-cuerpo">
        <button type="button" onClick={onAbrir} data-guia="vitrina.abrir" className="tw-carta-nombre">
          <span data-guia="vitrina.modelo">{m.nombre}</span>
        </button>
        <span className="tw-carta-stock" aria-label="Libre en cada tienda">
          {stockEnTiendas(m, tiendas).map((s) => (
            <span key={s.sede} data-cero={s.cantidad === 0 ? "" : undefined}>
              {s.sede} {s.cantidad}
            </span>
          ))}
        </span>
        {(razon || (v && v.enLoNuevo !== "automatico")) && (
          <span className="flex flex-wrap gap-1.5">
            {razon && <Chip tono={razon.tono}>{razon.chip}</Chip>}
            {v?.enLoNuevo === "fijo" && <Chip tono="verde">Fijado en Lo nuevo</Chip>}
            {v?.enLoNuevo === "quitado" && <Chip tono="neutro">Fuera de Lo nuevo</Chip>}
          </span>
        )}
        <span className="tw-carta-pie" data-guia="vitrina.interruptor">
          <span>{encendido ? "Se ve en la web" : "No se ve"}</span>
          <button
            type="button"
            role="switch" // unificar-fijo: la cara del interruptor del sistema en la carta de un modelo; su título es la línea de al lado
            aria-checked={encendido}
            aria-label={`${m.nombre} en la web`}
            disabled={empaque}
            onClick={onInterruptor}
            className="interruptor disabled:opacity-50"
          >
            <span aria-hidden className="interruptor-perilla" />
          </button>
        </span>
      </span>
    </li>
  );
}
