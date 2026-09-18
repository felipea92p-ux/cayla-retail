"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { resumirVarianza, type FilaPrevisualizacion, type Varianza } from "@/lib/conteo-varianza";
import type { ConteoAbierto, PrioridadConteo } from "@/lib/conteos";
import type { Sububicacion } from "@/lib/sububicaciones";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import { CampoMonto, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";

type VarianteConteo = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  costo: number;
  codigosBarras: string[];
};

function money(n: number) {
  return (n >= 0 ? "S/" : "-S/") + Math.abs(n).toFixed(2);
}

export type AvanceConteo = { contadas: number; total: number; porcentaje: number };

export function ConteoPanel({
  ubicacionId,
  esLider,
  conteoAbierto,
  avance,
  catalogo,
  sububicaciones,
  categorias,
  prioridad,
  colores,
  tallasPorCategoria,
}: {
  ubicacionId: string;
  esLider: boolean;
  conteoAbierto: ConteoAbierto | null;
  /** Cuántas prendas con stock ya se contaron (lo calcula la página con
   *  `previsualizar_cierre_conteo`); null sin conteo abierto. */
  avance: AvanceConteo | null;
  catalogo: VarianteConteo[];
  sububicaciones: Sububicacion[];
  categorias: { id: string; nombre: string }[];
  prioridad: PrioridadConteo[];
  /** Para el alta-al-vuelo (20260918): vocabulario cerrado de colores... */
  colores: { codigo: string; nombre: string }[];
  /** ...y de tallas, filtradas por categoría (mismo shape que `EjesPorCategoria.tallas`). */
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
}) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState<string | "todo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "" = todo el catálogo; si no, el id de la categoría elegida. Solo
  // cambia qué se SUGIERE contar primero — abrir_conteo sigue dejando
  // contar cualquier variante después, esté o no en el alcance elegido.
  const [categoriaId, setCategoriaId] = useState("");
  const [sugerenciasPorCategoria, setSugerenciasPorCategoria] = useState<PrioridadConteo[] | null>(null);
  const sugerencias = categoriaId ? (sugerenciasPorCategoria ?? []) : prioridad;

  useEffect(() => {
    if (!categoriaId) return;
    let cancelado = false;
    createClient()
      .rpc("fn_prioridad_conteo", { p_ubicacion_id: ubicacionId, p_alcance_categoria_id: categoriaId })
      .then(({ data, error }) => {
        if (cancelado || error || !data) return;
        setSugerenciasPorCategoria(
          data.map((f) => ({
            varianteId: f.variante_id,
            sku: f.sku,
            referencia: f.referencia,
            talla: f.talla,
            color: f.color,
            sububicacionId: f.sububicacion_id,
            diasSinContar: f.dias_sin_contar,
            valorEnRiesgo: Number(f.valor_en_riesgo),
          }))
        );
      });
    return () => {
      cancelado = true;
    };
  }, [categoriaId, ubicacionId]);

  async function abrir(sububicacionId: string | null) {
    setAbriendo(sububicacionId ?? "todo");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("abrir_conteo", {
      p_ubicacion_id: ubicacionId,
      p_sububicacion_id: sububicacionId ?? undefined,
      p_alcance: categoriaId ? "categoria" : "todo",
      p_alcance_categoria_id: categoriaId || undefined,
    });
    setAbriendo(null);
    if (error) {
      setError(traducirError(error, "abrir el conteo"));
      return;
    }
    avisar.exito("Conteo abierto");
    router.refresh();
  }

  if (!conteoAbierto) {
    // Con piso/almacén configurados, abrir_conteo ya no acepta "toda la
    // ubicación" (20260914210000_inventario_piso_almacen.sql) — cerrar_conteo
    // no tendría a cuál de las dos sububicaciones cargar el ajuste. Se elige
    // acá, antes de abrir; Taller sigue con el botón único de siempre.
    const piso = sububicaciones.find((s) => s.tipo === "piso_venta") ?? null;
    const almacen = sububicaciones.find((s) => s.tipo === "almacen_tienda") ?? null;
    const separaPisoAlmacen = Boolean(piso || almacen);

    return (
      <div className="space-y-4">
        <div className="card-cayla space-y-3 p-6 text-center">
          <p className="text-sm text-tinta/75">No hay ningún conteo abierto en esta ubicación.</p>
          {error && <p className="text-sm text-rojo">{error}</p>}
          {categorias.length > 0 && (
            <div className="mx-auto flex w-fit items-center gap-2 text-left">
              <label htmlFor="conteo-alcance" className="label-cayla text-[11px] text-tinta/65">
                Qué contar
              </label>
              <select
                id="conteo-alcance"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="rounded-lg border border-tinta/15 bg-papel px-2.5 py-1.5 text-sm text-tinta"
              >
                <option value="">Todo el catálogo</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    Solo {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          {separaPisoAlmacen ? (
            <div className="mx-auto flex w-fit flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => piso && abrir(piso.id)}
                disabled={!piso || abriendo !== null}
                className={`${botonPrimario} px-6`}
              >
                {abriendo === piso?.id ? "Abriendo…" : "Contar piso de venta"}
              </button>
              <button
                type="button"
                onClick={() => almacen && abrir(almacen.id)}
                disabled={!almacen || abriendo !== null}
                className={`${botonPrimario} px-6`}
              >
                {abriendo === almacen?.id ? "Abriendo…" : "Contar almacén de tienda"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => abrir(null)} disabled={abriendo !== null} className={`${botonPrimario} mx-auto w-fit px-6`}>
              {abriendo === "todo" ? "Abriendo…" : "Abrir conteo"}
            </button>
          )}
        </div>

        {sugerencias.length > 0 && (
          <div className="card-cayla p-5">
            <p className="label-cayla mb-3 text-[11px] text-tinta/65">Conviene contar primero (mayor plata en riesgo)</p>
            <ul className="divide-y divide-tinta/10">
              {sugerencias.slice(0, 8).map((s) => {
                // Misma variante, dos filas reales: unidades sin contar en
                // piso Y en almacén a la vez — nunca una duplicada. Sin esta
                // etiqueta, las dos se ven idénticas salvo por el monto.
                const sububicacion = sububicaciones.find((sub) => sub.id === s.sububicacionId);
                return (
                  <li key={`${s.varianteId}-${s.sububicacionId ?? "sin"}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-tinta">
                      {s.referencia}
                      {s.talla && ` · ${s.talla}`}
                      {s.color && ` · ${s.color}`}
                      {sububicacion && <span className="text-tinta/55"> · {sububicacion.nombre}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-tinta/55">
                      {s.diasSinContar == null ? "nunca contada" : `hace ${s.diasSinContar}d`} · {money(s.valorEnRiesgo)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <ConteoEnCurso
      conteo={conteoAbierto}
      avance={avance}
      catalogo={catalogo}
      esLider={esLider}
      categorias={categorias}
      colores={colores}
      tallasPorCategoria={tallasPorCategoria}
    />
  );
}

function ConteoEnCurso({
  conteo,
  avance,
  catalogo,
  esLider,
  categorias,
  colores,
  tallasPorCategoria,
}: {
  conteo: ConteoAbierto;
  avance: AvanceConteo | null;
  catalogo: VarianteConteo[];
  esLider: boolean;
  categorias: { id: string; nombre: string }[];
  colores: { codigo: string; nombre: string }[];
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<VarianteConteo | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  // Prendas creadas al vuelo en ESTA sesión de conteo — se suman a
  // `catalogo` (que no se actualiza hasta el próximo `router.refresh()`)
  // para que un segundo escaneo de la misma prenda resuelva directo, sin
  // esperar al servidor.
  const [catalogoNuevo, setCatalogoNuevo] = useState<VarianteConteo[]>([]);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const catalogoCompleto = useMemo(() => [...catalogo, ...catalogoNuevo], [catalogo, catalogoNuevo]);

  async function cancelarConteo() {
    setCancelando(true);
    const { error } = await createClient().rpc("anular_conteo", { p_conteo_id: conteo.id });
    setCancelando(false);
    if (error) {
      setError(traducirError(error, "cancelar el conteo"));
      setConfirmarCancelar(false);
      return;
    }
    avisar.exito("Conteo cancelado");
    router.refresh();
  }

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return catalogoCompleto
      .filter((v) => (v.sku ?? "").toLowerCase().includes(q) || v.codigosBarras.some((c) => c.toLowerCase() === q))
      .slice(0, 8);
  }, [busqueda, catalogoCompleto]);

  // Nada coincide y hay algo escrito: puede ser una prenda de verdad que el
  // catálogo no tiene. `busqueda.length >= 6` filtra el ruido de las
  // primeras letras de un SKU que sí existe (un código de barras real nunca
  // es tan corto) sin bloquear el alta si alguien prefiere escribir la
  // referencia a mano en vez de escanear.
  const sinCoincidencias = busqueda.trim().length >= 6 && coincidencias.length === 0;

  // Escanear un código de barras exacto selecciona directo, sin tener que
  // elegir de una lista — es el camino rápido que pide un conteo real con
  // pistola. Buscar por texto parcial de SKU sigue mostrando opciones.
  const yaContadas = new Set(conteo.items.map((i) => i.varianteId));

  async function registrarConteo(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionada) return;
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n < 0) {
      setError("La cantidad física debe ser un número entero, 0 o más.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("conteo_contar", {
      p_conteo_id: conteo.id,
      p_variante_id: seleccionada.varianteId,
      p_cantidad_contada: n,
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "registrar el conteo de esa prenda"));
      return;
    }
    avisar.exito(`${seleccionada.referencia} contada`);
    setSeleccionada(null);
    setBusqueda("");
    setCantidad("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="card-cayla p-5">
        {/* Cabecera del conteo abierto (diseño de Felipe, 2026-09-16): número,
            dónde y qué se cuenta, quién lo abrió, y el avance — cuántas de las
            prendas con stock ya se tocaron. La barra no es decoración: quien
            cuenta sabe cuánto le falta sin preguntar. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg text-tinta">Conteo {conteo.numero}</p>
            <p className="label-cayla mt-0.5 text-[11px] text-tinta/65">
              {conteo.sububicacionNombre ?? "Toda la ubicación"}
              {conteo.alcance === "categoria" && conteo.alcanceCategoriaNombre ? ` · solo ${conteo.alcanceCategoriaNombre}` : " · todo el catálogo"} ·{" "}
              {conteo.abiertoPorNombre} · {new Date(conteo.creadoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })}
            </p>
            {!confirmarCancelar ? (
              <button
                type="button"
                onClick={() => setConfirmarCancelar(true)}
                className="mt-1.5 text-xs text-tinta/45 underline underline-offset-2 hover:text-rojo"
              >
                Cancelar este conteo
              </button>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-tinta/65">¿Cancelar? Se pierde lo contado — el stock no se toca.</span>
                <button type="button" onClick={cancelarConteo} disabled={cancelando} className="font-semibold text-rojo hover:underline disabled:opacity-50">
                  {cancelando ? "Cancelando…" : "Sí, cancelar"}
                </button>
                <button type="button" onClick={() => setConfirmarCancelar(false)} className="text-tinta/55 hover:underline">
                  Seguir contando
                </button>
              </div>
            )}
          </div>
          {avance && (
            <div className="min-w-[12rem] flex-1 sm:max-w-xs">
              <div className="flex items-baseline justify-between text-xs text-tinta/65">
                <span>
                  {avance.contadas} de {avance.total} prendas contadas
                </span>
                <span className="font-semibold tabular-nums text-tinta">{avance.porcentaje} %</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={avance.porcentaje} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-tinta transition-[width]" style={{ width: `${avance.porcentaje}%` }} />
              </div>
              {avance.total - avance.contadas > 0 && (
                <p className="mt-1 text-xs text-tinta/55">
                  {avance.total - avance.contadas} {avance.total - avance.contadas === 1 ? "prenda pendiente" : "prendas pendientes"} — las que no se cuenten no se tocan al cerrar
                </p>
              )}
            </div>
          )}
        </div>

        {!seleccionada ? (
          <div className="mt-3">
            <input
              autoFocus
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                // `resolverCodigoV2` compara sin mayúsculas ni acentos (misma
                // regla que Vender y el buscador global) — antes era
                // `codigosBarras.includes(texto.trim())`, sensible a
                // mayúsculas, y el escaneo "directo" que promete el
                // placeholder podía fallar en silencio.
                const exacto = resolverCodigoV2(e.target.value, catalogoCompleto);
                if (exacto) setSeleccionada(exacto);
              }}
              placeholder="Escanea el código de barras o escribe el SKU…"
              className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
            {coincidencias.length > 0 && (
              <div className="mt-2 space-y-1">
                {coincidencias.map((v) => (
                  <button
                    key={v.varianteId}
                    type="button"
                    onClick={() => setSeleccionada(v)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/50"
                  >
                    <span>
                      {v.referencia} <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                    </span>
                    <span className="font-mono text-[11px] text-tinta/65">
                      {v.sku} {yaContadas.has(v.varianteId) && "· ya contada"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {sinCoincidencias && !altaAbierta && (
              <button
                type="button"
                onClick={() => setAltaAbierta(true)}
                className="mt-2 text-sm text-rojo underline underline-offset-2"
              >
                No se encontró «{busqueda.trim()}» — dar de alta esta prenda
              </button>
            )}
            {altaAbierta && (
              <AltaAlVuelo
                codigoBarras={busqueda.trim()}
                categorias={categorias}
                colores={colores}
                tallasPorCategoria={tallasPorCategoria}
                onCancelar={() => setAltaAbierta(false)}
                onCreada={(variante) => {
                  setCatalogoNuevo((prev) => [...prev, variante]);
                  setAltaAbierta(false);
                  setSeleccionada(variante);
                  setBusqueda("");
                }}
              />
            )}
          </div>
        ) : (
          <form onSubmit={registrarConteo} className="mt-3 space-y-3">
            <p className="text-sm text-tinta">
              {seleccionada.referencia} <span className="text-tinta/65">{[seleccionada.talla, seleccionada.color].filter(Boolean).join("/")}</span>{" "}
              <span className="font-mono text-[11px] text-tinta/65">{seleccionada.sku}</span>
            </p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="label-cayla text-[11px] text-tinta/70">Cantidad física</label>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="w-28 border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                />
              </div>
              <button type="submit" disabled={loading} className={botonPrimario}>
                {loading ? "Guardando…" : "Registrar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSeleccionada(null);
                  setBusqueda("");
                  setCantidad("");
                }}
                className={botonCancelar}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-rojo">{error}</p>}
      </div>

      {conteo.items.length > 0 && (
        <div className="card-cayla divide-y divide-tinta/10">
          {conteo.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-5 py-2.5">
              <p className="text-sm text-tinta">
                {i.referencia} <span className="text-tinta/65">{[i.talla, i.color].filter(Boolean).join("/")}</span>{" "}
                <span className="font-mono text-[11px] text-tinta/65">{i.sku}</span>
              </p>
              <p className="text-sm tabular-nums text-tinta/75">× {i.cantidadContada}</p>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={conteo.items.length === 0}
        onClick={() => setRevisando(true)}
        className={`${botonPrimario} w-full disabled:opacity-40`}
      >
        Revisar y cerrar conteo
      </button>

      {revisando && (
        <RevisarCierre conteoId={conteo.id} catalogo={catalogo} esLider={esLider} onClose={() => setRevisando(false)} />
      )}
    </div>
  );
}

function RevisarCierre({
  conteoId,
  catalogo,
  esLider,
  onClose,
}: {
  conteoId: string;
  catalogo: VarianteConteo[];
  esLider: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [varianza, setVarianza] = useState<Varianza | null>(null);
  const [noContadas, setNoContadas] = useState<FilaPrevisualizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const costoDe = new Map(catalogo.map((v) => [v.varianteId, v.costo]));
    createClient()
      .rpc("previsualizar_cierre_conteo", { p_conteo_id: conteoId })
      .then(({ data, error: errCarga }) => {
        if (!vigente) return;
        if (errCarga) {
          setError(traducirError(errCarga, "cargar la vista previa"));
          setCargando(false);
          return;
        }
        const filas = (data as FilaPrevisualizacion[]) ?? [];
        // cerrar_conteo() nunca toca lo que nadie contó — así que la
        // diferencia neta que se muestra acá solo puede venir de lo
        // realmente contado. Mezclar "no_contado" ahí adentro convertiría
        // cada variante nunca escaneada en "faltante total", una alarma
        // falsa sobre algo que el cierre real ni siquiera va a mirar.
        setVarianza(resumirVarianza(filas.filter((f) => f.origen === "contado"), costoDe));
        setNoContadas(filas.filter((f) => f.origen === "no_contado"));
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteoId]);

  async function cerrar() {
    setCerrando(true);
    setError(null);
    const { error } = await createClient().rpc("cerrar_conteo", { p_conteo_id: conteoId });
    setCerrando(false);
    if (error) {
      setError(traducirError(error, "cerrar el conteo"));
      return;
    }
    avisar.exito("Conteo cerrado", { detalle: "El stock ya quedó ajustado a lo contado." });
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/35 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sand bg-crema p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg text-tinta">Revisar antes de cerrar</h2>

        {cargando ? (
          <p className="mt-4 text-sm text-tinta/65">Calculando…</p>
        ) : varianza ? (
          <div className="mt-4 space-y-4">
            <div className="card-cayla p-4 text-center">
              <p className="label-cayla text-[11px] text-tinta/65">Diferencia neta</p>
              <p className={`font-display text-2xl ${varianza.solesNeto === 0 ? "text-tinta" : varianza.solesNeto < 0 ? "text-rojo" : "text-verde"}`}>
                {money(varianza.solesNeto)}
              </p>
              <p className="mt-1 text-xs text-tinta/65">
                {varianza.unidadesSobrantes} de más · {varianza.unidadesFaltantes} de menos
                {varianza.lineasSinCosto > 0 && ` · ${varianza.lineasSinCosto} sin costo cargado`}
              </p>
            </div>

            {varianza.lineas.filter((l) => l.diferencia !== 0).length > 0 && (
              <div className="card-cayla divide-y divide-tinta/10">
                {varianza.lineas
                  .filter((l) => l.diferencia !== 0)
                  .map((l) => (
                    <div key={l.varianteId} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span>
                        {l.referencia} <span className="text-tinta/65">{[l.talla, l.color].filter(Boolean).join("/")}</span>
                      </span>
                      <span className={l.diferencia > 0 ? "text-verde" : "text-rojo"}>
                        {l.sistema} → {l.contada} ({l.diferencia > 0 ? "+" : ""}
                        {l.diferencia})
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {noContadas.length > 0 && (
              <p className="text-xs text-tinta/65">
                ⚠ {noContadas.length} variante{noContadas.length > 1 ? "s" : ""} con stock en esta ubicación nunca se
                contaron y no se van a tocar al cerrar: {noContadas.map((l) => l.referencia).slice(0, 5).join(", ")}
                {noContadas.length > 5 && "…"}
              </p>
            )}

            {!esLider && <p className="text-xs text-rojo">Solo un líder puede cerrar el conteo.</p>}
            {error && <p className="text-sm text-rojo">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className={botonCancelar}>
                Seguir contando
              </button>
              <button type="button" onClick={cerrar} disabled={cerrando || !esLider} className={botonPrimario}>
                {cerrando ? "Cerrando…" : "Cerrar conteo"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-rojo">{error}</p>
        )}
      </div>
    </div>
  );
}

// Alta al vuelo durante el conteo (20260918, `censo_crear_variante`): cuando
// se escanea algo que el catálogo no reconoce, esto crea la prenda en el
// momento (queda 'pendiente' de que un Líder la revise, pero ya se puede
// contar) en vez de mandar a la Encargada a pedirle a otra persona que la
// cree aparte en /productos/nuevo. Solo referencia y categoría son
// obligatorias — costo/precio en 0 si no se saben, el Líder los completa al
// revisar.
function AltaAlVuelo({
  codigoBarras,
  categorias,
  colores,
  tallasPorCategoria,
  onCancelar,
  onCreada,
}: {
  codigoBarras: string;
  categorias: { id: string; nombre: string }[];
  colores: { codigo: string; nombre: string }[];
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  onCancelar: () => void;
  onCreada: (variante: VarianteConteo) => void;
}) {
  const [referencia, setReferencia] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tallaId, setTallaId] = useState("");
  const [colorCodigo, setColorCodigo] = useState("");
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const tallas = tallasPorCategoria[categoriaId] ?? [];

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!referencia.trim() || !categoriaId) {
      setError("Referencia y categoría son obligatorias.");
      return;
    }
    setGuardando(true);
    setError(null);
    const { data, error } = await createClient().rpc("censo_crear_variante", {
      p_referencia: referencia.trim(),
      p_categoria_id: categoriaId,
      p_codigo_barras: codigoBarras,
      p_talla_id: tallaId || undefined,
      p_color_codigo: colorCodigo || undefined,
      p_costo: costo ? Number(costo) : 0,
      p_precio: precio ? Number(precio) : 0,
    });
    setGuardando(false);
    const fila = data?.[0];
    if (error || !fila) {
      setError(traducirError(error, "dar de alta esta prenda"));
      return;
    }
    avisar.exito(`${fila.referencia} dada de alta`, { detalle: "Pendiente de que un Líder la revise — ya se puede contar." });
    onCreada({
      varianteId: fila.variante_id,
      sku: fila.sku ?? "",
      referencia: fila.referencia,
      talla: fila.talla,
      color: fila.color,
      costo: Number(fila.costo),
      codigosBarras: [fila.codigo_barras],
    });
  }

  return (
    <form onSubmit={crear} className="mt-3 space-y-3 rounded-xl border border-tinta/15 p-4">
      <p className="text-sm text-tinta">
        Dar de alta <span className="font-mono text-[11px] text-tinta/65">{codigoBarras}</span>
      </p>
      <CampoTexto etiqueta="Referencia (nombre de la prenda)" value={referencia} onChange={(e) => setReferencia(e.target.value)} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <CampoSelectNativo
          etiqueta="Categoría"
          value={categoriaId}
          onChange={(e) => {
            setCategoriaId(e.target.value);
            setTallaId("");
          }}
        >
          <option value="">Elige…</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </CampoSelectNativo>
        <CampoSelectNativo etiqueta="Talla (si aplica)" value={tallaId} onChange={(e) => setTallaId(e.target.value)} disabled={!categoriaId}>
          <option value="">Sin talla</option>
          {tallas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.texto}
            </option>
          ))}
        </CampoSelectNativo>
      </div>
      <CampoSelectNativo etiqueta="Color (si aplica)" value={colorCodigo} onChange={(e) => setColorCodigo(e.target.value)}>
        <option value="">Sin color</option>
        {colores.map((c) => (
          <option key={c.codigo} value={c.codigo}>
            {c.nombre}
          </option>
        ))}
      </CampoSelectNativo>
      <div className="grid grid-cols-2 gap-3">
        <CampoMonto etiqueta="Costo (si lo sabes)" value={costo} onChange={(e) => setCosto(e.target.value)} />
        <CampoMonto etiqueta="Precio de venta (si lo sabes)" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </div>
      <p className="text-xs text-tinta/55">Un Líder va a revisar esto después — si no sabes el costo o el precio, déjalo en 0 y los completa él.</p>
      {error && <p className="text-sm text-rojo">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={guardando} className={botonPrimario}>
          {guardando ? "Creando…" : "Crear y contar"}
        </button>
        <button type="button" onClick={onCancelar} className={botonCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
