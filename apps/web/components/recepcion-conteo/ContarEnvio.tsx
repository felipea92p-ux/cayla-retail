"use client";

import { useEffect, useState } from "react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { ArrowLeft, ArrowRight, Info, Minus, Plus } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { EtiquetaAhora, MarcaCampo } from "@/components/alta-producto/guia";
import { Balanza, BaldosaCategoria } from "./piezas";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda, type DestinoHoja } from "@/components/recepcion-envio/HojaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { leerObservacionesDelEnvio } from "@/lib/recepcion-conteo-acciones";
import { deLasLineas, type ObservacionDeEnvio } from "@/lib/observaciones-envio-reglas";
import type { CatalogoParaRecibir, DetalleEnvio, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  contadasDe,
  idCampoConteo,
  ID_CAMPO_AGREGAR,
  leerContadas,
  lineasALaVista,
  ponerTallas,
  prendaCreadaDeNueva,
  separarAnotada,
  textoPrendas,
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
  anotadasPorSepararDelGrupo,
  avisoDePrendasAgregadas,
  camposDelConteoPorGrupo,
  descripcionDelGrupo,
  gruposSinIdentificar,
  idCampoIdentificar,
  lineaDeLaPrenda,
  minimoDelGrupo,
  repartirSeparado,
  repartirTotal,
  sinIdentificarDelGrupo,
  veredictoDelGrupo,
  type AnotadaDelGrupo,
  type GrupoDeLineas,
  type Reparto,
} from "@/lib/recepcion-grupos-reglas";
import { AgregarFueraDeGuia } from "./AgregarFueraDeGuia";
import { ObservacionesDeLinea } from "./ObservacionesDeLinea";
import { HojaTallas } from "./HojaTallas";
import type { Borrador, EstadoGuardado } from "./RecibirContando";
import { SepararPrendas } from "./SepararPrendas";

// Contar (ADR-0393, el paso 2 de la cara A): a la izquierda las categorías del envío —las de la guía con lo que dijeron y lo que no estaba
// en ella—; a la derecha, UNA a la vez: cuántas llegaron (el número es lo esencial) y, si se quiere, qué prendas son. Cada cambio se guarda
// solo. La guía de foco enciende la próxima categoría sin contar.
//
// Una categoría es UNA cosa para quien cuenta (ADR-0393, actualización 2026-10-26): si la compra anotó dos vestidos distintos, la lista
// trae una sola «Vestidos» con su número, y las prendas anotadas se despliegan dentro. Por dentro la base sigue guardando una fila por línea
// de la compra: `lib/recepcion-grupos-reglas.ts` reparte lo que se escribe entre ellas (solo lo separado tiene cantidad exacta por prenda).

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
  const iniciales = agruparLineas(lineasALaVista(lineas, agregados, null));
  const primeraSinContar = iniciales.find((g) => g.principal.linea && !g.contado)?.clave ?? null;
  // Se cuenta UNA categoría a la vez: `foco` es la llave de su grupo (para lo de fuera de la guía, la de su única línea).
  const [foco, setFoco] = useState<string | null>(primeraSinContar ?? iniciales[0]?.clave ?? null);
  const visibles = lineasALaVista(lineas, agregados, foco?.startsWith("extra:") ? (foco as ClaveLinea) : null);
  const grupos = agruparLineas(visibles);
  const guiaBase = useGuiaCampos(camposDelConteoPorGrupo(grupos), { enModal: false });
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
  const grupo = grupos.find((g) => g.clave === foco) ?? grupos[0] ?? null;
  // «Falta: identificar las prendas de Faldas» desde otra categoría: primero se abre esa categoría y recién después se lleva a su «¿Qué … son?»
  // (que solo existe para la que se está contando).
  const guia: GuiaCampos = {
    ...guiaBase,
    ir: (id) => {
      const deOtra = grupos.find((g) => idCampoIdentificar(g.clave) === id && g.clave !== grupo?.clave);
      if (!deOtra) return guiaBase.ir(id);
      setFoco(deOtra.clave);
      requestAnimationFrame(() => requestAnimationFrame(() => guiaBase.ir(id)));
    },
  };
  const faltanIdentificar = gruposSinIdentificar(grupos);
  const i = grupo ? grupos.indexOf(grupo) : -1;
  const siguiente = i >= 0 ? (grupos[i + 1] ?? null) : null;
  const anterior = i > 0 ? grupos[i - 1] : null;
  const yaUsadas = new Set(visibles.map((l) => `${l.categoria?.id}|${l.marca?.id ?? SIN_MARCA}`));
  const proveedores = conteos?.proveedores ?? [];

  function elegir(g: GrupoDeLineas) {
    setFoco(g.clave);
  }

  /** Guarda lo que cambió en cada línea de la categoría (cada una se guarda sola, con su propio aviso). */
  function aplicar(r: Reparto) {
    for (const c of r.cambios) onEscribir(c.linea, { contadas: c.contadas, separado: c.separado });
  }

  /** La persona escribió cuántas llegaron de la categoría: se reparte entre sus líneas cambiando lo mínimo. */
  function escribirTotal(g: GrupoDeLineas, n: number) {
    aplicar(repartirTotal(g, n));
  }

  /** Lo separado de una categoría, con lo contado que sube si se separó más (lo mismo para «¿Qué … son?» y para el «+» de la lista). */
  function escribirSeparado(g: GrupoDeLineas, s: Separado) {
    aplicar(repartirSeparado(g, s, g.contadas));
  }

  /**
   * La prenda anotada al comprar que se toca en «¿Qué … son?»: pasa a esa lista con las que se esperaban (Felipe 2026-10-26), como si se hubiera elegido
   * desde el buscador. Si con eso se separa más de lo que ya se había contado, lo contado sube y la pantalla lo dice con el nombre de la
   * prenda y cuántas se agregaron (Felipe 2026-10-27). Con la categoría en 0 no avisa: no había número de nadie que pisar y el número
   * grande se ve pasar de 0 a lo separado.
   */
  function separarAnotadaDe(g: GrupoDeLineas, a: AnotadaDelGrupo) {
    setFoco(g.clave);
    const r = repartirSeparado(g, separarAnotada(g.separado, a.prenda, a.prenda.cantidad), g.contadas);
    aplicar(r);
    const texto = avisoDePrendasAgregadas(a.prenda.nombre, g.contadas, r.contadas);
    if (texto) avisar.aviso(texto);
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

  return (
    <div className="space-y-5">
      {reabierto && (
        <Aviso tono="info" titulo="Reabriste el envío">
          Corrige lo que haga falta y vuelve a cerrarlo. Lo que ya entró al stock no se vuelve a contar ni se toca.
        </Aviso>
      )}

      <div className="space-y-4">
        {/* La barra de arriba (rediseño de «Contar», opción A, Felipe 2026-10-28): las categorías del envío son píldoras en una fila y «Quién cuenta»
            queda a la derecha. Antes eran un riel lateral y un bloque con texto que dejaban dos columnas cortas al lado del contador. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <nav aria-label="Categorías del envío" className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-guia="recepcion.categorias">
            <p className="label-cayla pr-1 text-[11px] text-taupe">{sinAviso ? "Lo que llegó" : "Categorías del envío"}</p>
            {grupos.map((g) => {
              const p = g.principal;
              const hayConteo = g.lineas.some((l) => l.conteo !== null);
              const contada = p.linea ? g.contado : g.contadas > 0;
              const sinIdent = sinIdentificarDelGrupo(g);
              // Hecha solo con su número Y sus prendas identificadas (Felipe 2026-10-27): contada sin identificar sigue «por hacer».
              const estado = contada && sinIdent === 0 ? "hecho" : grupo?.clave === g.clave ? "ahora" : "falta";
              const dif = g.dijeron != null ? g.contadas - g.dijeron : null;
              // Identificadas: las que ya se sabe qué prenda son (con o sin tallas) más las que ya entraron; el resto de lo contado falta
              // identificar. Dice lo mismo que la insignia de «¿Qué … son?» («Faltan 35 por identificar»): «para después» queda para el
              // riel, que cuenta en prendas todo lo que no entra al stock (también lo identificado sin tallas y lo nuevo).
              const ident = hayConteo ? g.contadas - sinIdent : 0;
              const sub = !hayConteo
                ? [p.categoria ? marcaDeLinea(p).nombre : null, g.dijeron != null ? `dijeron ${g.dijeron}` : null, !p.linea && !sinAviso ? "no venía" : null].filter(Boolean).join(" · ")
                : g.contadas === 0
                  ? "no llegó nada"
                  : sinIdent === 0
                    ? "todas identificadas"
                    : [ident > 0 ? `${ident} ${ident === 1 ? "identificada" : "identificadas"}` : null, `${sinIdent} por identificar`].filter(Boolean).join(" · ");
              const nombreCategoria = p.categoria?.nombre ?? "Categoría";
              return (
                <button
                  key={g.clave}
                  type="button"
                  data-campo={p.linea ? idCampoConteo(p.clave) : undefined}
                  aria-current={grupo?.clave === g.clave ? "true" : undefined}
                  onClick={() => elegir(g)}
                  title={sub}
                  className="rc-cat-pildora"
                >
                  <BaldosaCategoria categoria={p.categoria} tamano="chico" />
                  <b className="max-w-[11rem] truncate text-sm text-tinta">{nombreCategoria}</b>
                  <span className="whitespace-nowrap tabular-nums">
                    <b className="text-base text-tinta">{g.contadas}</b>
                    {g.dijeron != null && <span className="text-xs text-taupe">/{g.dijeron}</span>}
                  </span>
                  {dif != null && dif !== 0 && hayConteo && <Chip tono="ambar">{dif > 0 ? `+${dif}` : dif}</Chip>}
                  <MarcaCampo estado={estado} />
                  <span className="sr-only">{sub}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="rc-cat-agregar"
              onClick={() => setHoja({ tipo: "agregar" })}
              data-guia="recepcion.agregar"
              data-campo={visibles.length === 0 ? ID_CAMPO_AGREGAR : undefined}
              title={sinAviso ? undefined : "Una categoría que no venía en el envío"}
            >
              <Plus aria-hidden className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap text-[14.5px]">{sinAviso ? "Agregar lo que llegó" : "Agregar categoría"}</span>
            </button>
          </nav>
          <div data-guia="recepcion.quien-cuenta" className="flex items-center gap-2.5">
            <p className="label-cayla text-[11px] text-taupe">Quién cuenta</p>
            <ComboResponsable control={responsable} compacto className="min-w-0" />
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
        </div>
        {verAyuda && (
          <p id="rc-ayuda-quien" className="nota-cayla text-[13px]">
            Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.
          </p>
        )}
        {proveedorPorConfirmar && (
          <p className="nota-cayla text-[13px]">
            <b className="text-tinta">Proveedor por confirmar.</b> Cuenta igual: al cerrar eliges de quién llegó (pregúntale a Compras).
          </p>
        )}

        <div className="min-w-0 space-y-4">
          <section className="space-y-4" aria-label="Contar">
            {!grupo ? (
              <div className="rc-contador space-y-2 p-6 py-10 text-center">
                <TituloSeccion>¿Qué llegó?</TituloSeccion>
                <p className="text-sm text-taupe">Agrega la primera categoría a la izquierda y cuéntala. Una a la vez; después agregas las demás.</p>
              </div>
            ) : (
              <ContadorDeGrupo
                key={grupo.clave}
                grupo={grupo}
                sinAviso={sinAviso}
                guardado={estadoDelGrupo(grupo, guardados)}
                error={grupo.lineas.map((l) => errores[l.clave]).find(Boolean) ?? null}
                onTotal={(n) => escribirTotal(grupo, n)}
                observaciones={
                  <ObservacionesDeLinea
                    despachoId={detalle.id}
                    lineaId={grupo.principal.linea?.id ?? null}
                    nombre={grupo.principal.categoria ? grupo.principal.categoria.nombre.toLowerCase() : "prendas"}
                    observaciones={deLasLineas(observaciones, grupo.lineas.map((l) => l.linea?.id ?? null))}
                    responsable={responsable}
                    onAnotada={(o) => setObservaciones((todas) => [...todas, o])}
                  />
                }
              >
                {grupo.principal.categoria && (
                  <SepararPrendas
                    categoria={grupo.principal.categoria}
                    marca={marcaDeLinea(grupo.principal)}
                    separado={grupo.separado}
                    idCampo={idCampoIdentificar(grupo.clave)}
                    tope={Math.max(0, grupo.contadas - grupo.enStock)}
                    onSeparado={(s) => escribirSeparado(grupo, s)}
                    onTallas={(p) => void abrirTallas(grupo, p)}
                    onPrendaVista={onPrendaVista}
                    onCrearNueva={(nueva) => setHoja({ tipo: "crear", grupo: grupo.clave, nueva })}
                    sinLinea
                    anotadas={anotadasPorSepararDelGrupo(grupo)}
                    onAnotada={(a) => separarAnotadaDe(grupo, a)}
                  />
                )}
                {errorHoja && (
                  <Aviso tono="error" chico>
                    {errorHoja}
                  </Aviso>
                )}
              </ContadorDeGrupo>
            )}

            <div className="space-y-3">
              <PieGuia guia={guia} listo="Todas las categorías tienen su número y sus prendas identificadas." />
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <Boton type="button" peso="discreto" disabled={!anterior} onClick={() => anterior && elegir(anterior)}>
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowLeft aria-hidden className="h-4 w-4" />
                    Anterior
                  </span>
                </Boton>
                {/* Con todas las categorías contadas (o al reabrir), lo que sigue es cerrar, esté donde esté la persona en la lista. */}
                {siguiente && !guia.puedeConfirmar ? (
                  <Boton type="button" peso="primario" onClick={() => elegir(siguiente)}>
                    <span className="inline-flex items-center gap-1.5">
                      Listo, sigue {siguiente.principal.categoria?.nombre ?? "la siguiente"}
                      <ArrowRight aria-hidden className="h-4 w-4" />
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
            </div>
          </section>

          <Balanza dijeron={totalDijeron} contadas={totalContadas} guia="recepcion.cifra" />
        </div>
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
              setFoco(clave);
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

/** El número de una categoría: − [40] + , con +5, +10 y «Llegaron las 40». */
function ContadorDeGrupo({
  grupo,
  sinAviso,
  guardado,
  error,
  onTotal,
  observaciones,
  children,
}: {
  grupo: GrupoDeLineas;
  sinAviso: boolean;
  guardado: EstadoGuardado | null;
  error: string | null;
  /** La persona dejó este total para la categoría: la pantalla lo reparte entre sus líneas. */
  onTotal: (n: number) => void;
  /** Las observaciones de la categoría (ADR-0507): entre el número y lo que se separa. */
  observaciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  const p = grupo.principal;
  const hayConteo = grupo.lineas.some((l) => l.conteo !== null);
  const contadas = grupo.contadas;
  // Mientras se escribe, la caja muestra lo escrito; fuera de ella, siempre lo contado (que también cambia al separar más de lo contado,
  // o cuando otra persona guardó la misma línea).
  const [escribiendo, setEscribiendo] = useState<string | null>(null);
  const texto = escribiendo ?? (hayConteo ? String(contadas) : "");
  const minimo = minimoDelGrupo(grupo);
  const v = veredictoDelGrupo(grupo);
  const poner = (n: number) => {
    setEscribiendo(null);
    onTotal(Math.max(minimo, Math.max(0, n)));
  };
  const fraccion = grupo.dijeron ? Math.min(1, contadas / grupo.dijeron) : contadas > 0 ? 1 : 0;

  const contoNombre = grupo.lineas
    .map((l) => l.conteo)
    .filter((c): c is NonNullable<typeof c> => c !== null && !!c.contadoPor?.nombre)
    .sort((a, b) => (b.contadoEn ?? "").localeCompare(a.contadoEn ?? ""))[0]?.contadoPor?.nombre;
  const llevaCuenta = guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "Guardado" : contoNombre ? `Contó ${contoNombre}` : null; // unificar-fijo: el estado de la categoría mientras se guarda sola, no un botón (como la planilla de Contar)
  const nombre = p.categoria ? p.categoria.nombre.toLowerCase() : "prendas";
  const descripcion = descripcionDelGrupo(grupo);

  return (
    <>
      <section className="rc-contador space-y-4 p-4 sm:p-6" aria-label="Cuántas llegaron">
        {/* En el celular, «Contó …» baja bajo el nombre: a la derecha apretaba la categoría a una columna de 11 letras. */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <BaldosaCategoria categoria={p.categoria} />
          <div className="min-w-0 flex-1 basis-48">
            <TituloSeccion dato={!hayConteo ? <EtiquetaAhora /> : undefined}>{p.categoria?.nombre ?? "Categoría"}</TituloSeccion>
            <p className="text-sm text-taupe">
              {[p.categoria ? marcaDeLinea(p).nombre : null, p.proveedor?.nombre, descripcion].filter(Boolean).join(" · ")}
              {grupo.dijeron != null && (
                <>
                  {" "}· Dijeron <b className="text-tinta">{grupo.dijeron}</b>
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
            <p className="w-full pl-13 text-xs text-taupe sm:w-auto sm:pl-0" aria-live="polite">
              {llevaCuenta}
            </p>
          )}
        </div>

        {/* La franja (opción A, Felipe 2026-10-28): el número con su − y +, los atajos y la barra de «cuadra» en UNA fila cuando hay ancho
            (la tarjeta decide, no la ventana: junto al papel la columna es angosta); si no, la barra baja debajo. */}
        <div className="rc-franja" data-guia="recepcion.numero">
          <div className="rc-numero">
            <button type="button" onClick={() => poner(contadas - 1)} disabled={contadas <= minimo} aria-label="Una menos" className="rc-paso-btn">
              <Minus aria-hidden className="h-5 w-5" />
            </button>
            <input // unificar-fijo: el número protagonista de la maqueta A (Felipe 2026-10-13), sin caja: se lee como una cifra
              type="text"
              inputMode="numeric"
              value={texto}
              placeholder="0"
              aria-label={`Cuántas ${nombre} llegaron`}
              onChange={(e) => {
                // Solo dígitos: lo que se ve es lo que se guarda. Vacío es «todavía escribiendo», no 0.
                const { texto: limpio, contadas: n } = leerContadas(e.target.value);
                setEscribiendo(limpio);
                if (n !== null && n >= minimo) onTotal(n);
              }}
              onBlur={() => setEscribiendo(null)}
              onFocus={(e) => {
                setEscribiendo(e.currentTarget.value);
                e.currentTarget.select();
              }}
            />
            <button type="button" onClick={() => poner(contadas + 1)} aria-label="Una más" className="rc-paso-btn">
              <Plus aria-hidden className="h-5 w-5" />
            </button>
          </div>
          <div className="rc-rapidos">
            <button type="button" onClick={() => poner(contadas + 5)}>
              +5
            </button>
            <button type="button" onClick={() => poner(contadas + 10)}>
              +10
            </button>
            {grupo.dijeron != null && grupo.dijeron >= minimo && (
              <button type="button" onClick={() => poner(grupo.dijeron ?? 0)}>
                Llegaron las {grupo.dijeron}
              </button>
            )}
            {!hayConteo && p.linea ? (
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
          <div className="rc-franja-cuadra">
            {/* El color lo pone el veredicto de la categoría (coincide o no con lo que dijeron), no el avance. */}
            <BarraAvance pct={fraccion * 100} alto="gruesa" tono={v.tono === "verde" ? "verde" : v.tono === "ambar" ? "ambar" : "tinta"} decorativa className="w-full" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Chip tono={v.tono === "neutro" ? "neutro" : v.tono}>{v.texto}</Chip>
              {grupo.dijeron != null && <span className="text-xs text-taupe">Si no coincide con lo que dijeron, no pasa nada: al cerrar dirás por qué.</span>}
            </div>
            {grupo.enStock > 0 && <p className="text-xs text-taupe">Ya entraron {textoPrendas(grupo.enStock)} al stock: lo contado no baja de ahí.</p>}
          </div>
        </div>
        {error && (
          <Aviso tono="error" chico>
            {error}
          </Aviso>
        )}

        {observaciones}
      </section>

      {/* «¿Qué … son?» va en su propia tarjeta, debajo y a la vista: contar y luego identificar, sin bajar la pantalla. */}
      {children && (
        <section className="card-cayla space-y-4 p-4 sm:p-6" aria-label="Qué prendas son">
          {children}
        </section>
      )}
    </>
  );
}
