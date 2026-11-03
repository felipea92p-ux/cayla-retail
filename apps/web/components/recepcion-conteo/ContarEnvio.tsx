"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { EtiquetaAhora } from "@/components/alta-producto/guia";
import { BaldosaCategoria } from "./piezas";
import { Dial } from "./Dial";
import { atajosDelDial } from "@/lib/recepcion-dial-reglas";
import { CategoriasAcordeon, FiltrosDelEnvio } from "./CategoriasAcordeon";
import { Odometro } from "./Odometro";
import { BarraDeAbajo } from "@/components/ui/BarraDeAbajo";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda, type DestinoHoja } from "@/components/recepcion-envio/HojaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { leerObservacionesDelEnvio } from "@/lib/recepcion-conteo-acciones";
import { deLasLineas, type ObservacionDeEnvio } from "@/lib/observaciones-envio-reglas";
import type { CatalogoParaRecibir, DetalleEnvio, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  cambiarNuevasSinDescribir,
  contadasDe,
  describirNuevas,
  lineasALaVista,
  nuevasSinDescribir,
  ponerTallas,
  prendaCreadaDeNueva,
  sumarPrenda,
  textoPrendas,
  veredictoDeLaBalanza,
  type ClaveLinea,
  type ConteosDelEnvio,
  type LineaParaContar,
  type PrendaSeparada,
  type Separado,
  SIN_MARCA,
  marcaDeLinea,
} from "@/lib/recepcion-conteo-reglas";
import {
  agruparLineas,
  descripcionDelGrupo,
  gruposSinIdentificar,
  idCampoIdentificar,
  lineaDeLaPrenda,
  minimoDelGrupo,
  repartirTotal,
  sinIdentificarDelGrupo,
  veredictoDelGrupo,
  type GrupoDeLineas,
  type Reparto,
} from "@/lib/recepcion-grupos-reglas";
import {
  camposDelConteoPorModelo,
  categoriasDelEnvio,
  categoriasEnOrden,
  claveDeNombre,
  claveDeParada,
  conMiles,
  grupoDeLaClave,
  gruposDelFiltro,
  idCampoParada,
  lineasDelModelo,
  nombreDeParada,
  opcionesDelFiltro,
  paradaContada,
  paradaEnFoco,
  repartirModelo,
  repartirOtroCambio,
  SIN_FILTRO,
  type FiltroDelConteo,
  type OrdenDelConteo,
  type ParadaDelConteo,
} from "@/lib/recepcion-modelos-reglas";
import { AgregarFueraDeGuia } from "./AgregarFueraDeGuia";
import { ObservacionesDeLinea } from "./ObservacionesDeLinea";
import { HojaTallas } from "./HojaTallas";
import type { Borrador, EstadoGuardado } from "./RecibirContando";
import { PrendasDeLaPlaca } from "./PrendasDeLaPlaca";

// Contar (ADR-0393, el paso 2 de la cara A; modelo por modelo desde el 2026-11-02): a la izquierda las categorías del envío, cada una una sola vez,
// con sus modelos adentro; a la derecha, UNO a la vez: cuántas llegaron de ese modelo. Cada cambio se guarda solo. La guía de foco enciende el
// próximo modelo sin contar.
//
// Por dentro la base sigue guardando una fila por línea de la compra: `lib/recepcion-modelos-reglas.ts` dice en qué línea cae cada modelo y
// `lib/recepcion-grupos-reglas.ts` reparte. Lo que no tiene modelo (un envío sin aviso, una compra que no anotó qué prendas eran) se cuenta como
// un total y después se identifica.

type Hoja =
  | { tipo: "tallas"; grupo: string; original: PrendaSeparada; prenda: PrendaRecepcion }
  | { tipo: "prenda"; grupo: string; original: PrendaSeparada; modo: "nueva" | "agregar"; prenda: PrendaRecepcion | null }
  // «Crear ahora» de una nueva ya descrita: la hoja de la prenda, sin una prenda de partida (la descripción es el nombre que se ofrece).
  | { tipo: "crear"; grupo: string; nueva: { cantidad: number; descripcion: string } }
  | { tipo: "agregar" }
  | null;


export function ContarEnvio({
  detalle,
  lineas,
  conteos,
  sinAviso,
  proveedorPorConfirmar = false,
  reabierto,
  catalogo,
  responsable,
  guardados,
  errores,
  prendas,
  onPrendaVista,
  onEscribir,
  onAgregar,
  onCerrar,
}: {
  detalle: DetalleEnvio;
  lineas: readonly LineaParaContar[];
  conteos: ConteosDelEnvio | null;
  sinAviso: boolean;
  /** Llegó sin aviso y sin saber de quién (Felipe 2026-10-14): se cuenta igual; el proveedor se elige al cerrar. */
  proveedorPorConfirmar?: boolean;
  reabierto: boolean;
  catalogo: CatalogoParaRecibir | null;
  responsable: ControlResponsable;
  guardados: Readonly<Record<string, EstadoGuardado>>;
  errores: Readonly<Record<string, string>>;
  prendas: ReadonlyMap<string, PrendaRecepcion>;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onEscribir: (linea: LineaParaContar, cambio: Partial<Borrador>) => void;
  onAgregar: (nuevo: { proveedorId: string | null; categoriaId: string; marcaId: string | null }) => Promise<ClaveLinea | null>;
  onCerrar: () => void;
}) {
  // Lo agregado en esta visita se ve aunque todavía esté en 0 (lo de fuera de la guía en 0 es «lo quitado»).
  const [agregados, setAgregados] = useState<ReadonlySet<string>>(new Set());
  // Se cuenta UNA cosa a la vez: `foco` es la llave de su parada (un modelo, o el total de un grupo sin modelos). Arranca en la primera sin contar.
  const [foco, setFoco] = useState<string | null>(() => paradaEnFoco(categoriasDelEnvio(agruparLineas(lineasALaVista(lineas, new Set(), null))).flatMap((c) => c.paradas), null)?.clave ?? null);
  const [filtro, setFiltro] = useState<FiltroDelConteo>(SIN_FILTRO);
  const [orden, setOrden] = useState<OrdenDelConteo>(null);
  // La persona plegó la categoría de lo que se cuenta: aquí, en qué parada lo hizo. Al pasar a contar otra cosa, se abre sola.
  const [plegadaEn, setPlegadaEn] = useState<string | null>(null);
  const visibles = lineasALaVista(lineas, agregados, foco?.startsWith("extra:") ? (grupoDeLaClave(foco) as ClaveLinea) : null);
  const grupos = agruparLineas(visibles);
  // La guía y «Pasar a cerrar» miran todo el envío; el filtro solo decide qué se ve a la izquierda.
  const todas = categoriasEnOrden(categoriasDelEnvio(grupos), orden);
  const categorias = categoriasEnOrden(categoriasDelEnvio(gruposDelFiltro(grupos, filtro)), orden);
  const paradas = categorias.flatMap((c) => c.paradas);
  const parada = paradaEnFoco(paradas, foco);
  const opciones = opcionesDelFiltro(grupos, filtro);
  const guiaBase = useGuiaCampos(camposDelConteoPorModelo(todas), { enModal: false });
  const [hoja, setHoja] = useState<Hoja>(null);
  // Las observaciones de todo el envío (ADR-0507), leídas una vez; cada categoría muestra las suyas.
  const [observaciones, setObservaciones] = useState<readonly ObservacionDeEnvio[]>([]);
  useEffect(() => {
    let vivo = true;
    void leerObservacionesDelEnvio(detalle.id).then(({ observaciones: leidas }) => vivo && setObservaciones(leidas));
    return () => {
      vivo = false;
    };
  }, [detalle.id]);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  // «Cómo se guarda quién cuenta»: la ayuda se abre con un toque (nunca solo con el mouse encima).
  const [verAyuda, setVerAyuda] = useState(false);
  const grupo = parada?.grupo ?? null;
  // Las observaciones y «quién contó» son de la línea del modelo; las de un total, de todas las del grupo.
  const lineasDeLaParada = parada ? (parada.modelo ? lineasDelModelo(parada.grupo, parada.modelo) : parada.grupo.lineas) : [];
  const plegada = !!parada && plegadaEn === parada.clave;
  // «Falta: Vestido Antonella» desde otra categoría (o escondido por el filtro, o con la categoría plegada): primero se abre esa categoría y recién después se lleva hasta él.
  const guia: GuiaCampos = {
    ...guiaBase,
    ir: (id) => {
      const lista = todas.flatMap((c) => c.paradas);
      const destino = lista.find((p) => idCampoParada(p) === id) ?? lista.find((p) => idCampoIdentificar(p.grupo.clave) === id);
      const despuesDeAbrir = () => requestAnimationFrame(() => requestAnimationFrame(() => guiaBase.ir(id)));
      setPlegadaEn(null);
      if (!destino || destino.grupo.clave === grupo?.clave) {
        if (destino && destino.modelo && idCampoParada(destino) === id) setFoco(destino.clave);
        if (plegada) return void despuesDeAbrir();
        return guiaBase.ir(id);
      }
      setFiltro(SIN_FILTRO);
      setFoco(destino.clave);
      despuesDeAbrir();
    },
  };
  const faltanIdentificar = gruposSinIdentificar(grupos);
  const i = parada ? paradas.indexOf(parada) : -1;
  const siguiente = i >= 0 ? (paradas[i + 1] ?? null) : null;
  const anterior = i > 0 ? paradas[i - 1] : null;
  const yaUsadas = new Set(visibles.map((l) => `${l.categoria?.id}|${l.marca?.id ?? SIN_MARCA}`));
  const proveedores = conteos?.proveedores ?? [];

  function elegir(p: ParadaDelConteo) {
    setPlegadaEn(null);
    setFoco(p.clave);
  }

  /** Guarda lo que cambió en cada línea de la categoría (cada una se guarda sola, con su propio aviso). */
  function aplicar(r: Reparto) {
    for (const c of r.cambios) onEscribir(c.linea, { contadas: c.contadas, separado: c.separado });
  }

  /** La persona dejó este número en el Dial: el del modelo, o el total de un grupo sin modelos (se reparte entre sus líneas cambiando lo mínimo). */
  function escribirEnParada(p: ParadaDelConteo, n: number) {
    aplicar(p.modelo ? repartirModelo(p.grupo, p.modelo, n) : repartirTotal(p.grupo, n));
  }

  /** Lo separado de un grupo cambió por otra cosa que el Dial (llegó otra prenda, sus tallas, las sin nombre): lo contado lo sigue. */
  function escribirSeparado(g: GrupoDeLineas, s: Separado) {
    aplicar(repartirOtroCambio(g, s));
  }

  /** Llegó esta prenda del catálogo (parecida o buscada): una más en la lista y queda en el Dial para seguir contándola. */
  function llegoPrenda(g: GrupoDeLineas, p: PrendaRecepcion) {
    onPrendaVista(p);
    escribirSeparado(g, sumarPrenda(g.separado, { productoId: p.productoId, nombre: p.nombre, codigo: p.codigo }));
    setFoco(claveDeParada(g, p.productoId));
  }

  /** Llegó algo que no está en el catálogo: se anota con su nombre y queda en el Dial. */
  function llegoNueva(g: GrupoDeLineas, texto: string) {
    escribirSeparado(g, describirNuevas(cambiarNuevasSinDescribir(g.separado, nuevasSinDescribir(g.separado) + 1), texto, 1));
    setFoco(claveDeParada(g, claveDeNombre(texto)));
  }

  async function prendaCompleta(p: PrendaSeparada, l: LineaParaContar): Promise<PrendaRecepcion | null> {
    const ya = prendas.get(p.productoId);
    if (ya) return ya;
    if (!l.categoria) return null;
    const { prendas: halladas } = await buscarPrendasParaRecibir(l.categoria.id, marcaDeLinea(l).id, p.nombre ?? "");
    const hallada = halladas.find((x) => x.productoId === p.productoId) ?? null;
    if (hallada) onPrendaVista(hallada);
    return hallada;
  }

  async function abrirTallas(g: GrupoDeLineas, p: PrendaSeparada) {
    setErrorHoja(null);
    const completa = await prendaCompleta(p, g.principal);
    if (!completa) {
      setErrorHoja(`No se pudieron leer las tallas y colores de ${p.nombre ?? "esa prenda"}. Recarga la pantalla y vuelve a intentar.`);
      return;
    }
    setHoja({ tipo: "tallas", grupo: g.clave, original: p, prenda: completa });
  }

  /**
   * La prenda de «Crear ahora» ya existe (recién creada, o «Usar esa prenda»): esas nuevas dejan de estar «por crear» y pasan a ser la prenda,
   * sin tallas todavía, y se sigue en su hoja de tallas. Se guarda ya: si la hoja de tallas se deja para después, la fila queda con
   * «Tallas y colores ahora».
   */
  function prendaDeLaNueva(g: GrupoDeLineas, descripcion: string, prenda: PrendaRecepcion) {
    onPrendaVista(prenda);
    const separado = prendaCreadaDeNueva(g.separado, descripcion, prenda);
    escribirSeparado(g, separado);
    // Si se anotó por su nombre y se creó con otro, ahora es otra fila: el Dial la sigue.
    if (parada?.modelo && parada.modelo.nombre !== prenda.nombre) setFoco(claveDeParada(g, prenda.productoId));
    const original = separado.prendas.find((p) => p.productoId === prenda.productoId);
    setHoja(original ? { tipo: "tallas", grupo: g.clave, original, prenda } : null);
  }

  const grupoDeHoja = hoja && hoja.tipo !== "agregar" ? (grupos.find((g) => g.clave === hoja.grupo) ?? null) : null;
  // La prenda de la hoja se guarda en la línea de la compra que la anotó (de ahí salen su precio sugerido y su costo).
  const lineaDeHoja =
    grupoDeHoja && hoja && hoja.tipo !== "agregar"
      ? lineaDeLaPrenda(grupoDeHoja, hoja.tipo === "crear" ? { descripcion: hoja.nueva.descripcion } : { productoId: hoja.original.productoId })
      : null;
  const categoriaDeHoja = grupoDeHoja?.principal.categoria ? (catalogo?.categorias.find((c) => c.id === grupoDeHoja.principal.categoria?.id) ?? null) : null;

  // La balanza de abajo: todo lo que dijeron contra todo lo contado (sin aviso, nada con qué comparar).
  const conGuia = visibles.some((l) => l.dijeron != null);
  const totalDijeron = conGuia ? visibles.reduce((a, l) => a + (l.dijeron ?? 0), 0) : null;
  const totalContadas = visibles.reduce((a, l) => a + (l.conteo ? contadasDe(l) : 0), 0);
  // Las que ya se sabe qué prenda son, de todo el envío (lo contado menos lo que falta identificar, categoría por categoría).
  const totalIdentificadas = grupos.reduce((a, g) => a + (g.lineas.some((l) => l.conteo !== null) ? g.contadas - sinIdentificarDelGrupo(g) : 0), 0);
  // Cuántos modelos van, de todo el envío (el filtro solo decide qué se ve a la izquierda).
  const paradasConModelo = todas.flatMap((c) => c.paradas).filter((p) => p.modelo);
  const modelosDelEnvio = paradasConModelo.length;
  const modelosContados = paradasConModelo.filter(paradaContada).length;

  return (
    <div className="space-y-5">
      {reabierto && (
        <Aviso tono="info" titulo="Reabriste el envío">
          Corrige lo que haga falta y vuelve a cerrarlo. Lo que ya entró al stock no se vuelve a contar ni se toca.
        </Aviso>
      )}

      {/* La mesa (rediseño «B», Felipe 2026-10-29; repartida de nuevo el 2026-11-02): las categorías llevan 3/5 del ancho, para ver lo que anotó Compras, y la
          placa del Dial 2/5 (400 px como mínimo). Los filtros van en su fila, para que la primera categoría y la placa empiecen a la misma altura. Con la
          tarjeta angosta (una laptop chica o el celular) las categorías van arriba. */}
      <div className="rc-mesa">
       <FiltrosDelEnvio
         cuantas={categorias.length}
         sinAviso={sinAviso}
         filtro={filtro}
         proveedores={opciones.proveedores}
         marcas={opciones.marcas}
         filtrarProveedor={opciones.hayQueFiltrarProveedor}
         filtrarMarca={opciones.hayQueFiltrarMarca}
         totalCategorias={todas.length}
         onFiltro={setFiltro}
         orden={orden}
         conOrden={todas.flatMap((c) => c.paradas).length > 1}
         onOrden={setOrden}
       />
       <div className="rc-mesa-grilla">
        <div className="rc-mesa-lado">
          <CategoriasAcordeon
            categorias={categorias}
            enFoco={parada}
            plegada={plegada}
            sinAviso={sinAviso}
            totalCategorias={todas.length}
            onPlegar={(plegar) => setPlegadaEn(plegar && parada ? parada.clave : null)}
            onElegir={elegir}
            onAgregar={() => setHoja({ tipo: "agregar" })}
          />
          <div data-guia="recepcion.quien-cuenta" className="rc-quien">
            <div className="flex items-center gap-1">
              <p className="label-cayla text-[11px] text-taupe">Quién cuenta</p>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-taupe transition-colors hover:text-tinta"
                aria-expanded={verAyuda}
                aria-controls="rc-ayuda-quien"
                aria-label="Cómo se guarda quién cuenta"
                onClick={() => setVerAyuda((v) => !v)}
              >
                <Info aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <ComboResponsable control={responsable} compacto className="min-w-0" />
            {verAyuda && (
              <p id="rc-ayuda-quien" className="nota-cayla text-sm">
                Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.
              </p>
            )}
          </div>
          {proveedorPorConfirmar && (
            <p className="nota-cayla text-sm">
              <b className="text-tinta">Proveedor por confirmar.</b> Cuenta igual: al cerrar eliges de quién llegó (pregúntale a Compras).
            </p>
          )}
        </div>

        <div className="rc-mesa-cuenta min-w-0 space-y-4">
          <section className="space-y-4" aria-label="Contar">
            {!grupo || !parada ? (
              <div className="rc-contador space-y-2 p-6 py-10 text-center">
                <TituloSeccion>¿Qué llegó?</TituloSeccion>
                <p className="text-sm text-taupe">Agrega la primera categoría a la izquierda y cuéntala. Una a la vez; después agregas las demás.</p>
              </div>
            ) : (
              <ContadorDeParada
                key={parada.clave}
                parada={parada}
                sinAviso={sinAviso}
                guardado={estadoDelGrupo(grupo, guardados)}
                error={grupo.lineas.map((l) => errores[l.clave]).find(Boolean) ?? null}
                onPoner={(n) => escribirEnParada(parada, n)}
                observaciones={
                  <ObservacionesDeLinea
                    despachoId={detalle.id}
                    lineaId={lineasDeLaParada[0]?.linea?.id ?? null}
                    nombre={parada.modelo ? parada.modelo.nombre : grupo.principal.categoria ? grupo.principal.categoria.nombre.toLowerCase() : "prendas"}
                    observaciones={deLasLineas(observaciones, lineasDeLaParada.map((l) => l.linea?.id ?? null))}
                    responsable={responsable}
                    onAnotada={(o) => setObservaciones((todas) => [...todas, o])}
                  />
                }
              >
                <PrendasDeLaPlaca
                  parada={parada}
                  onSeparado={(s) => escribirSeparado(grupo, s)}
                  onPrendaDelCatalogo={(p) => llegoPrenda(grupo, p)}
                  onTextoNuevo={(t) => llegoNueva(grupo, t)}
                  onTallas={(p) => void abrirTallas(grupo, p)}
                  onCrearNueva={(nueva) => setHoja({ tipo: "crear", grupo: grupo.clave, nueva })}
                  onQuitarSueltas={() => aplicar(repartirTotal(grupo, minimoDelGrupo(grupo)))}
                />
                {errorHoja && (
                  <Aviso tono="error" chico>
                    {errorHoja}
                  </Aviso>
                )}
              </ContadorDeParada>
            )}

            <PieGuia guia={guia} tope={4} listo="Todas las categorías tienen su número y sus prendas identificadas." />

          </section>
        </div>
       </div>
        {/* La barra de abajo, que se queda al pie mientras se baja (Felipe 2026-11-02, sobre la opción A y los totales que ruedan de ADR-0575): desde que no están
            los pasos de arriba, es la que dice cómo va todo el envío y qué sigue. */}
        <BarraDeAbajo pegada className="rc-cierre" data-guia="recepcion.cifra">
          <Volver onClick={() => anterior && elegir(anterior)} deshabilitado={!anterior} a="Volver al modelo anterior" />
          <CifrasDelEnvio dijeron={totalDijeron} contadas={totalContadas} identificadas={totalIdentificadas} modelosContados={modelosContados} modelos={modelosDelEnvio} />
          <div className="barra-abajo-acciones">
            {/* Con todas las categorías contadas (o al reabrir), lo que sigue es cerrar, esté donde esté la persona en la lista. */}
            {siguiente && !guia.puedeConfirmar ? (
              <Boton type="button" peso="primario" onClick={() => elegir(siguiente)}>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="rc-cierre-sigue">Listo, sigue {nombreDeParada(siguiente)}</span>
                  <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
                </span>
              </Boton>
            ) : (
              <Boton
                type="button"
                peso="primario"
                onClick={onCerrar}
                disabled={visibles.length === 0 || faltanIdentificar.length > 0}
                title={faltanIdentificar.length > 0 ? `Falta identificar las prendas de ${faltanIdentificar.map((g) => g.principal.categoria?.nombre ?? "una categoría").join(", ")}` : undefined}
                data-guia="recepcion.pasar-a-cerrar"
              >
                <span className="inline-flex items-center gap-1.5">
                  Pasar a cerrar
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </span>
              </Boton>
            )}
          </div>
        </BarraDeAbajo>
      </div>

      {hoja?.tipo === "agregar" && (
        <AgregarFueraDeGuia
          catalogo={catalogo}
          proveedores={proveedores}
          sinAviso={sinAviso}
          yaUsadas={yaUsadas}
          onAgregar={async (nuevo) => {
            const clave = await onAgregar(nuevo);
            if (clave) {
              setAgregados((a) => new Set([...a, clave]));
              setFiltro(SIN_FILTRO);
              setFoco(`${clave}::*`);
            }
            return clave;
          }}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "tallas" && grupoDeHoja?.principal.categoria && (
        <HojaTallas
          key={hoja.prenda.productoId}
          prenda={hoja.prenda}
          categoria={grupoDeHoja.principal.categoria}
          marca={marcaDeLinea(grupoDeHoja.principal)}
          colores={catalogo?.colores ?? []}
          variantes={hoja.original.productoId === hoja.prenda.productoId ? hoja.original.variantes : null}
          sugeridas={hoja.original.cantidad}
          textoListo="Listo"
          onListo={(prenda, variantes) => {
            escribirSeparado(grupoDeHoja, ponerTallas(grupoDeHoja.separado, hoja.original.productoId, prenda, variantes));
            setHoja(null);
          }}
          onAbrirHoja={(modo, prenda) => setHoja({ tipo: "prenda", grupo: hoja.grupo, original: hoja.original, modo, prenda })}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "crear" && grupoDeHoja?.principal.categoria && lineaDeHoja && (
        <HojaPrenda
          // Lo que se describió al contar se ofrece como nombre, igual que con «Crear ahora» de «Para después».
          destino={{ ...destinoDe(detalle, lineaDeHoja, "nueva", null, proveedores.length), descripcionOrden: hoja.nueva.descripcion || (lineaDeHoja.linea?.descripcion ?? null) }}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          responsable={responsable}
          onListo={(prenda) => prendaDeLaNueva(grupoDeHoja, hoja.nueva.descripcion, prenda)}
          onUsarExistente={async (productoId, nombre) => {
            if (!grupoDeHoja.principal.categoria) return false;
            const { prendas: halladas } = await buscarPrendasParaRecibir(grupoDeHoja.principal.categoria.id, marcaDeLinea(grupoDeHoja.principal).id, nombre);
            const hallada = halladas.find((x) => x.productoId === productoId);
            if (!hallada) return false;
            prendaDeLaNueva(grupoDeHoja, hoja.nueva.descripcion, hallada);
            return true;
          }}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "prenda" && grupoDeHoja?.principal.categoria && lineaDeHoja && (
        <HojaPrenda
          destino={destinoDe(detalle, lineaDeHoja, hoja.modo, hoja.prenda, proveedores.length)}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          responsable={responsable}
          onListo={(prenda) => {
            onPrendaVista(prenda);
            setHoja({ tipo: "tallas", grupo: hoja.grupo, original: hoja.original, prenda });
          }}
          onUsarExistente={async (productoId, nombre) => {
            if (!grupoDeHoja.principal.categoria) return false;
            const { prendas: halladas } = await buscarPrendasParaRecibir(grupoDeHoja.principal.categoria.id, marcaDeLinea(grupoDeHoja.principal).id, nombre);
            const hallada = halladas.find((x) => x.productoId === productoId);
            if (!hallada) return false;
            onPrendaVista(hallada);
            setHoja({ tipo: "tallas", grupo: hoja.grupo, original: hoja.original, prenda: hallada });
            return true;
          }}
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
}

/** Cómo va el guardado de una categoría: guardando si alguna de sus líneas guarda, con error si alguna falló, guardado si todas lo están. */
function estadoDelGrupo(g: GrupoDeLineas, guardados: Readonly<Record<string, EstadoGuardado>>): EstadoGuardado | null {
  const e = g.lineas.map((l) => guardados[l.clave]);
  if (e.includes("guardando")) return "guardando";
  if (e.includes("error")) return "error";
  return e.includes("guardado") ? "guardado" : null;
}

/** A dónde va la hoja de la prenda («Es nueva» / «+ talla o color») desde una línea del conteo. */
function destinoDe(detalle: DetalleEnvio, l: LineaParaContar, modo: "nueva" | "agregar", prenda: PrendaRecepcion | null, nProveedores: number): DestinoHoja {
  return {
    modo,
    despachoId: detalle.id,
    despachoItemId: l.linea?.id ?? null,
    categoriaId: l.categoria?.id ?? "",
    marcaId: l.marca?.id ?? null,
    marcaNombre: marcaDeLinea(l).nombre,
    descripcionOrden: l.linea?.descripcion ?? null,
    precioSugerido: l.linea?.precioVentaSugerido ?? null,
    costoUnitario: l.conteo?.costoUnitario ?? l.linea?.costoUnitario ?? null,
    prenda,
    proveedorId: !l.linea && nProveedores >= 2 ? (l.proveedor?.id ?? null) : null,
  };
}

/** El número de lo que se está contando (un modelo, o el total de un grupo sin modelos): − [40] + , con +5, +10 y «Llegaron las 40». */
function ContadorDeParada({
  parada,
  sinAviso,
  guardado,
  error,
  onPoner,
  observaciones,
  children,
}: {
  parada: ParadaDelConteo;
  sinAviso: boolean;
  guardado: EstadoGuardado | null;
  error: string | null;
  /** La persona dejó este número: la pantalla lo guarda en la línea que le toca. */
  onPoner: (n: number) => void;
  /** Las observaciones (ADR-0507): entre el número y lo que se separa. */
  observaciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { grupo, modelo } = parada;
  const p = grupo.principal;
  const hayConteo = modelo ? modelo.contado : grupo.lineas.some((l) => l.conteo !== null);
  const contadas = modelo ? modelo.contadas : grupo.contadas;
  const dijeron = modelo ? modelo.esperadas : grupo.dijeron;
  // Un modelo se puede bajar hasta 0 (no llegó); el total de un grupo, no por debajo de lo que ya se dijo qué es.
  const minimo = modelo ? 0 : minimoDelGrupo(grupo);
  const v = veredictoDelGrupo(grupo);
  const hayDiferencia = modelo ? modelo.estado === "a-medias" || modelo.estado === "sobran" || modelo.estado === "no-llego" : v.tono === "ambar";
  const poner = (n: number) => onPoner(Math.max(minimo, Math.max(0, n)));
  const [atajoChico, atajoGrande] = atajosDelDial(dijeron, contadas);

  const lineasDeEsto = modelo ? lineasDelModelo(grupo, modelo) : [];
  const contoNombre = (lineasDeEsto.length > 0 ? lineasDeEsto : grupo.lineas)
    .map((l) => l.conteo)
    .filter((c): c is NonNullable<typeof c> => c !== null && !!c.contadoPor?.nombre)
    .sort((a, b) => (b.contadoEn ?? "").localeCompare(a.contadoEn ?? ""))[0]?.contadoPor?.nombre;
  const llevaCuenta = guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "Guardado" : contoNombre ? `Contó ${contoNombre}` : null; // unificar-fijo: el estado de la categoría mientras se guarda sola, no un botón (como la planilla de Contar)
  const nombre = modelo ? modelo.nombre : p.categoria ? p.categoria.nombre.toLowerCase() : "prendas";
  const descripcion = modelo ? null : descripcionDelGrupo(grupo);

  return (
    <section className="rc-contador rc-placa space-y-4 p-4" aria-label="Cuántas llegaron">
      {/* En una placa angosta, «Contó …» baja bajo el nombre: a su lado lo apretaba a una columna de pocas letras. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <BaldosaCategoria categoria={p.categoria} />
        <div className="min-w-0 flex-1 basis-48">
          <TituloSeccion dato={!hayConteo ? <EtiquetaAhora /> : undefined}>{nombreDeParada(parada)}</TituloSeccion>
          <p className="text-sm text-taupe">
            {[modelo ? p.categoria?.nombre : null, p.categoria ? marcaDeLinea(p).nombre : null, p.proveedor?.nombre, descripcion].filter(Boolean).join(" · ")}
            {dijeron != null && (
              <>
                {" "}· Dijeron <b className="text-tinta">{conMiles(dijeron)}</b>
              </>
            )}
            {!p.linea && !sinAviso && (
              <>
                {" "}· <Chip tono="ambar">No estaba en la guía</Chip>
              </>
            )}
          </p>
        </div>
        {llevaCuenta && (
          <p className="rc-placa-quien text-sm text-taupe" aria-live="polite">
            {llevaCuenta}
          </p>
        )}
      </div>

      {/* La placa compacta (Felipe 2026-11-02): el Dial con sus atajos y, según el ancho de la placa, a su derecha o debajo lo que falta decir de esa prenda y las que se parecen. */}
      <div className="rc-placa-cuerpo">
        <div className="rc-placa-dial" data-guia="recepcion.numero">
          <Dial contadas={contadas} dijeron={dijeron} hayConteo={hayConteo} minimo={minimo} nombre={nombre} onPoner={poner} />
          <p className="rc-dial-pista">Toca el número para escribirlo</p>
          <div className="rc-rapidos">
            <button type="button" onClick={() => poner(contadas + atajoChico)}>
              +{atajoChico}
            </button>
            <button type="button" onClick={() => poner(contadas + atajoGrande)}>
              +{atajoGrande}
            </button>
            {dijeron != null && dijeron >= minimo && dijeron !== contadas && (
              <button type="button" onClick={() => poner(dijeron)}>
                Llegaron las {conMiles(dijeron)}
              </button>
            )}
            {!hayConteo && (modelo || p.linea) ? (
              <button type="button" onClick={() => poner(0)}>
                No llegó nada
              </button>
            ) : (
              contadas > 0 &&
              minimo === 0 && (
                <button type="button" onClick={() => poner(0)}>
                  Poner en cero
                </button>
              )
            )}
          </div>
          {/* El aro ya dice si cuadra, faltan o sobran: aquí solo lo que hacer si no cuadra. */}
          {hayDiferencia && <p className="text-center text-[14px] text-taupe">Si no coincide, al cerrar dices por qué.</p>}
          {grupo.enStock > 0 && <p className="text-center text-sm text-taupe">Ya entraron {textoPrendas(grupo.enStock)} al stock: lo contado no baja de ahí.</p>}
        </div>
        {children}
      </div>
      {error && (
        <Aviso tono="error" chico>
          {error}
        </Aviso>
      )}

      {observaciones}
    </section>
  );
}

/**
 * Cómo va todo el envío (los totales que ruedan de ADR-0575; desde el 2026-11-02, también lo que decían los pasos de arriba): lo contado contra lo que
 * dijeron, cuántos modelos van, el tubo que se llena —verde lo identificado, tinta lo contado que falta identificar— y si cuadra. Lo identificado solo
 * se nombra si falta algo: contando por modelo es lo mismo que lo contado, salvo un número suelto. Sin aviso no hay «de N»: no hay con qué comparar.
 */
function CifrasDelEnvio({ dijeron, contadas, identificadas, modelosContados, modelos }: { dijeron: number | null; contadas: number; identificadas: number; modelosContados: number; modelos: number }) {
  const v = veredictoDeLaBalanza(dijeron, contadas);
  const base = Math.max(1, dijeron ?? 0, contadas);
  const buenas = Math.min(identificadas, contadas);
  const sueltas = Math.max(0, contadas - identificadas);
  return (
    <div className="rc-cierre-avance" aria-live="polite">
      <div className="rc-cierre-cifras">
        <span className="rc-cierre-cifra">
          <span className="label-cayla text-[11px] text-taupe">Contadas</span> <Odometro valor={contadas} />
          {dijeron != null && <span className="rc-cierre-de">de {conMiles(dijeron)}</span>}
        </span>
        {modelos > 0 && (
          <span className="rc-cierre-cifra">
            <span className="label-cayla text-[11px] text-taupe">Modelos</span> <Odometro valor={modelosContados} />
            <span className="rc-cierre-de">de {conMiles(modelos)}</span>
          </span>
        )}
        {sueltas > 0 && <Chip tono="ambar">{conMiles(sueltas)} sin identificar</Chip>}
        <span className="rc-cierre-veredicto">
          <Chip tono={v.estado}>{v.texto}</Chip>
        </span>
      </div>
      <BarraApilada
        decorativa
        viva
        sinEntrada
        alto={8}
        total={base}
        segmentos={[
          { clave: "identificadas", nombre: "Identificadas", valor: buenas, clase: "bg-verde" },
          { clave: "contadas", nombre: "Contadas sin identificar", valor: sueltas, clase: "bg-tinta" },
        ]}
      />
    </div>
  );
}
