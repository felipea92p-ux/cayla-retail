"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda, type DestinoHoja } from "@/components/recepcion-envio/HojaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
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
  textoPrendas,
  totalSeparado,
  veredictoDe,
  type ClaveLinea,
  type ConteosDelEnvio,
  type LineaParaContar,
  type PrendaSeparada,
} from "@/lib/recepcion-conteo-reglas";
import { AgregarFueraDeGuia } from "./AgregarFueraDeGuia";
import { HojaTallas } from "./HojaTallas";
import type { Borrador, EstadoGuardado } from "./RecibirContando";
import { SepararPrendas } from "./SepararPrendas";

// Contar (ADR-0393, el paso 2 de la cara A): a la izquierda las categorías del envío —las de la guía con lo que dijeron y lo que no estaba
// en ella—; a la derecha, UNA a la vez: cuántas llegaron (el número es lo esencial) y, si se quiere, qué prendas son. Cada cambio se guarda
// solo. La guía de foco enciende la próxima categoría sin contar.

type Hoja =
  | { tipo: "tallas"; clave: ClaveLinea; original: PrendaSeparada; prenda: PrendaRecepcion }
  | { tipo: "prenda"; clave: ClaveLinea; original: PrendaSeparada; modo: "nueva" | "agregar"; prenda: PrendaRecepcion | null }
  | { tipo: "agregar" }
  | null;

const ESTADO_MARCA = {
  hecho: "border-tinta bg-tinta text-crema",
  ahora: "border-2 border-rojo bg-papel",
  falta: "border-sand bg-papel",
} as const;

export function ContarEnvio({
  detalle,
  lineas,
  conteos,
  sinAviso,
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
  reabierto: boolean;
  catalogo: CatalogoParaRecibir | null;
  responsable: ControlResponsable;
  guardados: Readonly<Record<string, EstadoGuardado>>;
  errores: Readonly<Record<string, string>>;
  prendas: ReadonlyMap<string, PrendaRecepcion>;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onEscribir: (linea: LineaParaContar, cambio: Partial<Borrador>) => void;
  onAgregar: (nuevo: { proveedorId: string | null; categoriaId: string; marcaId: string }) => Promise<ClaveLinea | null>;
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
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const linea = visibles.find((l) => l.clave === foco) ?? visibles[0] ?? null;
  const i = linea ? visibles.indexOf(linea) : -1;
  const siguiente = i >= 0 ? (visibles[i + 1] ?? null) : null;
  const anterior = i > 0 ? visibles[i - 1] : null;
  const yaUsadas = new Set(visibles.map((l) => `${l.categoria?.id}|${l.marca?.id}`));
  const proveedores = conteos?.proveedores ?? [];

  function elegir(l: LineaParaContar) {
    setFoco(l.clave);
  }

  async function prendaCompleta(p: PrendaSeparada, l: LineaParaContar): Promise<PrendaRecepcion | null> {
    const ya = prendas.get(p.productoId);
    if (ya) return ya;
    if (!l.categoria || !l.marca) return null;
    const { prendas: halladas } = await buscarPrendasParaRecibir(l.categoria.id, l.marca.id, p.nombre ?? "");
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

  const lineaDeHoja = hoja && hoja.tipo !== "agregar" ? (visibles.find((l) => l.clave === hoja.clave) ?? null) : null;
  const categoriaDeHoja = lineaDeHoja?.categoria ? (catalogo?.categorias.find((c) => c.id === lineaDeHoja.categoria?.id) ?? null) : null;

  return (
    <div className="space-y-5">
      <div className="card-cayla flex flex-wrap items-end justify-between gap-3 p-4" data-guia="recepcion.quien-cuenta">
        <div className="min-w-0 flex-1 basis-64">
          <p className="mb-1.5 text-[13px] font-semibold text-tinta">Quién cuenta</p>
          <ComboResponsable control={responsable} compacto />
        </div>
        <p className="text-xs text-taupe">Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.</p>
      </div>

      {reabierto && (
        <Aviso tono="info" titulo="Reabriste el envío">
          Corrige lo que haga falta y vuelve a cerrarlo. Lo que ya entró al stock no se vuelve a contar ni se toca.
        </Aviso>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <aside aria-label="Categorías del envío" className="space-y-1.5" data-guia="recepcion.categorias">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">{sinAviso ? "Lo que llegó" : "Categorías del envío"}</p>
          {visibles.map((l) => {
            const estado = l.linea ? guia.estado(idCampoConteo(l.clave)) : contadasDe(l) > 0 ? "hecho" : "falta";
            const dif = diferenciaDe(l);
            const pend = l.conteo ? Math.max(0, contadasDe(l) - (l.conteo.enStock ?? 0) - detalladasDe(l)) : 0;
            return (
              <button
                key={l.clave}
                type="button"
                data-campo={l.linea ? idCampoConteo(l.clave) : undefined}
                aria-current={linea?.clave === l.clave ? "true" : undefined}
                onClick={() => elegir(l)}
                className={`hilo-luz flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  linea?.clave === l.clave ? "border-tinta bg-papel" : "border-sand bg-papel/60 hover:border-tinta/40"
                }`}
                data-estado={estado === "ahora" ? "ahora" : undefined}
              >
                <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${ESTADO_MARCA[estado === "hecho" ? "hecho" : estado === "ahora" ? "ahora" : "falta"]}`}>
                  {estado === "hecho" && <Check className="h-3 w-3" strokeWidth={2.6} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-tinta">{l.categoria?.nombre ?? "Categoría"}</span>
                  <span className="block truncate text-xs text-taupe">
                    {[l.marca?.nombre, !l.linea && !sinAviso ? "no estaba en la guía" : null, pend > 0 ? `${pend} para después` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums text-tinta">
                    {l.conteo ? contadasDe(l) : "—"}
                    {l.dijeron != null && <span className="text-xs font-normal text-taupe">/{l.dijeron}</span>}
                  </span>
                  {dif != null && dif !== 0 && l.conteo && (
                    <span className={`text-[11px] tabular-nums ${dif < 0 ? "text-ambar" : "text-pizarra"}`}>{dif > 0 ? `+${dif}` : dif}</span>
                  )}
                </span>
              </button>
            );
          })}
          <Boton
            type="button"
            peso={visibles.length === 0 ? "primario" : "discreto"}
            className="w-full"
            onClick={() => setHoja({ tipo: "agregar" })}
            data-guia="recepcion.agregar"
            data-campo={visibles.length === 0 ? ID_CAMPO_AGREGAR : undefined}
          >
            {sinAviso ? "+ Agregar lo que llegó" : "+ Algo que no estaba en la guía"}
          </Boton>
        </aside>

        <section className="card-cayla space-y-5 p-4 sm:p-5" aria-label="Contar">
          {!linea ? (
            <div className="space-y-2 py-6 text-center">
              <p className="font-display text-xl text-tinta">¿Qué llegó?</p>
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
            >
              {linea.categoria && linea.marca && (
                <SepararPrendas
                  categoria={linea.categoria}
                  marca={linea.marca}
                  separado={linea.conteo?.separado ?? { prendas: [], nuevas: [] }}
                  tope={Math.max(0, contadasDe(linea) - (linea.conteo?.enStock ?? 0))}
                  onSeparado={(s) => onEscribir(linea, { separado: s, contadas: Math.max(contadasDe(linea), (linea.conteo?.enStock ?? 0) + totalSeparado(s)) })}
                  onTallas={(p) => void abrirTallas(linea, p)}
                  onPrendaVista={onPrendaVista}
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

      {hoja?.tipo === "tallas" && lineaDeHoja?.categoria && lineaDeHoja.marca && (
        <HojaTallas
          key={hoja.prenda.productoId}
          prenda={hoja.prenda}
          categoria={lineaDeHoja.categoria}
          marca={lineaDeHoja.marca}
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

      {hoja?.tipo === "prenda" && lineaDeHoja?.categoria && lineaDeHoja.marca && (
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
            if (!lineaDeHoja.categoria || !lineaDeHoja.marca) return false;
            const { prendas: halladas } = await buscarPrendasParaRecibir(lineaDeHoja.categoria.id, lineaDeHoja.marca.id, nombre);
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

/** Cuántas de lo separado de una línea ya tienen tallas y colores. */
function detalladasDe(l: LineaParaContar): number {
  return (l.conteo?.separado.prendas ?? []).filter((p) => p.variantes !== null).reduce((a, p) => a + p.cantidad, 0);
}

/** A dónde va la hoja de la prenda («Es nueva» / «+ talla o color») desde una línea del conteo. */
function destinoDe(detalle: DetalleEnvio, l: LineaParaContar, modo: "nueva" | "agregar", prenda: PrendaRecepcion | null, nProveedores: number): DestinoHoja {
  return {
    modo,
    despachoId: detalle.id,
    despachoItemId: l.linea?.id ?? null,
    categoriaId: l.categoria?.id ?? "",
    marcaId: l.marca?.id ?? "",
    marcaNombre: l.marca?.nombre ?? "",
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
  children,
}: {
  linea: LineaParaContar;
  sinAviso: boolean;
  guardado: EstadoGuardado | null;
  error: string | null;
  onEscribir: (c: Partial<Borrador>) => void;
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-tinta">{linea.categoria?.nombre ?? "Categoría"}</h2>
          <p className="text-sm text-taupe">
            {[linea.marca?.nombre, linea.proveedor?.nombre, linea.linea?.descripcion].filter(Boolean).join(" · ")}
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
        <p className="text-xs text-taupe" aria-live="polite">
          {guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "Guardado" : linea.conteo?.contadoPor?.nombre ? `Contó ${linea.conteo.contadoPor.nombre}` : ""}
        </p>
      </div>

      <div className="space-y-3" data-guia="recepcion.numero">
        <p className="text-sm text-tinta">
          Cuenta {linea.categoria ? `las ${linea.categoria.nombre.toLowerCase()}` : "las prendas"} de esta línea y escribe cuántas llegaron.
          {linea.dijeron != null && " Si no coincide con lo que dijeron, no pasa nada: al cerrar dirás por qué."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => poner(contadas - 1)} disabled={contadas <= minimo} aria-label="Una menos" className="grid h-12 w-12 place-items-center rounded-2xl border border-sand bg-papel text-tinta hover:border-tinta/40 disabled:opacity-30">
            <Minus aria-hidden className="h-5 w-5" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={texto}
            placeholder="0"
            aria-label={`Cuántas ${linea.categoria?.nombre.toLowerCase() ?? "prendas"} llegaron`}
            onChange={(e) => {
              // Solo dígitos: la caja muestra lo que se guarda. Vacío es «todavía escribiendo», no 0.
              const { texto: limpio, contadas: n } = leerContadas(e.target.value);
              setEscribiendo(limpio);
              if (n !== null && n >= minimo) onEscribir({ contadas: n });
            }}
            onBlur={() => setEscribiendo(null)}
            onFocus={(e) => {
              setEscribiendo(e.currentTarget.value);
              e.currentTarget.select();
            }}
            className="font-display h-16 w-32 rounded-2xl border border-sand bg-papel text-center text-4xl tabular-nums text-tinta outline-none focus:border-tinta"
          />
          <button type="button" onClick={() => poner(contadas + 1)} aria-label="Una más" className="grid h-12 w-12 place-items-center rounded-2xl border border-sand bg-papel text-tinta hover:border-tinta/40">
            <Plus aria-hidden className="h-5 w-5" />
          </button>
          <div className="flex flex-wrap gap-1.5">
            <Boton type="button" peso="discreto" onClick={() => poner(contadas + 5)}>
              +5
            </Boton>
            <Boton type="button" peso="discreto" onClick={() => poner(contadas + 10)}>
              +10
            </Boton>
            {linea.dijeron != null && linea.dijeron >= minimo && (
              <Boton type="button" peso="discreto" onClick={() => poner(linea.dijeron ?? 0)}>
                Llegaron las {linea.dijeron}
              </Boton>
            )}
            {!linea.conteo && linea.linea && (
              <Boton type="button" peso="discreto" onClick={() => poner(0)}>
                No llegó nada
              </Boton>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-sand" aria-hidden>
            <div className={`h-full rounded-full transition-[width] duration-300 ease-cayla ${v.tono === "verde" ? "bg-verde" : v.tono === "ambar" ? "bg-ambar" : "bg-tinta/40"}`} style={{ width: `${fraccion * 100}%` }} />
          </div>
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

      {children}
    </div>
  );
}
