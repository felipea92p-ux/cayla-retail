"use client";

import { ElegirMarcaProveedor } from "@/components/alta-producto/ElegirMarcaProveedor";
import type { CatalogoMarcas } from "@/lib/marcas-datos";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ScanBarcode } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { resumirVarianza, type FilaPrevisualizacion, type Varianza } from "@/lib/conteo-varianza";
import {
  avanceEnVivo,
  coincidenciasPorCodigo,
  codigoDePrendaNueva,
  crearColaEnSerie,
  modoConteoValido,
  nuevaCantidad,
  prioridadDesdeFila,
  tocar,
  type ModoConteo,
  type PrendaPendiente,
} from "@/lib/conteo-reglas";
import type { ConteoAbierto, PrioridadConteo } from "@/lib/conteos";
import type { Sububicacion } from "@/lib/sububicaciones";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import { getAparienciaVariantes } from "@/lib/apariencia-variantes";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Campo, CampoMonto, CampoSelect, CampoTexto, Desplegable } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { guardar as guardarLocal, leer as leerLocal } from "@/lib/almacen-local";

type VarianteConteo = {
  varianteId: string;
  /** El código de la etiqueta (`codigosDeConteo`), no `variantes.sku`: casi ninguna prenda lo tiene (ADR-0058). */
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  /** null = esta cuenta no ve el dinero (20260923193700): el cierre se revisa en unidades, sin soles. */
  costo: number | null;
  codigosBarras: string[];
};

/** Lo mínimo para dibujar una prenda en las listas del conteo (lo contado viene de `conteo.items`, lo nuevo del catálogo). */
type PrendaVista = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null };

// Ubicación · último conteo · en riesgo: la prenda manda (mismo piso que Existencias) y las tres cifras son compactas.
const PLANTILLA_SUGERENCIAS = "sm:grid-cols-[minmax(13.5rem,1.4fr)_minmax(7rem,1fr)_7rem_6rem]";

/** El modo elegido se recuerda en ESTE navegador (una terminal de tienda cuenta siempre igual). Es una comodidad:
 *  si el almacenamiento no está, el conteo arranca en «suma» y funciona igual. */
const CLAVE_MODO = "cayla:conteo:modo";

function money(n: number) {
  return `${n < 0 ? "−" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function soles(n: number) {
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function detalle(p: { talla: string | null; color: string | null }) {
  return [p.talla, p.color].filter(Boolean).join(" · ");
}

/** Una prenda en las listas del conteo: sin foto (las listas son de trabajo, se leen rápido), código + talla + color. */
function PrendaLinea({ prenda }: { prenda: PrendaVista }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm text-tinta" title={prenda.referencia}>
        {prenda.referencia}
      </span>
      <span className="block truncate text-xs text-taupe">
        <span className="font-mono text-[11px]">{prenda.sku || "sin código"}</span>
        {detalle(prenda) && ` · ${detalle(prenda)}`}
      </span>
    </span>
  );
}

export function ConteoPanel({
  ubicacionId,
  puedeCerrar,
  puedeCrearMarcas,
  conteoAbierto,
  pendientes,
  ultimoPorLugar,
  catalogo,
  sububicaciones,
  categorias,
  prioridad,
  colores,
  tallasPorCategoria,
  marcas,
}: {
  ubicacionId: string;
  /** Cerrar el conteo aplica lo contado al stock: un líder o la terminal administrativa (ADR-0160). */
  puedeCerrar: boolean;
  /** Crear una marca al dar de alta al vuelo es del Catálogo: un líder o la terminal administrativa. */
  puedeCrearMarcas: boolean;
  conteoAbierto: ConteoAbierto | null;
  /** Lo que falta contar del conteo abierto, dentro de su alcance y SIN la cifra del sistema (ADR-0174). */
  pendientes: PrendaPendiente[];
  /** Por sububicación (id), una línea sobre su último conteo con prendas: ayuda a elegir dónde contar. */
  ultimoPorLugar: Record<string, string>;
  catalogo: VarianteConteo[];
  sububicaciones: Sububicacion[];
  categorias: { id: string; nombre: string }[];
  prioridad: PrioridadConteo[];
  /** Para el alta-al-vuelo (20260918): vocabulario cerrado de colores... */
  colores: { codigo: string; nombre: string }[];
  /** ...y de tallas, filtradas por categoría (mismo shape que `EjesPorCategoria.tallas`). */
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  /** Marcas, proveedores y parejas más usadas por categoría: el alta al vuelo las pide (ADR-0109). */
  marcas: CatalogoMarcas;
}) {
  // Todo lo que guarda en un conteo (abrir, contar, dar de alta al vuelo, cancelar, cerrar) pide Responsable
  // (ADR-0161). Un solo control para todo el panel: se pasa a las piezas de abajo.
  const responsable = useResponsable();

  if (conteoAbierto) {
    return (
      <ConteoEnCurso
        // Un conteo nuevo (se cerró uno y se abrió otro) arranca de cero: sus cantidades, su modo de trabajo y su cola.
        key={conteoAbierto.id}
        conteo={conteoAbierto}
        pendientes={pendientes}
        catalogo={catalogo}
        puedeCerrar={puedeCerrar}
        puedeCrearMarcas={puedeCrearMarcas}
        categorias={categorias}
        colores={colores}
        tallasPorCategoria={tallasPorCategoria}
        marcas={marcas}
        responsable={responsable}
      />
    );
  }

  return (
    <AbrirConteo
      ubicacionId={ubicacionId}
      sububicaciones={sububicaciones}
      categorias={categorias}
      prioridad={prioridad}
      ultimoPorLugar={ultimoPorLugar}
      responsable={responsable}
    />
  );
}

// ================================================================================================================
// 1 · Abrir: dónde, qué y quién (ADR-0174). Antes eran dos botones grises que no decían por qué no se podían tocar
// y un desplegable de 25 «Solo …»; ahora cada paso se ve, y el botón dice qué abre o qué falta.
// ================================================================================================================

function AbrirConteo({
  ubicacionId,
  sububicaciones,
  categorias,
  prioridad,
  ultimoPorLugar,
  responsable,
}: {
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  categorias: { id: string; nombre: string }[];
  prioridad: PrioridadConteo[];
  ultimoPorLugar: Record<string, string>;
  responsable: ControlResponsable;
}) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Con piso/almacén configurados, abrir_conteo ya no acepta "toda la ubicación"
  // (20260914210000_inventario_piso_almacen.sql) — cerrar_conteo no tendría a cuál de las dos sububicaciones
  // cargar el ajuste. Se elige acá, antes de abrir; el Taller sigue con «toda la ubicación».
  const lugares = sububicaciones.filter((s) => s.tipo === "piso_venta" || s.tipo === "almacen_tienda");
  const separaPisoAlmacen = lugares.length > 0;
  const [lugarId, setLugarId] = useState<string | null>(null);

  // `todo` o una categoría. La categoría solo cambia qué se SUGIERE y qué lista «Faltan por contar»: abrir_conteo
  // sigue dejando contar cualquier prenda después, esté o no en el alcance.
  const [alcance, setAlcance] = useState<"todo" | "categoria">("todo");
  const [categoriaId, setCategoriaId] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [sugerenciasPorCategoria, setSugerenciasPorCategoria] = useState<PrioridadConteo[] | null>(null);
  const categoriaElegida = alcance === "categoria" && categoriaId ? categorias.find((c) => c.id === categoriaId) ?? null : null;
  const sugerencias = categoriaElegida ? (sugerenciasPorCategoria ?? []) : prioridad;

  useEffect(() => {
    if (!categoriaElegida) return;
    let cancelado = false;
    const supabase = createClient();
    supabase
      .rpc("fn_prioridad_conteo", { p_ubicacion_id: ubicacionId, p_alcance_categoria_id: categoriaElegida.id })
      .then(async ({ data, error }) => {
        if (cancelado || error || !data) return;
        // La función no devuelve la miniatura ni el color: se piden aparte, con la misma
        // regla que Existencias (si falla, la fila sale sin foto y con el color en texto).
        const apariencia = await getAparienciaVariantes(
          supabase,
          data.map((f) => f.variante_id)
        );
        if (cancelado) return;
        // El mismo mapeo que hace el servidor (`getPrioridadConteo`), en un solo lugar: incluye el código de la etiqueta.
        setSugerenciasPorCategoria(data.map((f) => prioridadDesdeFila(f, apariencia.get(f.variante_id))));
      });
    return () => {
      cancelado = true;
    };
  }, [categoriaElegida, ubicacionId]);

  const categoriasVisibles = useMemo(() => {
    const q = filtroCategoria.trim().toLocaleLowerCase("es");
    return q ? categorias.filter((c) => c.nombre.toLocaleLowerCase("es").includes(q)) : categorias;
  }, [categorias, filtroCategoria]);

  const lugar = separaPisoAlmacen ? lugares.find((l) => l.id === lugarId) ?? null : null;
  const faltan = [
    separaPisoAlmacen && !lugar ? "dónde se cuenta" : null,
    alcance === "categoria" && !categoriaElegida ? "la categoría" : null,
    !responsable.listo ? "quién cuenta" : null,
  ].filter((x): x is string => !!x);
  const listo = faltan.length === 0;

  async function abrir() {
    if (!listo) return;
    setAbriendo(true);
    setError(null);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("abrir_conteo", {
        p_ubicacion_id: ubicacionId,
        p_sububicacion_id: lugar?.id ?? undefined,
        p_alcance: categoriaElegida ? "categoria" : "todo",
        p_alcance_categoria_id: categoriaElegida?.id ?? undefined,
      }),
      responsable.firma(),
    );
    setAbriendo(false);
    responsable.despues(error);
    if (error) {
      setError(traducirError(error, "abrir el conteo"));
      return;
    }
    avisar.exito("Conteo abierto", { detalle: "Ya puedes escanear." });
    router.refresh();
  }

  const que = categoriaElegida ? `solo ${categoriaElegida.nombre}` : "todo el catálogo";
  const donde = separaPisoAlmacen ? lugar?.nombre.toLocaleLowerCase("es") ?? "" : "toda la ubicación";

  return (
    <div className="space-y-5">
      <section className="card-cayla space-y-6 p-5 sm:p-6" aria-labelledby="abrir-conteo">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="abrir-conteo" className="font-display text-xl text-tinta">
            Abrir un conteo
          </h2>
          <p className="text-xs text-taupe">No hay ningún conteo abierto en esta ubicación.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr_1fr]">
          <Paso numero={1} titulo="Dónde" hecho={!separaPisoAlmacen || !!lugar}>
            {separaPisoAlmacen ? (
              <div className="grid gap-2" role="group" aria-label="Dónde se cuenta">
                {lugares.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={lugarId === l.id}
                    onClick={() => setLugarId(l.id)}
                    className={`rounded-lg border px-3.5 py-3 text-left transition-colors ${
                      lugarId === l.id ? "border-tinta bg-sand/40 ring-1 ring-tinta" : "border-sand bg-papel hover:border-taupe/45"
                    }`}
                  >
                    <span className="block text-[15px] text-tinta">{l.nombre}</span>
                    <span className="block text-xs text-taupe">{ultimoPorLugar[l.id] ?? "Aún sin conteo con prendas"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-sand bg-papel px-3.5 py-3 text-sm text-tinta">Toda la ubicación</p>
            )}
          </Paso>

          <Paso numero={2} titulo="Qué" hecho={alcance === "todo" || !!categoriaElegida}>
            <SegmentoDeslizante
              etiqueta="Qué se cuenta"
              valor={alcance}
              onCambio={(v) => setAlcance(v === "categoria" ? "categoria" : "todo")}
              opciones={[
                { clave: "todo", etiqueta: "Todo el catálogo" },
                { clave: "categoria", etiqueta: "Una categoría" },
              ]}
            />
            {alcance === "categoria" ? (
              <>
                <input
                  type="search"
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  placeholder={`Buscar entre las ${categorias.length} categorías…`}
                  aria-label="Buscar categoría"
                  className="caja-cayla h-10 w-full px-3 text-sm text-tinta outline-none placeholder:text-taupe"
                />
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {categoriasVisibles.map((c) => (
                    <button key={c.id} type="button" aria-pressed={categoriaId === c.id} onClick={() => setCategoriaId(c.id)} className="pildora-cayla">
                      {c.nombre}
                    </button>
                  ))}
                  {categoriasVisibles.length === 0 && <p className="text-xs text-taupe">Ninguna categoría se llama así.</p>}
                </div>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-taupe">
                Todo lo que tiene stock en el lugar elegido. Por categoría se termina antes y la lista de pendientes es más corta.
              </p>
            )}
          </Paso>

          <Paso numero={3} titulo="Quién cuenta" hecho={responsable.listo}>
            <ComboResponsable control={responsable} deshabilitado={abriendo} />
          </Paso>
        </div>

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
          <p className="text-sm text-tinta">
            {listo ? (
              <>
                Se abre un conteo de <b className="font-semibold">{donde}</b>, <b className="font-semibold">{que}</b>.
              </>
            ) : (
              <span className="text-rojo-profundo">Falta elegir {faltan.join(", ").replace(/, ([^,]*)$/, " y $1")}.</span>
            )}
          </p>
          <button type="button" onClick={abrir} disabled={!listo || abriendo} className="btn-cayla btn-primario">
            {abriendo ? "Abriendo…" : "Abrir y empezar a contar"}
          </button>
        </div>
      </section>

      {sugerencias.length > 0 && (
        // La misma tabla de Existencias (`ui/Tabla.tsx`): cada dato en su columna. Con una categoría elegida, la
        // lista es la de esa categoría (misma función, acotada).
        <section className="card-cayla space-y-3 p-4 sm:p-5" aria-labelledby="conviene-contar">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="conviene-contar" className="font-display text-lg text-tinta">
              Conviene contar primero{categoriaElegida ? ` · ${categoriaElegida.nombre}` : ""}
            </h2>
            <p className="text-xs text-taupe">Nunca contadas primero; después, más plata en la percha (stock × precio)</p>
          </div>
          <Tabla className="rounded-lg border-0 bg-transparent">
            <Encabezado
              plantilla={PLANTILLA_SUGERENCIAS}
              columnas={[
                { titulo: "Producto / variante" },
                { titulo: "Ubicación", alinear: "centro" },
                { titulo: "Último conteo", alinear: "centro" },
                { titulo: "En riesgo", alinear: "der" },
              ]}
            />
            {sugerencias.slice(0, 8).map((s) => {
              // Misma variante, dos filas reales: unidades sin contar en piso Y en almacén a la vez — nunca una
              // duplicada. Sin la columna «Ubicación», las dos se ven idénticas salvo por el monto.
              const sububicacion = sububicaciones.find((sub) => sub.id === s.sububicacionId);
              return (
                <div key={`${s.varianteId}-${s.sububicacionId ?? "sin"}`} className={fila(PLANTILLA_SUGERENCIAS)}>
                  <ProductoVarianteCelda
                    referencia={s.referencia}
                    sku={s.sku || "sin código"}
                    talla={s.talla}
                    color={s.color}
                    colorHex={s.apariencia?.colorHex}
                    fotoUrl={s.apariencia?.fotoUrl ?? null}
                  />
                  <span className={celda("centro", "text-sm")}>
                    <span className="mr-1 text-[11px] text-taupe sm:hidden">Ubicación</span>
                    {sububicacion?.nombre ?? "—"}
                  </span>
                  <span className={celda("centro", "overflow-visible text-sm tabular-nums")}>
                    <span className="mr-1 text-[11px] text-taupe sm:hidden">Último conteo</span>
                    {s.diasSinContar == null ? <span className="text-ambar">Nunca contada</span> : `hace ${s.diasSinContar} d`}
                  </span>
                  <span className={celda("der", "text-sm font-semibold")}>
                    <span className="mr-1 text-[11px] font-normal text-taupe sm:hidden">En riesgo</span>
                    {money(s.valorEnRiesgo)}
                  </span>
                </div>
              );
            })}
          </Tabla>
        </section>
      )}
    </div>
  );
}

function Paso({ numero, titulo, hecho, children }: { numero: number; titulo: string; hecho: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="flex items-center gap-2">
        <span
          aria-hidden
          className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] transition-colors ${
            hecho ? "border-tinta bg-tinta text-crema" : "border-sand text-taupe"
          }`}
        >
          {numero}
        </span>
        <span className="eyebrow-cayla !text-taupe">{titulo}</span>
        <span className="sr-only">{hecho ? "(listo)" : "(falta)"}</span>
      </p>
      {children}
    </div>
  );
}

// ================================================================================================================
// 2 · Contar (ADR-0174). La pistola manda y el teclado corrige:
//  · «Suma por escaneo»: cada lectura (Enter de la pistola) suma 1 a esa prenda y se guarda sola, sin loader — es
//    un conteo de cientos de lecturas seguidas y un velo en cada una frenaría la pistola. Las lecturas se guardan
//    EN FILA (`crearColaEnSerie`): cada una manda el total, y la última en salir es la última en escribirse.
//  · «Escribir cantidad»: se elige la prenda, se escribe cuántas hay y se registra (con loader y aviso: es un botón
//    que guarda). Sirve para pilas grandes o sin pistola.
// La base (`conteo_contar`) siempre recibe la cantidad TOTAL de la prenda; lo que cambia es cómo se llega a ella.
// ================================================================================================================

type EstadoGuardado = { tipo: "quieto" } | { tipo: "guardando" } | { tipo: "guardado"; varianteId: string } | { tipo: "error"; mensaje: string };

function ConteoEnCurso({
  conteo,
  pendientes,
  catalogo,
  puedeCerrar,
  puedeCrearMarcas,
  categorias,
  colores,
  tallasPorCategoria,
  marcas,
  responsable,
}: {
  conteo: ConteoAbierto;
  pendientes: PrendaPendiente[];
  catalogo: VarianteConteo[];
  puedeCerrar: boolean;
  puedeCrearMarcas: boolean;
  categorias: { id: string; nombre: string }[];
  colores: { codigo: string; nombre: string }[];
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  marcas: CatalogoMarcas;
  responsable: ControlResponsable;
}) {
  const router = useRouter();
  const [modo, setModoEstado] = useState<ModoConteo>("suma");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<VarianteConteo | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState("");
  const [ultimaId, setUltimaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [guardado, setGuardado] = useState<EstadoGuardado>({ tipo: "quieto" });
  const [revisando, setRevisando] = useState(false);
  const [preparandoRevision, setPreparandoRevision] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const escaner = useRef<HTMLInputElement>(null);

  // Prendas creadas al vuelo en ESTA sesión de conteo — se suman a `catalogo` (que no se actualiza hasta el próximo
  // `router.refresh()`) para que un segundo escaneo de la misma prenda resuelva directo, sin esperar al servidor.
  const [catalogoNuevo, setCatalogoNuevo] = useState<VarianteConteo[]>([]);
  const [altaAbierta, setAltaAbierta] = useState(false);
  // La última marca y proveedor usados en un alta al vuelo de ESTE conteo: en un censo las prendas vienen por tandas de la
  // misma marca, y volver a elegirla 300 veces es justo lo que frenaría el conteo (ADR-0109).
  const [ultimaPareja, setUltimaPareja] = useState<{ marcaId: string; proveedorId: string } | null>(null);
  // Copia local de marcas y proveedores: el alta al vuelo se monta de nuevo en CADA escaneo, y lo que se creó en el anterior
  // (una marca nueva, un proveedor nuevo) tiene que seguir existiendo en pantalla — si no, `ultimaPareja` apuntaría a una
  // marca que el selector ya no conoce y mostraría «Marca» a secas.
  const [marcasLocal, setMarcasLocal] = useState(marcas);
  const catalogoCompleto = useMemo(() => [...catalogo, ...catalogoNuevo], [catalogo, catalogoNuevo]);

  // Lo anotado, en vivo. `cantidades` es lo que se ve (optimista); `confirmadas`, lo que la base ya aceptó — si una
  // escritura falla, la prenda vuelve a su última cifra confirmada. Refs además de estado: dos lecturas en el mismo
  // instante tienen que sumar sobre la cifra más nueva, no sobre la de la última vez que se pintó la pantalla.
  const inicial = useMemo(() => Object.fromEntries(conteo.items.map((i) => [i.varianteId, i.cantidadContada])), [conteo.items]);
  const cantidadesRef = useRef<Record<string, number>>(inicial);
  const confirmadasRef = useRef<Record<string, number>>(inicial);
  const [cantidades, setCantidades] = useState<Record<string, number>>(inicial);
  const [orden, setOrden] = useState<string[]>(() => conteo.items.map((i) => i.varianteId));
  const cola = useRef(crearColaEnSerie());

  // Cómo dibujar cada prenda contada: lo que ya venía del servidor, y lo que se va sumando desde el catálogo.
  const prendas = useMemo(() => {
    const m = new Map<string, PrendaVista>();
    for (const v of catalogoCompleto) m.set(v.varianteId, v);
    for (const i of conteo.items) m.set(i.varianteId, i);
    return m;
  }, [catalogoCompleto, conteo.items]);

  const contadas = useMemo(() => new Set(Object.keys(cantidades)), [cantidades]);
  const avance = avanceEnVivo(contadas, pendientes);
  const unidades = Object.values(cantidades).reduce((a, n) => a + n, 0);

  // No existe `localStorage` en el servidor: se lee tras montar (mismo patrón que la cola de Caja). Sin almacenamiento
  // (ventana privada, bloqueado), `leer` devuelve «suma», el modo por defecto.
  useEffect(() => {
    const id = window.setTimeout(() => setModoEstado(modoConteoValido(leerLocal<string | null>(CLAVE_MODO, null))), 0);
    return () => window.clearTimeout(id);
  }, []);

  function setModo(m: ModoConteo) {
    setModoEstado(m);
    setSeleccionada(null);
    setCantidadTexto("");
    setError(null);
    // Es una comodidad: si no se puede recordar, la próxima vez vuelve a «suma».
    guardarLocal(CLAVE_MODO, m);
    escaner.current?.focus();
  }

  const guardar = useCallback(
    (varianteId: string, n: number, { conLoader }: { conLoader: boolean }) => {
      cantidadesRef.current = { ...cantidadesRef.current, [varianteId]: n };
      setCantidades(cantidadesRef.current);
      setOrden((o) => tocar(o, varianteId));
      setGuardado({ tipo: "guardando" });
      const firma = responsable.firma();
      return cola.current
        .agregar(async () => {
          const consulta = createClient().rpc("conteo_contar", { p_conteo_id: conteo.id, p_variante_id: varianteId, p_cantidad_contada: n });
          // Suma por escaneo: sin loader (ADR-0149 lo permite con `x-espera: no`) — el estado de guardado se ve al pie de
          // la prenda. Escribir cantidad sí lo lleva: es un botón que guarda.
          const { error } = await firmar(conLoader ? consulta : consulta.setHeader("x-espera", "no"), firma);
          if (error) throw error;
        })
        .then(
          () => {
            confirmadasRef.current = { ...confirmadasRef.current, [varianteId]: n };
            if (cola.current.pendientes === 0) setGuardado({ tipo: "guardado", varianteId });
            return true;
          },
          (e: ErrorEscritura) => {
            // Contar una prenda es un paso del MISMO conteo: el éxito no vacía el combo. Un rechazo por el responsable
            // sí lo vacía y relee la lista.
            responsable.despues(e);
            const confirmada = confirmadasRef.current[varianteId];
            const siguen = { ...cantidadesRef.current };
            if (confirmada === undefined) delete siguen[varianteId];
            else siguen[varianteId] = confirmada;
            cantidadesRef.current = siguen;
            setCantidades(siguen);
            if (confirmada === undefined) setOrden((o) => o.filter((id) => id !== varianteId));
            const mensaje = traducirError(e, "guardar el conteo de esa prenda");
            setGuardado({ tipo: "error", mensaje });
            return false;
          }
        );
    },
    [conteo.id, responsable]
  );

  function leer(v: VarianteConteo) {
    setBusqueda("");
    setAltaAbierta(false);
    setError(null);
    if (!responsable.listo) {
      setError(responsable.motivo ?? "Elige quién cuenta antes de escanear.");
      return;
    }
    if (modo === "suma") {
      const n = nuevaCantidad(cantidadesRef.current[v.varianteId], { tipo: "suma", paso: 1 });
      if (n === null) return;
      setUltimaId(v.varianteId);
      void guardar(v.varianteId, n, { conLoader: false });
      escaner.current?.focus();
    } else {
      setSeleccionada(v);
      const previa = cantidadesRef.current[v.varianteId];
      setCantidadTexto(previa === undefined ? "" : String(previa));
    }
  }

  function ajustarUltima(accion: { tipo: "suma"; paso: number } | { tipo: "fijar"; valor: string }) {
    if (!ultimaId) return;
    if (!responsable.listo) {
      setError(responsable.motivo ?? "Elige quién cuenta.");
      return;
    }
    const n = nuevaCantidad(cantidadesRef.current[ultimaId], accion);
    if (n === null) {
      setError("La cantidad tiene que ser un número entero, 0 o más.");
      return;
    }
    if (n === cantidadesRef.current[ultimaId]) return;
    setError(null);
    void guardar(ultimaId, n, { conLoader: false });
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionada || !responsable.listo) return;
    const n = nuevaCantidad(cantidadesRef.current[seleccionada.varianteId], { tipo: "fijar", valor: cantidadTexto });
    if (n === null) {
      setError("La cantidad física tiene que ser un número entero, 0 o más.");
      return;
    }
    setRegistrando(true);
    setError(null);
    const ok = await guardar(seleccionada.varianteId, n, { conLoader: true });
    setRegistrando(false);
    if (!ok) return;
    avisar.exito(`${seleccionada.referencia} contada`, { detalle: `× ${n}` });
    setSeleccionada(null);
    setCantidadTexto("");
    escaner.current?.focus();
  }

  async function cancelarConteo() {
    if (!responsable.listo) {
      setError(responsable.motivo);
      setConfirmarCancelar(false);
      return;
    }
    setCancelando(true);
    await cola.current.vaciar();
    const { error } = await firmar(createClient().rpc("anular_conteo", { p_conteo_id: conteo.id }), responsable.firma());
    setCancelando(false);
    responsable.despues(error);
    if (error) {
      setError(traducirError(error, "cancelar el conteo"));
      setConfirmarCancelar(false);
      return;
    }
    avisar.exito("Conteo cancelado", { detalle: "El stock no se tocó." });
    router.refresh();
  }

  async function abrirRevision() {
    // Lo que se ve en la revisión sale de la base: primero se termina de escribir todo lo que está en fila.
    setPreparandoRevision(true);
    await cola.current.vaciar();
    setPreparandoRevision(false);
    setRevisando(true);
  }

  const coincidencias = useMemo(() => coincidenciasPorCodigo(busqueda, catalogoCompleto), [busqueda, catalogoCompleto]);

  // Nada coincide y hay algo escrito: puede ser una prenda de verdad que el catálogo no tiene. `>= 6` filtra el ruido
  // de las primeras letras de un código que sí existe (un código de barras real nunca es tan corto).
  const sinCoincidencias = busqueda.trim().length >= 6 && coincidencias.length === 0;

  function alEscribir(texto: string) {
    setBusqueda(texto);
    // Escribir cantidad: un código exacto selecciona directo, como siempre (misma regla que Vender, sin mayúsculas ni
    // acentos). Suma por escaneo NO: ahí cada lectura suma, y resolver a media escritura podía contar «BLU-1» cuando la
    // pistola todavía iba a mandar «BLU-10». Suma espera el Enter que manda la pistola al final de cada lectura.
    if (modo === "escribir") {
      const exacto = resolverCodigoV2(texto, catalogoCompleto);
      if (exacto) leer(exacto);
    }
  }

  function alEnter() {
    const exacto = resolverCodigoV2(busqueda, catalogoCompleto);
    if (exacto) return leer(exacto);
    if (coincidencias.length === 1) return leer(coincidencias[0]);
  }

  const ultima = ultimaId ? prendas.get(ultimaId) ?? null : null;
  const hayContadas = contadas.size > 0;
  const alcanceTexto = conteo.alcance === "categoria" && conteo.alcanceCategoriaNombre ? `solo ${conteo.alcanceCategoriaNombre}` : "todo el catálogo";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <section className="card-cayla space-y-5 p-5 sm:p-6" aria-label="Contar">
        {/* Cabecera del conteo abierto: número, dónde y qué, quién lo abrió, y el avance EN VIVO — cuántas de las
            prendas del alcance ya se tocaron. La barra no es decoración: quien cuenta sabe cuánto le falta. */}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="eyebrow-cayla !text-taupe">
              En curso · abierto {new Date(conteo.creadoEn).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" })}
            </p>
            <h2 className="font-display mt-1 text-2xl text-tinta">
              Conteo {conteo.numero} · {conteo.sububicacionNombre ?? "Toda la ubicación"}
            </h2>
            <p className="mt-0.5 text-sm text-taupe">
              {alcanceTexto.charAt(0).toUpperCase() + alcanceTexto.slice(1)} · abrió {conteo.abiertoPorNombre}
            </p>
          </div>
          <div className="w-full max-w-xs space-y-1.5 sm:w-72">
            <div className="flex items-baseline justify-between text-xs text-taupe">
              <span>
                {avance.contadas} de {avance.total} prendas contadas
              </span>
              <span className="font-semibold tabular-nums text-tinta">{avance.porcentaje} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-label="Avance del conteo" aria-valuenow={avance.porcentaje} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-tinta transition-[width] duration-300 ease-[var(--ease-cayla)]" style={{ width: `${avance.porcentaje}%` }} />
            </div>
            <div className="flex justify-between text-xs text-taupe">
              <span>{unidades} unidades anotadas</span>
              <span>{avance.pendientes.length} pendientes</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <SegmentoDeslizante
            etiqueta="Cómo se anota la cantidad"
            valor={modo}
            onCambio={(v) => setModo(modoConteoValido(v))}
            opciones={[
              { clave: "suma", etiqueta: "Suma por escaneo" },
              { clave: "escribir", etiqueta: "Escribir cantidad" },
            ]}
          />
          {/* Mientras se cuenta el combo NO se vacía al guardar: en un censo se escanean cientos seguidas. */}
          <ComboResponsable control={responsable} deshabilitado={registrando || cancelando} className="w-full sm:w-72" />
        </div>

        {!seleccionada && (
          <div className="space-y-2">
            <div className="relative">
              <ScanBarcode aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-taupe" />
              <input
                ref={escaner}
                autoFocus
                type="text"
                value={busqueda}
                onChange={(e) => alEscribir(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    alEnter();
                  }
                }}
                aria-label="Código de barras o código de la etiqueta"
                placeholder={modo === "suma" ? "Escanea: cada lectura suma 1 · o escribe el código y Enter" : "Escanea el código de barras o escribe el código…"}
                className="caja-cayla h-12 w-full pl-11 pr-3 text-base text-tinta outline-none placeholder:text-taupe"
              />
            </div>
            {coincidencias.length > 0 && (
              <div className="divide-y divide-sand overflow-hidden rounded-lg border border-sand bg-papel">
                {coincidencias.map((v) => (
                  <button
                    key={v.varianteId}
                    type="button"
                    onClick={() => leer(v)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-sand/40"
                  >
                    <span className="min-w-0 truncate">
                      {v.referencia} <span className="text-taupe">{detalle(v)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-taupe">
                      {v.sku || "sin código"}
                      {contadas.has(v.varianteId) && " · ya contada"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {sinCoincidencias && !altaAbierta && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ambar/35 bg-ambar/[0.07] px-3 py-2.5 text-sm">
                <span>
                  No se encontró «<b className="font-semibold">{busqueda.trim()}</b>» en el catálogo.
                </span>
                <button type="button" onClick={() => setAltaAbierta(true)} className="btn-cayla btn-secundario btn-chico">
                  Dar de alta esta prenda
                </button>
              </div>
            )}
            {altaAbierta && (
              <AltaAlVuelo
                codigoBarras={busqueda.trim()}
                categorias={categorias}
                colores={colores}
                tallasPorCategoria={tallasPorCategoria}
                marcas={marcasLocal}
                onListas={(l) => setMarcasLocal((prev) => ({ ...prev, ...l }))}
                puedeCrearMarcas={puedeCrearMarcas}
                parejaInicial={ultimaPareja}
                responsable={responsable}
                onCancelar={() => setAltaAbierta(false)}
                onCreada={(variante, pareja) => {
                  setUltimaPareja(pareja);
                  setCatalogoNuevo((prev) => [...prev, variante]);
                  setAltaAbierta(false);
                  leer(variante);
                }}
              />
            )}
          </div>
        )}

        {modo === "escribir" && seleccionada ? (
          <form onSubmit={registrar} className="space-y-3 rounded-2xl border border-sand bg-hueso/45 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[12rem] flex-1">
                <PrendaLinea prenda={seleccionada} />
              </div>
              <Stepper
                valor={cantidadTexto}
                onValor={setCantidadTexto}
                onPaso={(p) => setCantidadTexto(String(nuevaCantidad(Number(cantidadTexto) || 0, { tipo: "suma", paso: p }) ?? 0))}
                autoFocus
                etiqueta="Cantidad física"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={registrando || !responsable.listo} title={responsable.motivo ?? undefined} className="btn-cayla btn-primario">
                  {registrando ? "Guardando…" : "Registrar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSeleccionada(null);
                    setCantidadTexto("");
                    escaner.current?.focus();
                  }}
                  className="btn-cayla btn-secundario"
                >
                  Cancelar
                </button>
              </div>
            </div>
            <p className="text-xs text-taupe">
              {cantidades[seleccionada.varianteId] !== undefined
                ? `Ya se anotaron ${cantidades[seleccionada.varianteId]}. Lo que escribas reemplaza esa cifra.`
                : "Escribe lo que hay físicamente y presiona Enter."}
            </p>
          </form>
        ) : modo === "suma" && ultima ? (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-sand bg-hueso/45 p-4">
            <p className="eyebrow-cayla basis-full !text-taupe">Última prenda leída</p>
            <div className="min-w-[12rem] flex-1">
              <PrendaLinea prenda={ultima} />
            </div>
            <Stepper
              key={`${ultima.varianteId}-${cantidades[ultima.varianteId] ?? 0}`}
              valor={String(cantidades[ultima.varianteId] ?? 0)}
              onConfirmar={(texto) => ajustarUltima({ tipo: "fijar", valor: texto })}
              onPaso={(p) => ajustarUltima({ tipo: "suma", paso: p })}
              etiqueta="Cantidad de esta prenda"
            />
            <p className={`basis-full text-xs ${guardado.tipo === "error" ? "text-rojo" : guardado.tipo === "guardado" ? "text-verde" : "text-taupe"}`} role="status">
              {guardado.tipo === "guardando"
                ? "Guardando…"
                : guardado.tipo === "error"
                  ? `No se guardó: ${guardado.mensaje}`
                  : "✓ Guardado · vuelve a escanear para sumar, o corrige con − / +"}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-sand px-5 py-6 text-center">
            <p className="text-[15px] text-tinta">{modo === "suma" ? "Apunta la pistola y dispara" : "Escanea o busca una prenda"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-taupe">
              {modo === "suma"
                ? "Cada lectura suma 1 a esa prenda y se guarda sola. Si tienes una pila de 12 iguales, escanea una y corrige la cifra a 12."
                : "Elige la prenda, escribe cuántas hay y registra. Sirve para pilas grandes o si no hay pistola."}
            </p>
          </div>
        )}

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
          {confirmarCancelar ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-taupe">¿Cancelar? Se pierde lo contado; el stock no se toca.</span>
              <button type="button" onClick={cancelarConteo} disabled={cancelando || !responsable.listo} title={responsable.motivo ?? undefined} className="btn-cayla btn-peligro btn-chico">
                {cancelando ? "Cancelando…" : "Sí, cancelar"}
              </button>
              <button type="button" onClick={() => setConfirmarCancelar(false)} className="btn-cayla btn-sutil btn-chico">
                Seguir contando
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmarCancelar(true)} className="btn-cayla btn-sutil">
              Cancelar este conteo
            </button>
          )}
          <button type="button" disabled={!hayContadas || preparandoRevision} onClick={abrirRevision} className="btn-cayla btn-primario">
            {preparandoRevision ? "Guardando lo último…" : "Revisar y cerrar →"}
          </button>
          {!hayContadas && (
            <p className="basis-full text-right text-xs text-taupe">Un conteo sin prendas no se cierra. Si no se va a contar, cancélalo.</p>
          )}
        </div>
      </section>

      <div className="grid gap-4">
        <section className="card-cayla overflow-hidden" aria-labelledby="contadas">
          <div className="flex items-baseline justify-between gap-2 px-5 pb-2.5 pt-4">
            <h3 id="contadas" className="font-display text-lg text-tinta">
              Contadas
            </h3>
            <span className="text-xs text-taupe">
              {contadas.size} {contadas.size === 1 ? "prenda" : "prendas"} · {unidades} unidades
            </span>
          </div>
          {orden.length === 0 ? (
            <p className="border-t border-sand px-5 py-4 text-sm text-taupe">Todavía nada. Lo que cuentes aparece aquí, lo último arriba.</p>
          ) : (
            <ul className="scroll-cayla max-h-80 divide-y divide-sand overflow-y-auto border-t border-sand">
              {[...orden].reverse().map((id) => {
                const p = prendas.get(id);
                if (!p) return null;
                return (
                  <li key={id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <PrendaLinea prenda={p} />
                    </span>
                    <span className="font-display text-xl tabular-nums text-tinta">× {cantidades[id]}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const v = catalogoCompleto.find((x) => x.varianteId === id);
                        if (modo === "suma") setUltimaId(id);
                        else if (v) leer(v);
                      }}
                      className="btn-cayla btn-enlace text-xs"
                    >
                      Corregir
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card-cayla overflow-hidden" aria-labelledby="faltan">
          <div className="flex items-baseline justify-between gap-2 px-5 pb-1 pt-4">
            <h3 id="faltan" className="font-display text-lg text-tinta">
              Faltan por contar
            </h3>
            <span className="text-xs text-taupe">{avance.pendientes.length}</span>
          </div>
          {/* Variante A (Felipe, 2026-09-22): QUÉ falta, nunca CUÁNTAS dice el sistema — el conteo sigue a ciegas. */}
          <p className="px-5 pb-2.5 text-xs text-taupe">Qué buscar en el rack, sin cuántas dice el sistema. Al contarla, sale de aquí.</p>
          {avance.pendientes.length === 0 ? (
            <p className="border-t border-sand px-5 py-4 text-sm text-taupe">No falta nada: ya se contó todo el alcance.</p>
          ) : (
            <ul className="scroll-cayla max-h-80 divide-y divide-sand overflow-y-auto border-t border-sand">
              {avance.pendientes.map((p) => (
                <li key={p.varianteId} className="px-5 py-2.5">
                  <PrendaLinea prenda={p} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {revisando && (
        <RevisarCierre
          conteo={conteo}
          catalogo={catalogoCompleto}
          noContadas={avance.pendientes.length}
          puedeCerrar={puedeCerrar}
          responsable={responsable}
          onClose={() => setRevisando(false)}
        />
      )}
    </div>
  );
}

/** − cifra +. Con `onConfirmar` la cifra es editable y se guarda al salir o con Enter (suma); con `onValor` es un
 *  campo controlado del formulario (escribir). Objetivos de 44 px: se toca con el dedo, de pie, con la prenda en la mano. */
function Stepper({
  valor,
  onValor,
  onConfirmar,
  onPaso,
  etiqueta,
  autoFocus = false,
}: {
  valor: string;
  onValor?: (v: string) => void;
  onConfirmar?: (v: string) => void;
  onPaso: (paso: number) => void;
  etiqueta: string;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState(valor);
  const actual = onValor ? valor : texto;
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onPaso(-1)} aria-label="Una menos" className="grid h-11 w-11 place-items-center rounded-lg border border-sand bg-papel text-tinta transition-colors hover:bg-sand/45">
        <Minus aria-hidden className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        autoFocus={autoFocus}
        value={actual}
        aria-label={etiqueta}
        onChange={(e) => (onValor ? onValor(e.target.value) : setTexto(e.target.value))}
        onBlur={() => onConfirmar?.(texto)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onConfirmar) {
            e.preventDefault();
            onConfirmar(texto);
          }
        }}
        className="caja-cayla font-display h-12 w-20 text-center text-3xl tabular-nums text-tinta outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onPaso(1)} aria-label="Una más" className="grid h-11 w-11 place-items-center rounded-lg border border-sand bg-papel text-tinta transition-colors hover:bg-sand/45">
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

// ================================================================================================================
// 3 · Revisar y cerrar, con el modal del sistema (ADR-0136): antes dibujaba su propio `fixed inset-0`.
// ================================================================================================================

function RevisarCierre({
  conteo,
  catalogo,
  noContadas,
  puedeCerrar,
  responsable,
  onClose,
}: {
  conteo: ConteoAbierto;
  catalogo: VarianteConteo[];
  /** Pendientes del alcance: no se tocan al cerrar. Sale del mismo cálculo que la lista «Faltan por contar». */
  noContadas: number;
  puedeCerrar: boolean;
  responsable: ControlResponsable;
  onClose: () => void;
}) {
  const router = useRouter();
  const [varianza, setVarianza] = useState<Varianza | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const costoDe = new Map(catalogo.map((v) => [v.varianteId, v.costo ?? 0]));
    createClient()
      .rpc("previsualizar_cierre_conteo", { p_conteo_id: conteo.id })
      .then(({ data, error: errCarga }) => {
        if (!vigente) return;
        if (errCarga) {
          setError(traducirError(errCarga, "cargar la vista previa"));
          setCargando(false);
          return;
        }
        const filas = (data as FilaPrevisualizacion[]) ?? [];
        // cerrar_conteo() nunca toca lo que nadie contó — así que la diferencia neta que se muestra acá solo puede
        // venir de lo realmente contado. Mezclar "no_contado" convertiría cada variante nunca escaneada en "faltante
        // total", una alarma falsa sobre algo que el cierre real ni siquiera va a mirar.
        setVarianza(resumirVarianza(filas.filter((f) => f.origen === "contado"), costoDe));
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteo.id]);

  async function cerrar() {
    if (!responsable.listo) return;
    setCerrando(true);
    setError(null);
    const { error } = await firmar(createClient().rpc("cerrar_conteo", { p_conteo_id: conteo.id }), responsable.firma());
    setCerrando(false);
    responsable.despues(error);
    if (error) {
      setError(traducirError(error, "cerrar el conteo"));
      return;
    }
    avisar.exito(`Conteo ${conteo.numero} cerrado`, { detalle: "El stock ya quedó ajustado a lo contado." });
    // Al detalle del conteo recién cerrado: es lo primero que se quiere mirar (qué faltó, cuánto en soles).
    router.push(`/inventario/conteo/${conteo.id}`);
  }

  const conDiferencia = varianza ? varianza.lineas.filter((l) => l.diferencia !== 0) : [];
  // El código que se lee en la etiqueta, el mismo de toda la pantalla; la función solo da «el primer código de barras».
  const codigoDe = new Map(catalogo.map((v) => [v.varianteId, v.sku]));
  // Quien no ve el dinero recibe el catálogo sin costos (todos null): revisa el cierre en unidades.
  const veCosto = catalogo.some((v) => v.costo !== null);
  const unidadesNeto = varianza ? varianza.unidadesSobrantes - varianza.unidadesFaltantes : 0;
  const alcance = conteo.alcance === "categoria" && conteo.alcanceCategoriaNombre ? `solo ${conteo.alcanceCategoriaNombre}` : "todo el catálogo";

  return (
    <Modal
      titulo="Revisar antes de cerrar"
      subtitulo={`Conteo ${conteo.numero} · ${conteo.sububicacionNombre ?? "Toda la ubicación"} · ${alcance}`}
      onClose={onClose}
      ancho="max-w-lg"
      variante="papel"
    >
      {(salir) =>
        cargando ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-24 rounded-2xl bg-sand/60 motion-safe:animate-pulse" />
            <div className="h-16 rounded-2xl bg-sand/40 motion-safe:animate-pulse" />
          </div>
        ) : varianza ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sand bg-crema/60 p-4 text-center">
              {veCosto ? (
                <>
                  <p className="eyebrow-cayla !text-taupe">Diferencia neta al costo</p>
                  <p className={`font-display mt-1 text-4xl tabular-nums ${varianza.solesNeto < 0 ? "text-rojo-profundo" : varianza.solesNeto > 0 ? "text-verde" : "text-tinta"}`}>
                    {soles(varianza.solesNeto)}
                  </p>
                </>
              ) : (
                <>
                  {/* Sin permiso de ver el dinero (20260923193700): la diferencia en unidades, no en soles. */}
                  <p className="eyebrow-cayla !text-taupe">Diferencia neta</p>
                  <p className={`font-display mt-1 text-4xl tabular-nums ${unidadesNeto < 0 ? "text-rojo-profundo" : unidadesNeto > 0 ? "text-verde" : "text-tinta"}`}>
                    {unidadesNeto > 0 ? "+" : ""}
                    {unidadesNeto} {Math.abs(unidadesNeto) === 1 ? "unidad" : "unidades"}
                  </p>
                </>
              )}
              <p className="mt-1 text-xs text-taupe">
                {varianza.lineas.length} {varianza.lineas.length === 1 ? "prenda contada" : "prendas contadas"} · {varianza.unidadesFaltantes} de menos · {varianza.unidadesSobrantes} de más
                {veCosto && varianza.lineasSinCosto > 0 && ` · ${varianza.lineasSinCosto} sin costo cargado`}
              </p>
            </div>

            <p className="eyebrow-cayla !text-taupe">{conDiferencia.length === 0 ? "Todo lo contado coincide con el sistema" : `${conDiferencia.length} con diferencia`}</p>
            {conDiferencia.length > 0 && (
              <ul className="scroll-cayla max-h-60 divide-y divide-sand overflow-y-auto rounded-2xl border border-sand">
                {conDiferencia.map((l) => (
                  <li key={l.varianteId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-tinta">{l.referencia}</span>
                      <span className="block truncate text-xs text-taupe">{[codigoDe.get(l.varianteId) || l.codigo, l.talla, l.color].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {l.sistema} → {l.contada}{" "}
                      <b className={`font-semibold ${l.diferencia < 0 ? "text-rojo-profundo" : "text-verde"}`}>
                        ({l.diferencia > 0 ? "+" : ""}
                        {l.diferencia})
                      </b>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {noContadas > 0 && (
              <p className="rounded-lg border border-ambar/35 bg-ambar/[0.07] px-3 py-2.5 text-xs text-tinta">
                <b className="font-semibold text-ambar">
                  {noContadas} {noContadas === 1 ? "prenda" : "prendas"} con stock no se {noContadas === 1 ? "contó" : "contaron"}.
                </b>{" "}
                No se tocan al cerrar: siguen con la cifra del sistema.
              </p>
            )}

            {!puedeCerrar && <p className="text-xs text-rojo">Solo un líder o la terminal administrativa puede cerrar el conteo.</p>}
            {error && <p className="text-sm text-rojo">{error}</p>}

            {/* Cerrar aplica lo contado al stock: quien cierra se elige aquí mismo, encima del botón (ADR-0161). */}
            {puedeCerrar && <ComboResponsable control={responsable} deshabilitado={cerrando} />}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={salir} className="btn-cayla btn-secundario">
                Volver a contar
              </button>
              <button
                type="button"
                onClick={cerrar}
                disabled={cerrando || !puedeCerrar || !responsable.listo}
                title={responsable.motivo ?? undefined}
                className="btn-cayla btn-primario"
              >
                {cerrando ? "Cerrando…" : "Cerrar y ajustar el stock"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-rojo">{error}</p>
        )
      }
    </Modal>
  );
}

function AltaAlVuelo({
  codigoBarras,
  categorias,
  colores,
  tallasPorCategoria,
  marcas,
  onListas,
  puedeCrearMarcas,
  parejaInicial,
  onCancelar,
  onCreada,
  responsable,
}: {
  codigoBarras: string;
  categorias: { id: string; nombre: string }[];
  colores: { codigo: string; nombre: string }[];
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  marcas: CatalogoMarcas;
  onListas: (listas: Pick<CatalogoMarcas, "marcas" | "proveedores" | "vinculos">) => void;
  puedeCrearMarcas: boolean;
  parejaInicial: { marcaId: string; proveedorId: string } | null;
  onCancelar: () => void;
  onCreada: (variante: VarianteConteo, pareja: { marcaId: string; proveedorId: string }) => void;
  responsable: ControlResponsable;
}) {
  const [referencia, setReferencia] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [marcaId, setMarcaId] = useState(parejaInicial?.marcaId ?? "");
  const [proveedorId, setProveedorId] = useState(parejaInicial?.proveedorId ?? "");
  const [tallaId, setTallaId] = useState("");
  const [colorCodigo, setColorCodigo] = useState("");
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Talla no tiene <label> propio con htmlFor (Desplegable no es un <select> nativo): se compone
  // Campo + Desplegable a mano en vez de CampoSelect porque este último no expone `deshabilitado`
  // (mismo patrón que PrendaSinRegistrarModal.tsx y MovimientoCajaModal.tsx).
  const idEtiquetaTalla = useId();

  const tallas = tallasPorCategoria[categoriaId] ?? [];

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!referencia.trim() || !categoriaId) {
      setError("Referencia y categoría son obligatorias.");
      return;
    }
    if (!marcaId || !proveedorId) {
      setError("Elige la marca y el proveedor de la prenda.");
      return;
    }
    if (!responsable.listo) return;
    setGuardando(true);
    setError(null);
    const { data, error } = await firmar(createClient().rpc("censo_crear_variante", {
      p_referencia: referencia.trim(),
      p_categoria_id: categoriaId,
      p_codigo_barras: codigoBarras,
      p_talla_id: tallaId || undefined,
      p_color_codigo: colorCodigo || undefined,
      p_costo: costo ? Number(costo) : 0,
      p_precio: precio ? Number(precio) : 0,
      p_marca_id: marcaId,
      p_proveedor_id: proveedorId,
    }), responsable.firma());
    setGuardando(false);
    // Igual que contar: el alta al vuelo es un paso del conteo (enseguida se cuenta esa prenda), así que el éxito
    // no vacía el combo; un rechazo por el responsable sí.
    if (error) responsable.despues(error);
    const fila = data?.[0];
    if (error || !fila) {
      setError(traducirError(error, "dar de alta esta prenda"));
      return;
    }
    // Dos casos con consecuencias distintas y la colaboradora tiene que saber cuál fue:
    //  · reutilizado: ya existía una prenda con ese nombre (aprobada); esto solo le SUMÓ una talla
    //    o un color, con el precio y el costo de sus hermanas. No queda nada por revisar.
    //  · nueva: nace 'pendiente' hasta que un Líder la revise, pero ya se puede contar.
    if (fila.reutilizado) {
      avisar.exito(`${fila.referencia}: talla o color sumado`, { detalle: "Ya existía esa prenda; se le agregó esta variante. Ya se puede contar." });
    } else {
      avisar.exito(`${fila.referencia} dada de alta`, { detalle: "Pendiente de que un Líder la revise — ya se puede contar." });
    }
    onCreada({
      varianteId: fila.variante_id,
      // `censo_crear_variante` devuelve el `sku`, y una prenda nueva nace sin él: se muestra el código que se escaneó.
      sku: codigoDePrendaNueva(fila),
      referencia: fila.referencia,
      talla: fila.talla,
      color: fila.color,
      costo: fila.costo === null ? null : Number(fila.costo),
      codigosBarras: [fila.codigo_barras],
    }, { marcaId, proveedorId });
  }

  return (
    <form onSubmit={crear} className="mt-3 space-y-3 rounded-xl border border-tinta/15 p-4">
      <p className="text-sm text-tinta">
        Dar de alta <span className="font-mono text-[11px] text-taupe">{codigoBarras}</span>
      </p>
      <CampoTexto etiqueta="Referencia (nombre de la prenda)" value={referencia} onChange={(e) => setReferencia(e.target.value)} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <CampoSelect
          etiqueta="Categoría"
          valor={categoriaId}
          onValor={(v) => {
            setCategoriaId(v);
            setTallaId("");
          }}
          opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
          marcador="Elige…"
        />
        <Campo etiqueta="Talla (si aplica)" idEtiqueta={idEtiquetaTalla}>
          <Desplegable
            valor={tallaId}
            onValor={setTallaId}
            opciones={[{ valor: "", texto: "Sin talla" }, ...tallas.map((t) => ({ valor: t.id, texto: t.texto }))]}
            idEtiqueta={idEtiquetaTalla}
            deshabilitado={!categoriaId}
          />
        </Campo>
      </div>
      {categoriaId && (
        <div className="space-y-1.5">
          <p className="label-cayla text-[11px] text-tinta/70">Marca y proveedor</p>
          <ElegirMarcaProveedor
            marcas={marcas.marcas}
            proveedores={marcas.proveedores}
            vinculos={marcas.vinculos}
            usosCategoria={marcas.parejasPorCategoria[categoriaId] ?? []}
            categoriaNombre={categorias.find((c) => c.id === categoriaId)?.nombre}
            marcaId={marcaId}
            proveedorId={proveedorId}
            onElegir={(m, p) => {
              setMarcaId(m);
              setProveedorId(p);
            }}
            onLimpiar={() => {
              setMarcaId("");
              setProveedorId("");
            }}
            onListas={onListas}
            puedeCrear={puedeCrearMarcas}
          />
        </div>
      )}
      <CampoSelect
        etiqueta="Color (si aplica)"
        valor={colorCodigo}
        onValor={setColorCodigo}
        opciones={[{ valor: "", texto: "Sin color" }, ...colores.map((c) => ({ valor: c.codigo, texto: c.nombre }))]}
      />
      <div className="grid grid-cols-2 gap-3">
        <CampoMonto etiqueta="Costo (si lo sabes)" value={costo} onChange={(e) => setCosto(e.target.value)} />
        <CampoMonto etiqueta="Precio de venta (si lo sabes)" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </div>
      <p className="text-xs text-taupe">Un Líder va a revisar esto después — si no sabes el costo o el precio, déjalo en 0 y los completa él.</p>
      {error && <p className="text-sm text-rojo">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={guardando || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
          {guardando ? "Creando…" : "Crear y contar"}
        </button>
        <button type="button" onClick={onCancelar} className={botonCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
