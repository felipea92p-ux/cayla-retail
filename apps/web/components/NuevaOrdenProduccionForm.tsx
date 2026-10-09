"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoSelect, CampoTexto, Desplegable, Segmentado, Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { Modal, campoEtiqueta, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import type { ModeloProducible, VarianteDeModelo } from "@/lib/produccion";
import type { DecisionProduccion } from "@/lib/decision-produccion";
import type { Tolerado } from "@/lib/resultado";
import { compararTallas } from "@/lib/tallas";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { ETIQUETA_BANDA } from "@/lib/resumen-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MotorEnProduccion } from "@/components/motor-demanda/MotorEnProduccion";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { DIAS_OBJETIVO_PRODUCCION, OPCIONES_DIAS_OBJETIVO, analizarInsumos, costoMaterialesPorPrenda, sugerirCurva } from "@/lib/produccion-decision-reglas";
import { costoUnitario, semaforoMargen, type Semaforo } from "@/lib/produccion-reglas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ModeloNuevoCampos } from "@/components/ModeloNuevoCampos";
import { sugerirNotaDeOrden } from "@/lib/sugerencias-orden-produccion";
import type { ColorAlta } from "@/lib/alta-producto";
import {
  TEXTO_FUNCION_AUSENTE,
  camposDeGuiaOrden,
  celdasDelBorrador,
  leerErrorModeloNuevo,
  ordenarTallas,
  nombreDelModelo,
  paramsRpcModeloNuevo,
  precioDelBorrador,
  problemasDelModelo,
  resumenCantidades,
  tallasHabituales,
  type BorradorModelo,
  type ErrorModeloNuevo,
  type VocabularioModeloNuevo,
} from "@/lib/modelo-nuevo-reglas";

// Abrir una orden (abrir_produccion). Lo que se decide acá: qué modelo, cuántas
// por talla-color y el costo ESTIMADO. El costo real se corrige al cerrar.
//
// F5 (ADR-0133): para el líder, «Nueva orden» aconseja ANTES de abrir: la curva sugerida por talla y color (ritmo de venta y stock de TODA la red, con las
// mismas reglas de Inventario), si alcanza la tela y los avíos (con el consumo real medido de las órdenes cerradas del modelo, D-D) y cuánto costará cada
// prenda. Son consejos, no órdenes: las cantidades siguen siendo del líder. Sin datos, el formulario es el de siempre.
//
// ADR-0361: el Taller crea modelos nuevos como parte normal de su trabajo (una Muestra desarrolla un modelo que todavía no existe), así que «Modelo nuevo» se
// arma ACÁ: nombre, categoría, tallas y colores del vocabulario y precio, y `abrir_produccion_con_modelo_nuevo` crea el modelo y abre la orden en UNA
// transacción y con UN token. El modelo nuevo se trata como cualquier otro: se arma un modelo VIRTUAL con las celdas del borrador y la matriz, el costo por
// prenda y el margen no saben la diferencia. Quien prefiera cargarlo completo (con fotos) lo crea en Productos y vuelve (`hrefAltaDesdeProduccion`).
// El margen y el semáforo los ve el líder aunque la lectura de la red falle, y un modelo sin precio lo dice.
// La guía de foco (ADR-0284) sale de `camposDeGuiaOrden`, que coincide con lo que la base rechaza (lo prueba `modelo-nuevo-reglas.test.ts`).
//
// El token de idempotencia nace con el formulario (useRef): si el Taller
// pierde la red a mitad del clic y reintenta, la base devuelve la misma orden
// en vez de abrir dos. Mismo mecanismo que `registrar_venta` (p_token).

type Tipo = "produccion" | "muestra";
const TIPOS = [
  { valor: "produccion", texto: "Producción" },
  { valor: "muestra", texto: "Muestra" },
] as const;

type ModoModelo = "existe" | "nuevo";
const MODOS = [
  { valor: "existe", texto: "Ya existe" },
  { valor: "nuevo", texto: "Modelo nuevo" },
] as const;

const CHIP_SEMAFORO: Record<Semaforo["tono"], { tono: "verde" | "ambar" | "rojo"; texto: string }> = {
  gana: { tono: "verde", texto: "Gana" },
  filo: { tono: "ambar", texto: "Al filo" },
  pierde: { tono: "rojo", texto: "Pierde" },
};

function soles(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function NuevaOrdenProduccionForm({
  tallerId,
  modelos,
  decision,
  productoInicialId = null,
  tipoInicial = "produccion",
  puedeEditarCatalogo = false,
  vocabulario = null,
  onClose,
}: {
  tallerId: string;
  modelos: ModeloProducible[];
  /** Solo el líder recibe la decisión; `null` = el formulario de siempre. */
  decision: Tolerado<DecisionProduccion> | null;
  /** Modelo que llega elegido desde el Resumen; si no existe, se usa el primero. */
  productoInicialId?: string | null;
  /** Con qué tipo se abre (al volver de crear un modelo nuevo se conserva el que la persona había elegido). */
  tipoInicial?: Tipo;
  /** Puede crear el modelo que falta y agregarle tallas o colores (`fn_puede_editar_catalogo`); si no, ve a quién pedírselo. */
  puedeEditarCatalogo?: boolean;
  /** Tallas, colores y categorías que ofrece «Modelo nuevo» (dato secundario: si no se pudo leer, «Modelo nuevo» lo dice y el resto sigue igual). */
  vocabulario?: Tolerado<VocabularioModeloNuevo> | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());
  const [tipo, setTipo] = useState<Tipo>(tipoInicial);
  const [productoId, setProductoId] = useState(modelos.find((m) => m.productoId === productoInicialId)?.productoId ?? modelos[0]?.productoId ?? "");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  // Modelo nuevo (ADR-0361): sin modelos en el catálogo, el primero nace acá.
  const [modoModelo, setModoModelo] = useState<ModoModelo>(modelos.length === 0 ? "nuevo" : "existe");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [categoriaNuevaId, setCategoriaNuevaId] = useState("");
  const [tallasNuevas, setTallasNuevas] = useState<string[]>([]);
  const [coloresNuevos, setColoresNuevos] = useState<string[]>([]);
  const [coloresCreados, setColoresCreados] = useState<ColorAlta[]>([]);
  const [precioNuevo, setPrecioNuevo] = useState("");
  // La base dijo «ya existe un modelo así» (o «casi igual»): se muestra con lo que se puede hacer, no como un error cualquiera.
  const [choque, setChoque] = useState<Extract<ErrorModeloNuevo, { tipo: "nombre_duplicado" | "nombre_casi_igual" }> | null>(null);
  const [tela, setTela] = useState("");
  const [avios, setAvios] = useState("");
  const [maquila, setMaquila] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  // Responsable (ADR-0161/0162): la orden la abre quien se elige en el combo (lista del Taller, la sede activa).
  const responsable = useResponsable();
  const [diasObjetivo, setDiasObjetivo] = useState<number>(DIAS_OBJETIVO_PRODUCCION);

  const modeloExistente = useMemo(() => modelos.find((m) => m.productoId === productoId) ?? null, [modelos, productoId]);

  // ----- Modelo nuevo: el borrador, sus celdas y un modelo VIRTUAL para que la matriz, el costo por prenda y el margen lo traten como a cualquier otro -----
  const esNuevo = modoModelo === "nuevo";
  const vocab = vocabulario?.datos ?? null;
  const categoriaNueva = useMemo(() => vocab?.categorias.find((cat) => cat.id === categoriaNuevaId) ?? null, [vocab, categoriaNuevaId]);
  const coloresDisponibles = useMemo<ColorAlta[]>(() => {
    const vistos = new Set<string>();
    return [...(vocab?.colores ?? []), ...coloresCreados].filter((col) => !vistos.has(col.codigo) && vistos.add(col.codigo));
  }, [vocab, coloresCreados]);
  const borrador = useMemo<BorradorModelo>(
    () => ({ nombre: nombreNuevo, categoria: categoriaNueva, tallaIds: tallasNuevas, colorCodigos: coloresNuevos, precio: precioNuevo, esMuestra: tipo === "muestra", cantidades }),
    [nombreNuevo, categoriaNueva, tallasNuevas, coloresNuevos, precioNuevo, tipo, cantidades]
  );
  const celdasNuevas = useMemo(() => celdasDelBorrador(borrador, coloresDisponibles), [borrador, coloresDisponibles]);
  const resumenNuevo = useMemo(() => resumenCantidades(borrador, celdasNuevas), [borrador, celdasNuevas]);
  const modeloVirtual = useMemo<ModeloProducible | null>(() => {
    if (!esNuevo) return null;
    const precioBorrador = precioDelBorrador(borrador);
    return {
      productoId: "__nuevo",
      referencia: nombreDelModelo(borrador) || "Modelo nuevo",
      categoria: categoriaNueva?.nombre ?? null,
      categoriaId: categoriaNueva?.id ?? null,
      variantes: celdasNuevas.map((celda) => {
        const color = coloresDisponibles.find((col) => col.codigo === celda.color);
        return {
          varianteId: celda.clave,
          sku: "",
          talla: categoriaNueva?.tallas.find((t) => t.id === celda.tallaId)?.valor ?? null,
          color: color?.nombre ?? null,
          colorHex: color?.hex ?? null,
          precio: Number.isFinite(precioBorrador) ? precioBorrador : 0,
        };
      }),
    };
  }, [esNuevo, borrador, categoriaNueva, celdasNuevas, coloresDisponibles]);
  const modelo = esNuevo ? modeloVirtual : modeloExistente;
  // Sin categoría y sin tallas no hay matriz que dibujar (la celda única «Sin color» de un borrador vacío confundiría): se explica qué falta.
  const mostrarMatriz = !esNuevo || (categoriaNueva !== null && ordenarTallas(categoriaNueva, tallasNuevas).length > 0);

  // Matriz color × talla, como la grilla de variantes de Shopify: una fila
  // por color, una columna por talla, y en cada celda cuántas van. Solo
  // existen las celdas que el catálogo ya tiene como variante — Producción
  // no inventa tallas ni colores (decisión con Felipe, 2026-09-15: las
  // variantes nacen en Productos, con su código y su precio, nunca al vuelo desde
  // una orden; en V1 sí pasaba y dejaba colores duplicados y prendas sin precio).
  const matriz = useMemo(() => {
    const variantes = modelo?.variantes ?? [];
    const tallas = [...new Set(variantes.map((v) => v.talla ?? "Única"))].sort(compararTallas);
    const filas = new Map<string, { hex: string | null; celdas: Map<string, VarianteDeModelo> }>();
    for (const v of variantes) {
      const color = v.color ?? "Sin color";
      const fila = filas.get(color) ?? { hex: v.colorHex, celdas: new Map() };
      fila.celdas.set(v.talla ?? "Única", v);
      filas.set(color, fila);
    }
    return { tallas, filas: [...filas.entries()] };
  }, [modelo]);

  const lineas = esNuevo
    ? []
    : (modelo?.variantes ?? [])
        .map((v) => ({ variante_id: v.varianteId, cantidad: Math.floor(Number(cantidades[v.varianteId]) || 0) }))
        .filter((l) => l.cantidad > 0);
  // Un modelo nuevo lee las cantidades como las lee la base (enteros de 0 a 9999); uno existente, como siempre.
  const total = esNuevo ? resumenNuevo.total : lineas.reduce((s, l) => s + l.cantidad, 0);
  const costoTotal = (Number(tela) || 0) + (Number(avios) || 0) + (Number(maquila) || 0);
  // Como lo calcula la base (`producciones.costo_unitario`): costos ÷ prendas, a 2 decimales. Una sola fórmula en `produccion-reglas.ts`.
  const unitario = costoUnitario(Number(tela) || 0, Number(avios) || 0, Number(maquila) || 0, total);
  const precio = Math.max(0, ...(modelo?.variantes ?? []).map((v) => v.precio));

  // ----- La decisión (solo líder) -----
  const datos = decision?.datos ?? null;
  const demandaPorVariante = useMemo(() => new Map((datos?.demanda ?? []).map((d) => [d.varianteId, d])), [datos]);
  const enProduccion = useMemo(() => new Map(Object.entries(datos?.enProduccion ?? {})), [datos]);
  const curva = useMemo(() => sugerirCurva(modelo?.variantes ?? [], demandaPorVariante, enProduccion, diasObjetivo), [modelo, demandaPorVariante, enProduccion, diasObjetivo]);
  // El motor de demanda (ADR-0347) se compara con la curva de arriba sobre el MISMO disponible: solo cambia el ritmo.
  const disponibleDeVariante = useMemo(
    () => (id: string) => curva.porVariante.get(id)?.disponible ?? (enProduccion.get(id) ?? 0),
    [curva, enProduccion]
  );
  const rendimiento = datos && modelo ? (datos.rendimientoPorModelo[modelo.productoId] ?? []) : [];
  const saldos = useMemo(() => new Map((datos?.insumos ?? []).map((i) => [i.insumoId, i])), [datos]);
  const analisis = analizarInsumos(rendimiento, total, saldos);
  const materialesPorPrenda = costoMaterialesPorPrenda(rendimiento, (id) => saldos.get(id)?.costoUnitario ?? null);
  const materialesPorTipo = { tela: 0, avio: 0 };
  for (const r of rendimiento) materialesPorTipo[r.tipo] += r.porPrenda * total * (saldos.get(r.insumoId)?.costoUnitario ?? 0);
  // El margen es del líder (`decision` solo le llega a él), con o sin lectura de la red: si la red falla, el margen no se esconde.
  const verMargen = decision !== null;
  const semaforo = semaforoMargen(precio, unitario);

  // La guía de foco (ADR-0284): qué está hecho, qué sigue y qué falta. Sale de la misma validación que apaga el botón.
  const guia = useGuiaCampos(camposDeGuiaOrden({ esNuevo, hayModelo: modeloExistente !== null, borrador, celdas: celdasNuevas, totalExistente: total }));

  function usarCurva() {
    const nuevas: Record<string, string> = {};
    for (const [id, s] of curva.porVariante) if (s.sugerido > 0) nuevas[id] = String(s.sugerido);
    setCantidades(nuevas);
  }
  function usarEstimadoDeMateriales() {
    setTela(materialesPorTipo.tela > 0 ? materialesPorTipo.tela.toFixed(2) : "");
    setAvios(materialesPorTipo.avio > 0 ? materialesPorTipo.avio.toFixed(2) : "");
  }

  function cambiarModelo(id: string) {
    setProductoId(id);
    setCantidades({});
  }
  // Las cantidades de un modelo nuevo van por celda del borrador y las de uno existente por variante: al cambiar de modo no se arrastran.
  function cambiarModo(m: ModoModelo) {
    if (m === modoModelo) return;
    setModoModelo(m);
    setCantidades({});
    setChoque(null);
  }
  function cambiarCategoria(id: string) {
    setCategoriaNuevaId(id);
    setTallasNuevas(tallasHabituales(vocab?.categorias.find((cat) => cat.id === id) ?? null));
    setCantidades({});
  }
  function alternarColor(codigo: string) {
    setColoresNuevos((prev) => (prev.includes(codigo) ? prev.filter((x) => x !== codigo) : [...prev, codigo]));
  }
  function colorCreado(color: ColorAlta) {
    setColoresCreados((prev) => (prev.some((x) => x.codigo === color.codigo) ? prev : [...prev, color]));
    setColoresNuevos((prev) => (prev.includes(color.codigo) ? prev : [...prev, color.codigo]));
  }
  /** «Ya existe un modelo con ese nombre»: se pasa a ese modelo (las cantidades se escriben otra vez: sus celdas son otras). */
  function usarExistente(id: string) {
    setModoModelo("existe");
    setProductoId(id);
    setCantidades({});
    setChoque(null);
  }

  /** Modelo nuevo + orden en UNA llamada. `confirmoDistinto`: la persona dijo que un nombre casi igual es otro modelo de verdad. */
  async function abrirConModeloNuevo(confirmoDistinto: boolean) {
    const faltas = problemasDelModelo(borrador, celdasNuevas);
    if (faltas.length > 0) {
      avisar.error(faltas[0].texto);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setChoque(null);
    setCargando(true);
    const { error } = await firmar(
      createClient().rpc(
        "abrir_produccion_con_modelo_nuevo",
        paramsRpcModeloNuevo({
          ubicacionId: tallerId,
          borrador,
          celdas: celdasNuevas,
          costos: { tela, avios, maquila },
          fechaEntrega,
          nota,
          confirmoDistinto,
          token: token.current,
        })
      ),
      responsable.firma()
    );
    responsable.despues(error);
    setCargando(false);
    if (error) {
      const lectura = leerErrorModeloNuevo(error);
      if (lectura.tipo === "nombre_duplicado" || lectura.tipo === "nombre_casi_igual") {
        setChoque(lectura);
        return;
      }
      avisar.error(lectura.tipo === "funcion_ausente" ? TEXTO_FUNCION_AUSENTE : traducirError(error, "abrir la orden"));
      return;
    }
    avisar.exito(`Orden de ${nombreDelModelo(borrador)} abierta`, { detalle: `Modelo nuevo · ${resumenNuevo.total} prendas · ${tipo === "muestra" ? "muestra" : "producción"}` });
    router.refresh();
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (esNuevo) {
      await abrirConModeloNuevo(false);
      return;
    }
    if (!modelo) {
      avisar.error("Elige el modelo que se va a producir.");
      return;
    }
    if (lineas.length === 0) {
      avisar.error("Indica cuántas prendas de al menos una talla o color.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const { error } = await firmar(createClient().rpc("abrir_produccion", {
      p_ubicacion_id: tallerId,
      p_producto_id: modelo.productoId,
      p_lineas: lineas,
      p_costo_tela: Number(tela) || 0,
      p_costo_avios: Number(avios) || 0,
      p_costo_maquila: Number(maquila) || 0,
      p_es_muestra: tipo === "muestra",
      p_fecha_entrega: fechaEntrega || undefined,
      p_nota: nota.trim() || undefined,
      p_token: token.current,
    }), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "abrir la orden"));
      return;
    }
    avisar.exito(`Orden de ${modelo.referencia} abierta`, { detalle: `${total} prendas · ${tipo === "muestra" ? "muestra" : "producción"}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Nueva orden de producción" onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmentado<Tipo>
            etiqueta="Tipo"
            valor={tipo}
            onValor={setTipo}
            opciones={TIPOS}
            pie={tipo === "muestra" ? "Desarrollar el modelo: patrón y prototipo. No entra al stock." : "Fabricar el lote. Al cerrar entra al stock del Taller."}
          />
          {modelos.length > 0 ? (
            <Segmentado<ModoModelo>
              etiqueta="Modelo"
              valor={modoModelo}
              onValor={cambiarModo}
              opciones={MODOS}
              pie={esNuevo ? "Se crea en el catálogo al abrir la orden." : "Uno que ya está en el catálogo."}
            />
          ) : (
            <div className="space-y-1.5">
              <span className={campoEtiqueta}>Modelo</span>
              <p className="text-sm text-tinta/70">Todavía no hay modelos en el catálogo: este será el primero.</p>
            </div>
          )}
        </div>

        {esNuevo ? (
          <ModeloNuevoCampos
            guia={guia}
            vocabulario={vocab}
            fallo={vocabulario?.fallo ?? null}
            colores={coloresDisponibles}
            nombre={nombreNuevo}
            onNombre={(v) => {
              setNombreNuevo(v);
              setChoque(null);
            }}
            categoria={categoriaNueva}
            onCategoria={cambiarCategoria}
            tallaIds={tallasNuevas}
            onTallas={setTallasNuevas}
            colorCodigos={coloresNuevos}
            onAlternarColor={alternarColor}
            onColorCreado={colorCreado}
            precio={precioNuevo}
            onPrecio={setPrecioNuevo}
            esMuestra={tipo === "muestra"}
            puedeEditarCatalogo={puedeEditarCatalogo}
            tipo={tipo}
          />
        ) : (
          <CampoGuiado id="modelo" guia={guia}>
            <CampoSelect
              etiqueta={guia.etiqueta("modelo", "Modelo")}
              valor={productoId}
              onValor={(v) => cambiarModelo(v)}
              opciones={modelos.map((m) => ({ valor: m.productoId, texto: `${m.referencia}${m.categoria ? ` · ${m.categoria}` : ""}` }))}
            />
          </CampoGuiado>
        )}

        {modelo && (
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas por talla y color")}</span>
            {mostrarMatriz ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-tinta/65">
                    <th className="pb-1.5 pr-3 text-left font-normal">Color</th>
                    {matriz.tallas.map((t) => (
                      <th key={t} className="label-cayla pb-1.5 text-center text-[11px]">
                        {t}
                      </th>
                    ))}
                    <th className="label-cayla pb-1.5 pl-3 text-right text-[11px]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tinta/10">
                  {matriz.filas.map(([color, fila]) => {
                    const totalFila = [...fila.celdas.values()].reduce((s, v) => s + (Math.floor(Number(cantidades[v.varianteId])) || 0), 0);
                    return (
                      <tr key={color}>
                        <td className="py-1.5 pr-3 text-tinta/80">
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            {fila.hex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-tinta/15" style={{ background: fila.hex }} />}
                            {color}
                          </span>
                        </td>
                        {matriz.tallas.map((t) => {
                          const v = fila.celdas.get(t);
                          if (!v) {
                            // El catálogo no tiene esta combinación: no hay variante a la que sumarle stock.
                            return (
                              <td key={t} className="py-1.5 text-center text-tinta/30" title="No existe esta talla en este color">
                                —
                              </td>
                            );
                          }
                          const valor = cantidades[v.varianteId] ?? "";
                          const activa = (Number(valor) || 0) > 0;
                          return (
                            <td key={t} className="px-0.5 py-1.5 text-center">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                placeholder={String(curva.porVariante.get(v.varianteId)?.sugerido || 0)}
                                aria-label={`${color} ${t}`}
                                title={[v.sku, curva.porVariante.get(v.varianteId)?.motivo].filter(Boolean).join(" · ")}
                                value={valor}
                                onChange={(e) => setCantidades((c) => ({ ...c, [v.varianteId]: e.target.value }))}
                                className={`w-14 rounded-md border bg-transparent px-1.5 py-1 text-center text-sm tabular-nums text-tinta outline-none transition-colors placeholder:text-tinta/30 focus:border-rojo ${
                                  activa ? "border-rojo/60 bg-rojo/5" : "border-tinta/15"
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="py-1.5 pl-3 text-right tabular-nums text-tinta/80">{totalFila > 0 ? totalFila : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            ) : (
              <Aviso tono="info" chico>
                Elige la categoría y las tallas, y aquí aparece la matriz: una fila por color y una columna por talla.
              </Aviso>
            )}
            {!esNuevo && (
              <p className="text-xs text-tinta/65">
                ¿Falta una talla o un color? Se agrega en{" "}
                {puedeEditarCatalogo ? (
                  <Link href={`/productos/${modelo.productoId}/editar`} className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                    Editar producto
                  </Link>
                ) : (
                  "Productos (pídeselo a quien edita el catálogo)"
                )}
                , no desde la orden.
              </p>
            )}
          </CampoGuiado>
        )}

        {!esNuevo && decision?.fallo && <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">{decision.fallo}</p>}

        {datos && modelo && !esNuevo && (
          <section aria-label="Lo que dice la red" className="space-y-3 rounded-2xl border border-sand bg-crema p-3.5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className={campoEtiqueta}>Curva sugerida por la red</p>
                <p className="mt-0.5 text-xs text-tinta/65">
                  Ritmo de venta y stock de todas las tiendas, con lo que ya hay en el Taller, viene en camino o se está fabricando.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-tinta/70">
                  Cubrir
                  <Desplegable
                    valor={String(diasObjetivo)}
                    onValor={(v) => setDiasObjetivo(Number(v))}
                    opciones={OPCIONES_DIAS_OBJETIVO.map((d) => ({ valor: String(d), texto: `${d} días` }))}
                    etiquetaAccesible="Días de venta a cubrir"
                    forma="pastilla"
                  />
                </label>
                <button
                  type="button"
                  onClick={usarCurva}
                  disabled={curva.total === 0}
                  className="h-8 rounded-md border border-tinta/25 px-3 text-[13px] text-tinta outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-tinta/25"
                >
                  {curva.total > 0 ? `Usar la sugerencia · ${curva.total} prendas` : "Nada que fabricar"}
                </button>
              </div>
            </div>
            {curva.porVariante.size === 0 ? (
              <p className="text-xs text-tinta/65">La red todavía no tiene datos de venta de este modelo.</p>
            ) : (
              <details>
                <summary className="cursor-pointer text-xs text-tinta/75">Ver por qué, variante por variante</summary>
                <ul className="mt-2 divide-y divide-tinta/10">
                  {(modelo.variantes ?? [])
                    .filter((v) => curva.porVariante.has(v.varianteId))
                    .sort((a, b) => (curva.porVariante.get(b.varianteId)?.sugerido ?? 0) - (curva.porVariante.get(a.varianteId)?.sugerido ?? 0))
                    .map((v) => {
                      const d = demandaPorVariante.get(v.varianteId);
                      const sug = curva.porVariante.get(v.varianteId);
                      return (
                        <li key={v.varianteId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-1.5 text-[13px]">
                          <span className="min-w-0">
                            <span className="text-tinta">
                              {v.color ?? "Sin color"} · {v.talla ?? "Única"}
                            </span>
                            {d && (
                              <span className="ml-2 align-middle">
                                <Chip tono={d.banda === "agotado" || d.banda === "critica" || d.banda === "atencion" ? "ambar" : "neutro"}>{ETIQUETA_BANDA[d.banda]}</Chip>
                              </span>
                            )}
                            <small className="block text-xs text-tinta/65">
                              {d ? `Red ${d.stockRed} · Taller ${d.stockTaller}${d.enCamino > 0 ? ` · en camino ${d.enCamino}` : ""}${enProduccion.get(v.varianteId) ? ` · fabricando ${enProduccion.get(v.varianteId)}` : ""}` : ""}
                            </small>
                          </span>
                          <span className="text-right tabular-nums">
                            <b className="font-semibold text-tinta">{sug?.sugerido ?? 0}</b>
                            <small className="block max-w-[15rem] text-xs text-tinta/60">{sug?.motivo}</small>
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </details>
            )}
            {datos.motor && (
              <MotorEnProduccion motor={datos.motor} modelo={modelo} disponible={disponibleDeVariante} diasObjetivo={diasObjetivo} onUsar={setCantidades} />
            )}
          </section>
        )}

        {datos && modelo && !esNuevo && (
          <section aria-label="Tela y avíos de esta orden" className="space-y-2.5 rounded-2xl border border-sand bg-crema p-3.5">
            <p className={campoEtiqueta}>¿Alcanza la tela y los avíos?</p>
            {rendimiento.length === 0 ? (
              <p className="text-xs text-tinta/65">
                Todavía no hay órdenes cerradas de este modelo con insumos descontados: el rendimiento se mide desde la primera. Mientras tanto, escribe el costo a mano.
              </p>
            ) : total === 0 ? (
              <p className="text-xs text-tinta/65">Indica cuántas prendas para ver si alcanza. Por prenda, según {rendimiento[0].ordenes === 1 ? "la última orden" : "las órdenes cerradas"}: {rendimiento.map((r) => `${r.insumo} ${cantidadTexto(r.porPrenda, r.unidad)}`).join(" · ")}.</p>
            ) : (
              <>
                <ul className="divide-y divide-tinta/10">
                  {analisis.map((a) => (
                    <li key={a.insumoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-[13px]">
                      <span className="min-w-0">
                        <span className="text-tinta">{a.insumo}</span>
                        <small className="block text-xs text-tinta/65">
                          necesita {cantidadTexto(a.necesita, a.unidad)} · hay {cantidadTexto(a.saldo, a.unidad)}
                          {a.porLlegar > 0 ? ` · por llegar ${cantidadTexto(a.porLlegar, a.unidad)}` : ""} · con lo que hay salen {a.prendasConElSaldo} prendas
                        </small>
                      </span>
                      <Chip tono={a.estado === "alcanza" ? "verde" : "ambar"}>
                        {a.estado === "alcanza" ? "Alcanza" : a.estado === "alcanza_si_llega" ? "Alcanza si llega lo pedido" : `Faltan ${cantidadTexto(a.faltan, a.unidad)}`}
                      </Chip>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-tinta/60">
                  Medido: consumo real de {rendimiento[0].ordenes === 1 ? "1 orden cerrada" : `${Math.max(...rendimiento.map((r) => r.ordenes))} órdenes cerradas`} de este modelo.
                </p>
                {materialesPorPrenda !== null && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-tinta/10 pt-2 text-[13px]">
                    <span className="text-tinta/80">
                      Materiales ≈ <b className="font-semibold tabular-nums text-tinta">{soles(materialesPorPrenda)}</b> por prenda, a costo del lote que se usaría
                    </span>
                    <button
                      type="button"
                      onClick={usarEstimadoDeMateriales}
                      className="h-8 rounded-md border border-tinta/25 px-3 text-[13px] text-tinta outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60"
                    >
                      Usar como costo estimado
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <CampoMonto etiqueta="Tela" pie="De toda la corrida" inputMode="decimal" placeholder="0.00" value={tela} onChange={(e) => setTela(e.target.value)} />
          <CampoMonto etiqueta="Avíos" pie="Botones, cierres, etiquetas e hilo" inputMode="decimal" placeholder="0.00" value={avios} onChange={(e) => setAvios(e.target.value)} />
          <CampoMonto etiqueta="Maquila" pie="Lo que se manda afuera: planchado, corte, etc." inputMode="decimal" placeholder="0.00" value={maquila} onChange={(e) => setMaquila(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">
            {total} prendas · costo estimado {soles(costoTotal)}
            {precio > 0 && ` · se vende a ${soles(precio)}`}
            {verMargen && semaforo && ` · margen ${Math.round(semaforo.margen * 100)} %`}
          </span>
          <span className="flex items-center gap-2.5">
            {verMargen && semaforo && <Chip tono={CHIP_SEMAFORO[semaforo.tono].tono}>{CHIP_SEMAFORO[semaforo.tono].texto}</Chip>}
            <span className="font-display text-lg text-tinta">{soles(unitario)} / prenda</span>
          </span>
        </div>
        {modelo && !esNuevo && verMargen && precio <= 0 && (
          <p className="-mt-2 text-xs text-tinta/65">
            Este modelo no tiene precio en el catálogo, así que no hay margen que calcular.{" "}
            <Link href={`/productos/${modelo.productoId}/editar`} className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
              Ponle precio en Editar producto
            </Link>
            .
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Fecha de entrega" pie="Opcional" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          <CampoTexto etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={sugerirNotaDeOrden(tipo)} />
        </div>

        <ComboResponsable control={responsable} deshabilitado={cargando} />

        {choque && (
          <Aviso
            tono="atencion"
            titulo={choque.tipo === "nombre_duplicado" ? "Ese modelo ya existe" : "Hay uno casi igual"}
            accion={
              choque.tipo === "nombre_duplicado" ? (
                choque.existenteId && modelos.some((m) => m.productoId === choque.existenteId) ? (
                  <Boton type="button" peso="fantasma" onClick={() => usarExistente(choque.existenteId as string)}>
                    Usar ese modelo
                  </Boton>
                ) : null
              ) : (
                <Boton type="button" peso="fantasma" onClick={() => void abrirConModeloNuevo(true)} disabled={cargando}>
                  Es otro modelo, crearlo igual
                </Boton>
              )
            }
          >
            {choque.mensaje}
          </Aviso>
        )}

        <div className="pie-hoja-fijo space-y-2">
          <PieGuia guia={guia} listo="Todo listo para abrir la orden." />
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={botonCancelar}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando || !guia.puedeConfirmar || !responsable.listo}
              title={guia.frase ?? responsable.motivo ?? undefined}
              className={`${botonPrimario} ${guia.claseConfirmar}`}
            >
              {cargando ? "Abriendo…" : esNuevo ? "Crear modelo y abrir orden" : "Abrir orden"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
