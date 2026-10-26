"use client";

import { useEffect, useState } from "react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { EtiquetaAhora, MarcaCampo } from "@/components/alta-producto/guia";
import { Balanza, BaldosaCategoria } from "./piezas";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda, type DestinoHoja } from "@/components/recepcion-envio/HojaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { leerObservacionesDelEnvio } from "@/lib/recepcion-conteo-acciones";
import { deLaLinea, type ObservacionDeEnvio } from "@/lib/observaciones-envio-reglas";
import type { CatalogoParaRecibir, DetalleEnvio, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  camposDelConteo,
  contadasDe,
  diferenciaDe,
  idCampoConteo,
  ID_CAMPO_AGREGAR,
  leerContadas,
  lineasALaVista,
  ponerTallas,
  prendaCreadaDeNueva,
  textoPrendas,
  totalSeparado,
  veredictoDe,
  type ClaveLinea,
  type ConteosDelEnvio,
  type LineaParaContar,
  type PrendaSeparada,
  SIN_MARCA,
  marcaDeLinea,
} from "@/lib/recepcion-conteo-reglas";
import { AgregarFueraDeGuia } from "./AgregarFueraDeGuia";
import { ObservacionesDeLinea } from "./ObservacionesDeLinea";
import { HojaTallas } from "./HojaTallas";
import type { Borrador, EstadoGuardado } from "./RecibirContando";
import { SepararPrendas } from "./SepararPrendas";

// Contar (ADR-0393, el paso 2 de la cara A): a la izquierda las categorías del envío —las de la guía con lo que dijeron y lo que no estaba
// en ella—; a la derecha, UNA a la vez: cuántas llegaron (el número es lo esencial) y, si se quiere, qué prendas son. Cada cambio se guarda
// solo. La guía de foco enciende la próxima categoría sin contar.

type Hoja =
  | { tipo: "tallas"; clave: ClaveLinea; original: PrendaSeparada; prenda: PrendaRecepcion }
  | { tipo: "prenda"; clave: ClaveLinea; original: PrendaSeparada; modo: "nueva" | "agregar"; prenda: PrendaRecepcion | null }
  // «Crear ahora» de una nueva ya descrita: la hoja de la prenda, sin una prenda de partida (la descripción es el nombre que se ofrece).
  | { tipo: "crear"; clave: ClaveLinea; nueva: { cantidad: number; descripcion: string } }
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
  const iniciales = lineasALaVista(lineas, agregados, null);
  const primeraSinContar = iniciales.find((l) => l.linea && !l.conteo)?.clave ?? null;
  const [foco, setFoco] = useState<ClaveLinea | null>(primeraSinContar ?? iniciales[0]?.clave ?? null);
  const visibles = lineasALaVista(lineas, agregados, foco);
  const guia = useGuiaCampos(camposDelConteo(visibles), { enModal: false });
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
  const linea = visibles.find((l) => l.clave === foco) ?? visibles[0] ?? null;
  const i = linea ? visibles.indexOf(linea) : -1;
  const siguiente = i >= 0 ? (visibles[i + 1] ?? null) : null;
  const anterior = i > 0 ? visibles[i - 1] : null;
  const yaUsadas = new Set(visibles.map((l) => `${l.categoria?.id}|${l.marca?.id ?? SIN_MARCA}`));
  const proveedores = conteos?.proveedores ?? [];

  function elegir(l: LineaParaContar) {
    setFoco(l.clave);
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

  async function abrirTallas(l: LineaParaContar, p: PrendaSeparada) {
    setErrorHoja(null);
    const completa = await prendaCompleta(p, l);
    if (!completa) {
      setErrorHoja(`No se pudieron leer las tallas y colores de ${p.nombre ?? "esa prenda"}. Recarga la pantalla y vuelve a intentar.`);
      return;
    }
    setHoja({ tipo: "tallas", clave: l.clave, original: p, prenda: completa });
  }

  /**
   * La prenda de «Crear ahora» ya existe (recién creada, o «Usar esa prenda»): esas nuevas dejan de estar «por crear» y pasan a ser la prenda,
   * sin tallas todavía, y se sigue en su hoja de tallas. Se guarda ya: si la hoja de tallas se deja para después, la fila queda con
   * «Tallas y colores ahora».
   */
  function prendaDeLaNueva(l: LineaParaContar, descripcion: string, prenda: PrendaRecepcion) {
    onPrendaVista(prenda);
    const separado = prendaCreadaDeNueva(l.conteo?.separado ?? { prendas: [], nuevas: [] }, descripcion, prenda);
    onEscribir(l, { separado });
    const original = separado.prendas.find((p) => p.productoId === prenda.productoId);
    setHoja(original ? { tipo: "tallas", clave: l.clave, original, prenda } : null);
  }

  const lineaDeHoja = hoja && hoja.tipo !== "agregar" ? (visibles.find((l) => l.clave === hoja.clave) ?? null) : null;
  const categoriaDeHoja = lineaDeHoja?.categoria ? (catalogo?.categorias.find((c) => c.id === lineaDeHoja.categoria?.id) ?? null) : null;

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

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-4">
          <div data-guia="recepcion.quien-cuenta" className="space-y-1.5 px-1">
            <p className="label-cayla text-[11px] text-taupe">Quién cuenta</p>
            <ComboResponsable control={responsable} compacto />
            <p className="text-xs text-taupe">Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.</p>
          </div>
          {proveedorPorConfirmar && (
            <p className="nota-cayla text-[13px]">
              <b className="text-tinta">Proveedor por confirmar.</b> Cuenta igual: al cerrar eliges de quién llegó (pregúntale a Compras).
            </p>
          )}

          <nav aria-label="Categorías del envío" className="space-y-1.5" data-guia="recepcion.categorias">
            <p className="label-cayla px-1 text-[11px] text-taupe">{sinAviso ? "Lo que llegó" : "Categorías del envío"}</p>
            {visibles.map((l) => {
              const contada = l.linea ? l.conteo !== null : contadasDe(l) > 0;
              const estado = contada ? "hecho" : linea?.clave === l.clave ? "ahora" : "falta";
              const dif = diferenciaDe(l);
              // Separadas: las que ya se sabe qué prenda son (con o sin tallas) más las que ya entraron; sin separar: el resto de lo contado.
              // Dice lo mismo que la insignia de «¿Qué … son?» («35 sin separar»): «para después» queda para el riel, que cuenta en
              // prendas todo lo que no entra al stock (también lo separado sin tallas y lo nuevo).
              const sep = l.conteo ? totalSeparado(l.conteo.separado) + (l.conteo.enStock ?? 0) : 0;
              const sinSep = l.conteo ? Math.max(0, contadasDe(l) - sep) : 0;
              const sub = !l.conteo
                ? [l.categoria ? marcaDeLinea(l).nombre : null, l.dijeron != null ? `dijeron ${l.dijeron}` : null, !l.linea && !sinAviso ? "no venía" : null].filter(Boolean).join(" · ")
                : contadasDe(l) === 0
                  ? "no llegó nada"
                  : sinSep === 0
                    ? "todas separadas"
                    : [sep > 0 ? `${sep} ${sep === 1 ? "separada" : "separadas"}` : null, `${sinSep} sin separar`].filter(Boolean).join(" · ");
              return (
                <button
                  key={l.clave}
                  type="button"
                  data-campo={l.linea ? idCampoConteo(l.clave) : undefined}
                  aria-current={linea?.clave === l.clave ? "true" : undefined}
                  onClick={() => elegir(l)}
                  className="rc-cat-item"
                >
                  <span className="rc-cat-marca">
                    <MarcaCampo estado={estado} />
                  </span>
                  <BaldosaCategoria categoria={l.categoria} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-tinta">{l.categoria?.nombre ?? "Categoría"}</b>
                    <small className="block text-xs leading-snug text-taupe">{sub}</small>
                    {dif != null && dif !== 0 && l.conteo && (
                      <span className="mt-1 inline-block">
                        <Chip tono="ambar">{dif > 0 ? `+${dif}` : dif}</Chip>
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-right tabular-nums">
                    <b className="text-lg text-tinta">{l.conteo ? contadasDe(l) : 0}</b>
                    {l.dijeron != null && <span className="text-xs text-taupe">/{l.dijeron}</span>}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="rc-cat-agregar"
              onClick={() => setHoja({ tipo: "agregar" })}
              data-guia="recepcion.agregar"
              data-campo={visibles.length === 0 ? ID_CAMPO_AGREGAR : undefined}
            >
              <Plus aria-hidden className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap text-[14.5px]">{sinAviso ? "Agregar lo que llegó" : "Agregar categoría"}</span>
              {!sinAviso && <span className="whitespace-nowrap text-xs text-taupe">· no venía en el envío</span>}
            </button>
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="rc-contador space-y-4 p-4 sm:p-6" aria-label="Contar">
            {!linea ? (
              <div className="space-y-2 py-6 text-center">
                <TituloSeccion>¿Qué llegó?</TituloSeccion>
                <p className="text-sm text-taupe">Agrega la primera categoría a la izquierda y cuéntala. Una a la vez; después agregas las demás.</p>
              </div>
            ) : (
              <ContadorDeLinea
                key={linea.clave}
                linea={linea}
                sinAviso={sinAviso}
                guardado={guardados[linea.clave] ?? null}
                error={errores[linea.clave] ?? null}
                onEscribir={(c) => onEscribir(linea, c)}
                observaciones={
                  <ObservacionesDeLinea
                    despachoId={detalle.id}
                    lineaId={linea.linea?.id ?? null}
                    nombre={linea.categoria ? linea.categoria.nombre.toLowerCase() : "prendas"}
                    observaciones={deLaLinea(observaciones, linea.linea?.id ?? null)}
                    responsable={responsable}
                    onAnotada={(o) => setObservaciones((todas) => [...todas, o])}
                  />
                }
              >
                {linea.categoria && (
                  <SepararPrendas
                    categoria={linea.categoria}
                    marca={marcaDeLinea(linea)}
                    separado={linea.conteo?.separado ?? { prendas: [], nuevas: [] }}
                    tope={Math.max(0, contadasDe(linea) - (linea.conteo?.enStock ?? 0))}
                    onSeparado={(s) => onEscribir(linea, { separado: s, contadas: Math.max(contadasDe(linea), (linea.conteo?.enStock ?? 0) + totalSeparado(s)) })}
                    onTallas={(p) => void abrirTallas(linea, p)}
                    onPrendaVista={onPrendaVista}
                    onCrearNueva={(nueva) => setHoja({ tipo: "crear", clave: linea.clave, nueva })}
                  />
                )}
                {errorHoja && (
                  <Aviso tono="error" chico>
                    {errorHoja}
                  </Aviso>
                )}
              </ContadorDeLinea>
            )}

            <div className="space-y-3 border-t border-sand pt-4">
              <PieGuia guia={guia} listo="Todas las categorías tienen su número." />
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
                      Listo, sigue {siguiente.categoria?.nombre ?? "la siguiente"}
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </span>
                  </Boton>
                ) : (
                  <Boton type="button" peso="primario" onClick={onCerrar} disabled={visibles.length === 0} data-guia="recepcion.pasar-a-cerrar">
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

      {hoja?.tipo === "tallas" && lineaDeHoja?.categoria && (
        <HojaTallas
          key={hoja.prenda.productoId}
          prenda={hoja.prenda}
          categoria={lineaDeHoja.categoria}
          marca={marcaDeLinea(lineaDeHoja)}
          colores={catalogo?.colores ?? []}
          variantes={hoja.original.productoId === hoja.prenda.productoId ? hoja.original.variantes : null}
          sugeridas={hoja.original.cantidad}
          textoListo="Listo"
          onListo={(prenda, variantes) => {
            const s = lineaDeHoja.conteo?.separado ?? { prendas: [], nuevas: [] };
            onEscribir(lineaDeHoja, { separado: ponerTallas(s, hoja.original.productoId, prenda, variantes) });
            setHoja(null);
          }}
          onAbrirHoja={(modo, prenda) => setHoja({ tipo: "prenda", clave: hoja.clave, original: hoja.original, modo, prenda })}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "crear" && lineaDeHoja?.categoria && (
        <HojaPrenda
          // Lo que se describió al contar se ofrece como nombre, igual que con «Crear ahora» de «Para después».
          destino={{ ...destinoDe(detalle, lineaDeHoja, "nueva", null, proveedores.length), descripcionOrden: hoja.nueva.descripcion || (lineaDeHoja.linea?.descripcion ?? null) }}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          responsable={responsable}
          onListo={(prenda) => prendaDeLaNueva(lineaDeHoja, hoja.nueva.descripcion, prenda)}
          onUsarExistente={async (productoId, nombre) => {
            if (!lineaDeHoja.categoria) return false;
            const { prendas: halladas } = await buscarPrendasParaRecibir(lineaDeHoja.categoria.id, marcaDeLinea(lineaDeHoja).id, nombre);
            const hallada = halladas.find((x) => x.productoId === productoId);
            if (!hallada) return false;
            prendaDeLaNueva(lineaDeHoja, hoja.nueva.descripcion, hallada);
            return true;
          }}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "prenda" && lineaDeHoja?.categoria && (
        <HojaPrenda
          destino={destinoDe(detalle, lineaDeHoja, hoja.modo, hoja.prenda, proveedores.length)}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          responsable={responsable}
          onListo={(prenda) => {
            onPrendaVista(prenda);
            setHoja({ tipo: "tallas", clave: hoja.clave, original: hoja.original, prenda });
          }}
          onUsarExistente={async (productoId, nombre) => {
            if (!lineaDeHoja.categoria) return false;
            const { prendas: halladas } = await buscarPrendasParaRecibir(lineaDeHoja.categoria.id, marcaDeLinea(lineaDeHoja).id, nombre);
            const hallada = halladas.find((x) => x.productoId === productoId);
            if (!hallada) return false;
            onPrendaVista(hallada);
            setHoja({ tipo: "tallas", clave: hoja.clave, original: hoja.original, prenda: hallada });
            return true;
          }}
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
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
function ContadorDeLinea({
  linea,
  sinAviso,
  guardado,
  error,
  onEscribir,
  observaciones,
  children,
}: {
  linea: LineaParaContar;
  sinAviso: boolean;
  guardado: EstadoGuardado | null;
  error: string | null;
  onEscribir: (c: Partial<Borrador>) => void;
  /** Las observaciones de la categoría (ADR-0507): entre el número y lo que se separa. */
  observaciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  const contadas = contadasDe(linea);
  // Mientras se escribe, la caja muestra lo escrito; fuera de ella, siempre lo contado (que también cambia al separar más de lo contado,
  // o cuando otra persona guardó la misma línea).
  const [escribiendo, setEscribiendo] = useState<string | null>(null);
  const texto = escribiendo ?? (linea.conteo ? String(contadas) : "");
  const minimo = (linea.conteo?.enStock ?? 0) + totalSeparado(linea.conteo?.separado ?? { prendas: [], nuevas: [] });
  const v = veredictoDe(linea);
  const poner = (n: number) => {
    setEscribiendo(null);
    onEscribir({ contadas: Math.max(minimo, Math.max(0, n)) });
  };
  const fraccion = linea.dijeron ? Math.min(1, contadas / linea.dijeron) : contadas > 0 ? 1 : 0;

  const llevaCuenta = guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "Guardado" : linea.conteo?.contadoPor?.nombre ? `Contó ${linea.conteo.contadoPor.nombre}` : null; // unificar-fijo: el estado de la línea mientras se guarda sola, no un botón (como la planilla de Contar)
  const nombre = linea.categoria ? linea.categoria.nombre.toLowerCase() : "prendas";

  return (
    <div className="space-y-4">
      {/* En el celular, «Contó …» baja bajo el nombre: a la derecha apretaba la categoría a una columna de 11 letras. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <BaldosaCategoria categoria={linea.categoria} />
        <div className="min-w-0 flex-1 basis-48">
          <TituloSeccion dato={!linea.conteo ? <EtiquetaAhora /> : undefined}>{linea.categoria?.nombre ?? "Categoría"}</TituloSeccion>
          <p className="text-sm text-taupe">
            {[linea.categoria ? marcaDeLinea(linea).nombre : null, linea.proveedor?.nombre, linea.linea?.descripcion].filter(Boolean).join(" · ")}
            {linea.dijeron != null && (
              <>
                {" "}· Dijeron <b className="text-tinta">{linea.dijeron}</b>
              </>
            )}
            {!linea.linea && !sinAviso && (
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

      <p className="max-w-[600px] text-[14.5px] text-taupe">
        Cuenta cuántas llegaron de {nombre} y escribe el número.
        {linea.dijeron != null && " Si no coincide con lo que dijeron, no pasa nada: al cerrar dirás por qué."}
      </p>

      <div className="space-y-3" data-guia="recepcion.numero">
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
              if (n !== null && n >= minimo) onEscribir({ contadas: n });
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
          {linea.dijeron != null && linea.dijeron >= minimo && (
            <button type="button" onClick={() => poner(linea.dijeron ?? 0)}>
              Llegaron las {linea.dijeron}
            </button>
          )}
          {!linea.conteo && linea.linea ? (
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
        <div className="flex flex-col items-center gap-2">
          {/* El color lo pone el veredicto de la línea (coincide o no con lo que dijeron), no el avance. */}
          <BarraAvance pct={fraccion * 100} alto="gruesa" tono={v.tono === "verde" ? "verde" : v.tono === "ambar" ? "ambar" : "tinta"} decorativa className="max-w-[520px]" />
          <Chip tono={v.tono === "neutro" ? "neutro" : v.tono}>{v.texto}</Chip>
          {(linea.conteo?.enStock ?? 0) > 0 && (
            <p className="text-xs text-taupe">Ya entraron {textoPrendas(linea.conteo?.enStock ?? 0)} al stock: lo contado no baja de ahí.</p>
          )}
        </div>
        {error && (
          <Aviso tono="error" chico>
            {error}
          </Aviso>
        )}
      </div>

      {observaciones}

      {children}
    </div>
  );
}
