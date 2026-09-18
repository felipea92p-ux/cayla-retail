"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { clave } from "@/lib/buscar-prenda-v2";
import { Boton, CampoSelectNativo, CampoTexto, SelectNativo } from "@/components/ui/campos";
import { BarraFija } from "@/components/ui/BarraFija";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { CerrarFaltanteModal } from "@/components/CerrarFaltanteModal";
import { compararTallas } from "@/lib/tallas";
import { diaMes } from "@/lib/fechas-lima";
import { chipLlegada, estadoLinea, ordenarPorUrgencia, resumenConteo, textoEsperada, valorPorLlegar, type EstadoLinea } from "@/lib/recepciones-reglas";
import { soles, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";

// Recibir mercadería contra comprobantes (ADR-0035). Una guía = una recepción, que puede cubrir
// varios comprobantes del MISMO proveedor. Si el comprobante vino agrupado («Blusa Lino x 24», sin
// talla/color), acá se reparte por variante. La regla dura —nunca recibir más de lo facturado— la
// aplica la RPC `recibir_compras`; el formulario solo la anticipa para no mandar algo que va a fallar.
//
// 2026-09-14, lista + panel: a la izquierda los comprobantes pendientes, agrupados por proveedor y
// con buscador; a la derecha la guía que se está armando. Tocar un comprobante la pone en la guía
// (y reemplaza lo que hubiera); «+ Sumar» agrega otro del mismo proveedor; los de otros
// proveedores quedan atenuados mientras la guía tenga dueño.
//
// 2026-09-18 (ADR-0106):
// · D1 — las cantidades ARRANCAN EN 0. Antes se precargaba todo lo pendiente y bastaba apretar
//   «Recibir» para que el stock subiera por prendas que quizá no llegaron. Ahora cada línea está
//   «Sin contar» hasta que alguien la cuenta; «Todo llegó» llena un comprobante en un toque. Lo que
//   no se cuenta no suma y sigue pendiente.
// · La lista va por urgencia (lo atrasado primero) y cada ítem dice cuándo se esperaba.
// · Cambiar de comprobante con cantidades ya anotadas pide confirmación (antes las descartaba sin avisar).
// · D2 — una línea que llegó corta puede CERRARSE con faltante (y registrar la nota de crédito).
// · En celular las cantidades se cambian con − y + grandes (recibir es de pie, con una mano).
type Variante = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  productoId: string;
  referencia: string;
};
type Ubicacion = { id: string; nombre: string };

// Por línea de comprobante: cuántas unidades de cada variante llegan.
type Reparto = Record<string /* lineaId */, Record<string /* varianteId */, number>>;

// Fuera de comprobante (ADR-0076): una prenda que llegó en la misma guía pero ningún comprobante
// seleccionado la lista. Va en un array aparte, no en `Reparto` — ese tipo está indexado por
// línea de comprobante, y esto no tiene una.
type Extra = { productoId: string; varianteId: string; cantidad: number; costoUnitario: string };

const NUMERO =
  "w-16 border-b bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none [appearance:textfield] focus:border-b-2 focus:border-rojo [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// Producto · Talla y color · Pendiente · Llegó · Estado
const PLANTILLA_LINEA = "sm:grid-cols-[1fr_7.5rem_5rem_6rem_9.5rem]";

const CHIP_ESTADO: Record<EstadoLinea, TonoChip> = { sin_contar: "neutro", completa: "verde", faltan: "ambar", excede: "rojo" };

export function RecepcionCompraFormV2({
  compras,
  lineas,
  variantes,
  ubicaciones,
  ubicacionInicialId,
  compraInicialId,
  esLider,
  igvMes,
  porRecibirAtrasadas,
}: {
  compras: CompraResumen[];
  lineas: LineaCompra[];
  variantes: Variante[];
  ubicaciones: Ubicacion[];
  ubicacionInicialId: string;
  compraInicialId: string | null;
  esLider: boolean;
  /** Crédito fiscal del mes, para mostrar el efecto de una nota de crédito al cerrar un faltante. */
  igvMes: number | null;
  porRecibirAtrasadas: number | null;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const inicial = compraInicialId && compras.some((c) => c.id === compraInicialId) ? [compraInicialId] : [];
  const ahora = useMemo(() => new Date(), []);
  const [seleccionadas, setSeleccionadas] = useState<string[]>(inicial);
  // Las cantidades arrancan VACÍAS (D1): sin valor = sin contar.
  const [reparto, setReparto] = useState<Reparto>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [nota, setNota] = useState("");
  const [ubicacionId, setUbicacionId] = useState(ubicacionInicialId || ubicaciones[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ unidades: number; facturas: number; extras: number } | null>(null);
  const [cambioPendiente, setCambioPendiente] = useState<CompraResumen | null>(null);
  const [cerrando, setCerrando] = useState<LineaCompra | null>(null);

  const variantesPorProducto = useMemo(() => {
    const m = new Map<string, Variante[]>();
    for (const v of variantes) m.set(v.productoId, [...(m.get(v.productoId) ?? []), v]);
    return m;
  }, [variantes]);

  // Catálogo completo, agrupado por producto — mismo patrón que `opcionesProducto` de CompraFormV2.tsx
  // («Registrar comprobante»). A diferencia de las líneas de la izquierda, esto no depende de qué
  // comprobante esté seleccionado: cualquier prenda del catálogo puede llegar fuera de comprobante.
  const opcionesProducto = useMemo(
    () =>
      [...variantesPorProducto.entries()].map(([productoId, vs]) => ({
        valor: productoId,
        texto: vs[0].referencia,
        detalle: `${vs.length} ${vs.length === 1 ? "variante" : "variantes"}`,
      })),
    [variantesPorProducto],
  );

  const primera = seleccionadas.length ? compras.find((c) => c.id === seleccionadas[0]) : undefined;
  const proveedorActivo = primera?.proveedorId ?? null;
  const proveedorNombre = primera?.proveedorNombre ?? "";
  const lineasActivas = lineas.filter((l) => seleccionadas.includes(l.compraId) && l.pendiente > 0);

  // Lista de la izquierda: buscador en memoria (la página ya trae ≤ 50 comprobantes), ordenada por
  // urgencia (lo atrasado primero) y agrupada por proveedor en el orden en que aparece cada uno.
  const k = clave(busqueda);
  const grupos = useMemo(() => {
    const visibles = ordenarPorUrgencia(
      compras.filter((c) => !k || clave(`${c.documento} ${c.proveedorNombre} ${c.proveedorRuc ?? ""}`).includes(k)),
      ahora,
    );
    const m = new Map<string, { nombre: string; facturas: CompraResumen[] }>();
    for (const c of visibles) {
      const g = m.get(c.proveedorId) ?? { nombre: c.proveedorNombre, facturas: [] };
      g.facturas.push(c);
      m.set(c.proveedorId, g);
    }
    return [...m.entries()].map(([id, g]) => ({ id, ...g }));
  }, [compras, k, ahora]);

  function cantidadLinea(l: LineaCompra): number {
    return Object.values(reparto[l.id] ?? {}).reduce((a, n) => a + n, 0);
  }

  const hayCantidades = lineasActivas.some((l) => cantidadLinea(l) > 0) || extras.some((e) => e.productoId || e.varianteId);

  function irAlPanel() {
    // En celular la lista y el panel se apilan: al elegir, bajar al panel para que se vea que pasó
    // algo. En escritorio están lado a lado.
    if (typeof window !== "undefined" && window.innerWidth < 1024) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Tocar un comprobante arma una guía nueva con él solo — incluido lo fuera de comprobante que se
  // hubiera agregado a la guía anterior. Si ya hay cantidades anotadas, primero se pregunta: antes
  // se descartaban sin avisar y un toque en falso perdía la cuenta de decenas de líneas.
  function elegir(c: CompraResumen) {
    if (seleccionadas.length === 1 && seleccionadas[0] === c.id) return;
    if (hayCantidades) return void setCambioPendiente(c);
    aplicarEleccion(c);
  }
  function aplicarEleccion(c: CompraResumen) {
    setSeleccionadas([c.id]);
    setReparto({});
    setExtras([]);
    setCambioPendiente(null);
    irAlPanel();
  }

  // «+ Sumar»: la agrega a la guía en curso (mismo proveedor, lo garantiza quien muestra el botón).
  function sumar(c: CompraResumen) {
    setSeleccionadas((s) => [...s, c.id]);
  }

  function quitar(compraId: string) {
    const resto = seleccionadas.filter((id) => id !== compraId);
    setSeleccionadas(resto);
    setReparto((r) => {
      const copia = { ...r };
      lineas.filter((l) => l.compraId === compraId).forEach((l) => delete copia[l.id]);
      return copia;
    });
    // Sin ningún comprobante seleccionado no hay guía — lo fuera de comprobante tampoco tiene dónde vivir.
    if (resto.length === 0) setExtras([]);
  }

  // Fuera de comprobante: mismo trío agregar/quitar/actualizar que ya usa RecepcionFormV2.tsx
  // (recibir_lote) para sus líneas — acá el array empieza vacío porque, a diferencia de esa pantalla,
  // esto es la excepción, no el motivo de estar en /compras/recibir.
  function agregarExtra() {
    setExtras((actual) => [...actual, { productoId: "", varianteId: "", cantidad: 1, costoUnitario: "" }]);
  }
  function quitarExtra(i: number) {
    setExtras((actual) => actual.filter((_, n) => n !== i));
  }
  function actualizarExtra(i: number, cambio: Partial<Extra>) {
    setExtras((actual) => actual.map((e, n) => (n === i ? { ...e, ...cambio } : e)));
  }
  // Cambiar de producto olvida la variante elegida — la talla/color de la prenda anterior casi nunca aplica a la nueva.
  function elegirProductoExtra(i: number, productoId: string) {
    actualizarExtra(i, { productoId, varianteId: "" });
  }

  function fijar(lineaId: string, varianteId: string, valor: number) {
    setReparto((r) => ({
      ...r,
      [lineaId]: {
        ...(r[lineaId] ?? {}),
        [varianteId]: Math.max(0, Math.floor(valor) || 0),
      },
    }));
  }

  // «Todo llegó» / «Vaciar»: solo las líneas con variante; las agrupadas no se pueden adivinar (hay que
  // repartirlas a mano mirando la caja).
  function marcarTodas(compraId: string, todo: boolean) {
    setReparto((r) => {
      const copia = { ...r };
      for (const l of lineas.filter((x) => x.compraId === compraId && x.pendiente > 0)) {
        if (l.varianteId) copia[l.id] = { [l.varianteId]: todo ? l.pendiente : 0 };
        else if (!todo) copia[l.id] = {};
      }
      return copia;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const itemsFactura = lineasActivas.flatMap((l) =>
      Object.entries(reparto[l.id] ?? {})
        .filter(([, n]) => n > 0)
        .map(([varianteId, n]) => ({
          compra_item_id: l.id,
          variante_id: varianteId,
          cantidad: n,
        })),
    );
    // Fuera de comprobante (ADR-0076): mismo criterio de «línea completa» que RecepcionFormV2.tsx —
    // sin producto o sin variante elegida, la fila todavía no cuenta, no es un error.
    const itemsExtra = extras
      .filter((ex) => ex.varianteId && ex.cantidad > 0)
      .map((ex) => ({
        compra_item_id: null as string | null,
        variante_id: ex.varianteId,
        cantidad: ex.cantidad,
        ...(ex.costoUnitario ? { costo_unitario: Number(ex.costoUnitario) } : {}),
      }));

    if (seleccionadas.length === 0) return void avisar.error("Elige al menos un comprobante.", { enfocar: "recibir-buscar" });
    if (itemsFactura.length === 0)
      return void avisar.error("Cuenta lo que llegó del comprobante — al menos una línea con cantidad. Si nada llegó con comprobante, usa «Ingreso sin comprobante».", {
        enfocar: panel.current,
      });
    const excedida = lineasActivas.find((l) => cantidadLinea(l) > l.pendiente);
    if (excedida) return void avisar.error(`${excedida.referencia}: se intenta recibir ${cantidadLinea(excedida)} pero solo faltan ${excedida.pendiente}.`, { enfocar: `recibir-linea-${excedida.id}` });
    if (!ubicacionId) return void avisar.error("Elige a qué ubicación entra la mercadería.", { enfocar: "recibir-ubicacion" });

    setLoading(true);
    const cerrarProceso = avisar.proceso("Recibiendo mercadería…");
    const supabase = createClient();
    const { error } = await supabase.rpc("recibir_compras", {
      p_ubicacion_id: ubicacionId,
      p_items: [...itemsFactura, ...itemsExtra],
      ...(numeroGuia.trim() ? { p_numero_guia: numeroGuia.trim() } : {}),
      ...(nota.trim() ? { p_nota: nota.trim() } : {}),
    });
    cerrarProceso();
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "recibir la mercadería"));
      return;
    }
    const unidades = itemsFactura.reduce((a, i) => a + i.cantidad, 0) + itemsExtra.reduce((a, i) => a + i.cantidad, 0);
    avisar.exito(`${unidades} unidades recibidas en ${ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "la ubicación"}`, {
      detalle: [seleccionadas.length === 1 ? "Contra un comprobante." : `Contra ${seleccionadas.length} comprobantes.`, itemsExtra.length > 0 ? `+${itemsExtra.length} fuera de comprobante.` : null]
        .filter(Boolean)
        .join(" "),
    });
    setOk({
      unidades,
      facturas: seleccionadas.length,
      extras: itemsExtra.length,
    });
    router.refresh();
  }

  const ubicacionNombre = ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "";
  const conteo = resumenConteo(lineasActivas.map((l) => ({ llego: cantidadLinea(l), pendiente: l.pendiente })));
  const unidadesFactura = conteo.unidades;
  const unidadesExtra = extras.filter((ex) => ex.varianteId && ex.cantidad > 0).reduce((a, ex) => a + ex.cantidad, 0);
  const unidadesRecibiendo = unidadesFactura + unidadesExtra;
  const lineasExcedidas = conteo.excedidas;

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-5 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">Mercadería recibida</p>
        <p className="font-display text-3xl text-tinta">{ok.unidades} unidades</p>
        <p className="text-sm text-tinta/70">
          Ya suman al stock de {ubicacionNombre}, contra {ok.facturas === 1 ? "un comprobante" : `${ok.facturas} comprobantes`}
          {ok.extras > 0 && ` (${ok.extras} fuera de comprobante)`}.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Boton
            peso="discreto"
            onClick={() => {
              setOk(null);
              setSeleccionadas([]);
              setReparto({});
              setExtras([]);
              setNumeroGuia("");
              setNota("");
            }}
          >
            Recibir otra guía
          </Boton>
          <Link href="/compras" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema hover:bg-rojo">
            Ver comprobantes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`grid gap-6 lg:grid-cols-[minmax(18rem,22rem)_1fr] lg:items-start ${seleccionadas.length > 0 ? "pb-28 sm:pb-24" : ""}`}>
      {/* ================= izquierda: comprobantes pendientes ================= */}
      <aside className="card-cayla divide-y divide-tinta/10 lg:sticky lg:top-24">
        <div className="flex items-center gap-3 px-4 py-2">
          <label htmlFor="recibir-buscar" className="label-cayla shrink-0 text-[11px] text-tinta/65">
            Pendientes
          </label>
          <input
            id="recibir-buscar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Documento o proveedor"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 border-b border-tinta/20 bg-transparent px-0.5 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-b-2 focus:border-rojo"
          />
        </div>
        <p className="px-4 py-2 text-xs text-tinta/55">Ordenadas por urgencia: lo atrasado primero</p>
        {grupos.length === 0 && <p className="px-4 py-5 text-sm text-tinta/65">Nada coincide con «{busqueda.trim()}».</p>}
        {grupos.map((g) => {
          const ajeno = proveedorActivo !== null && g.id !== proveedorActivo;
          return (
            <div key={g.id} className={ajeno ? "opacity-40" : ""}>
              <p className="label-cayla px-4 pb-1 pt-3 text-[11px] text-tinta/65">{g.nombre}</p>
              {g.facturas.map((c) => {
                const marcada = seleccionadas.includes(c.id);
                const llegada = chipLlegada(c, ahora);
                const enMedio = c.recibidoCantidad > 0;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 border-l-2 px-4 py-2.5 transition-colors ${
                      marcada ? "border-rojo bg-rojo/[0.04]" : "border-transparent hover:bg-tinta/[0.03]"
                    }`}
                  >
                    <button type="button" onClick={() => elegir(c)} className="min-w-0 flex-1 text-left" aria-pressed={marcada}>
                      <span className="block text-sm tabular-nums text-tinta">{c.documento}</span>
                      <span className="block text-xs text-tinta/65">
                        {textoEsperada(c, ahora)} · {c.recibidoCantidad} de {c.facturadoCantidad} u.
                      </span>
                    </button>
                    <div className="shrink-0 text-right">
                      {marcada ? (
                        seleccionadas.length > 1 ? (
                          <button type="button" onClick={() => quitar(c.id)} className="label-cayla text-[10px] text-tinta/55 hover:text-rojo">
                            Quitar
                          </button>
                        ) : (
                          <Chip tono={llegada.tono}>{llegada.texto}</Chip>
                        )
                      ) : proveedorActivo === g.id ? (
                        <button type="button" onClick={() => sumar(c)} className="label-cayla text-[10px] text-rojo hover:underline">
                          + Sumar
                        </button>
                      ) : (
                        <Chip tono={llegada.tono}>{llegada.texto}</Chip>
                      )}
                      <span className="mt-0.5 block text-xs tabular-nums text-tinta/55">{enMedio ? `${soles(valorPorLlegar(c))} por llegar` : soles(c.total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <p className="px-4 py-2.5 text-xs text-tinta/55">
          Una guía cubre comprobantes de un solo proveedor. Si cambias de comprobante con cantidades ya anotadas, te pregunta antes de descartarlas.
        </p>
      </aside>

      {/* ================= derecha: la guía ================= */}
      <div ref={panel} className="min-w-0 space-y-4 scroll-mt-24">
        {seleccionadas.length === 0 ? (
          <div className="card-cayla flex min-h-[16rem] flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="font-display text-xl text-tinta">¿Qué llegó?</p>
            <p className="max-w-sm text-sm text-tinta/65">
              Elige a la izquierda el comprobante que cubre la guía. Si la guía trae mercadería de varios comprobantes del mismo proveedor, súmalos después.
            </p>
          </div>
        ) : (
          <>
            {/* guía y destino */}
            <section className="card-cayla p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-xl text-tinta">Guía de {proveedorNombre}</p>
                <p className="text-xs text-tinta/55">{seleccionadas.length === 1 ? "1 comprobante" : `${seleccionadas.length} comprobantes`}</p>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <CampoTexto etiqueta="Número de guía" mono value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} placeholder="T001-000123" autoComplete="off" />
                {ubicaciones.length > 1 ? (
                  <CampoSelectNativo etiqueta="Entra a" id="recibir-ubicacion" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </CampoSelectNativo>
                ) : (
                  <CampoTexto etiqueta="Entra a" value={ubicacionNombre} readOnly />
                )}
                <CampoTexto etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Llegó una caja abierta…" />
              </div>
            </section>

            {/* una sección por comprobante */}
            {seleccionadas.map((compraId) => {
              const c = compras.find((x) => x.id === compraId);
              const propias = lineasActivas.filter((l) => l.compraId === compraId);
              if (!c) return null;
              const recibiendo = propias.reduce((a, l) => a + cantidadLinea(l), 0);
              const pendienteTotal = propias.reduce((a, l) => a + l.pendiente, 0);
              const hayDetalladas = propias.some((l) => l.varianteId);
              const conteoC = resumenConteo(propias.map((l) => ({ llego: cantidadLinea(l), pendiente: l.pendiente })));
              // Primero las líneas con variante (tabla), después las agrupadas (curva de tallas): así el
              // encabezado de columnas queda pegado a las filas que describe y no flotando sobre una cuadrícula.
              const ordenadas = [...propias.filter((l) => l.varianteId), ...propias.filter((l) => !l.varianteId)];
              return (
                <section key={compraId} className="card-cayla divide-y divide-tinta/10">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-sm tabular-nums text-tinta">
                        {c.documento} <span className="text-xs text-tinta/65">· emitida {diaMes(c.fechaEmision)}</span>
                      </p>
                      {/* El avance del comprobante como chip: con dos comprobantes en la guía hay que
                          saber sin leer cuál ya está contado y cuál no. */}
                      <Chip tono={tonoAvance(recibiendo, pendienteTotal)}>
                        {recibiendo} de {pendienteTotal}
                      </Chip>
                    </div>
                    <div className="flex items-center gap-3">
                      {hayDetalladas && (
                        <button type="button" onClick={() => marcarTodas(compraId, true)} className="label-cayla text-[10px] text-tinta hover:text-rojo">
                          Todo llegó
                        </button>
                      )}
                      {recibiendo > 0 && (
                        <button type="button" onClick={() => marcarTodas(compraId, false)} className="label-cayla text-[10px] text-tinta/65 hover:text-rojo">
                          Vaciar
                        </button>
                      )}
                      {seleccionadas.length > 1 && (
                        <button type="button" onClick={() => quitar(compraId)} className="label-cayla text-[10px] text-tinta/55 hover:text-rojo">
                          Quitar de la guía
                        </button>
                      )}
                    </div>
                  </div>

                  {/* El conteo: cuántas líneas ya se contaron. Lo que queda «sin contar» no suma al stock. */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
                    <span className="whitespace-nowrap text-xs text-tinta/65">
                      {conteoC.contadas} de {conteoC.total} {conteoC.total === 1 ? "línea contada" : "líneas contadas"}
                    </span>
                    <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={conteoC.contadas} aria-valuemin={0} aria-valuemax={conteoC.total} aria-label="Líneas contadas">
                      <div className={`h-full rounded-full transition-[width] ${conteoC.contadas === conteoC.total ? "bg-verde" : "bg-ambar"}`} style={{ width: `${conteoC.total ? (conteoC.contadas / conteoC.total) * 100 : 0}%` }} />
                    </div>
                    {conteoC.sinContar > 0 && <span className="text-xs text-tinta/55">{conteoC.sinContar} sin contar: quedan pendientes</span>}
                  </div>

                  {/* encabezado de columnas: solo si hay filas con variante */}
                  {hayDetalladas && (
                    <div className={`hidden gap-x-4 px-5 py-2 sm:grid ${PLANTILLA_LINEA}`}>
                      {["Producto", "Talla y color", "Pendiente", "Llegó", "Estado"].map((t, i) => (
                        <span key={t} className={`label-cayla text-[11px] text-tinta/55 ${i === 2 || i === 3 ? "text-center" : ""}`}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {ordenadas.map((l) => {
                    const recibiendoLinea = cantidadLinea(l);
                    const estado = estadoLinea(recibiendoLinea, l.pendiente);
                    const completa = estado === "completa";
                    const excede = estado === "excede";
                    const nombre = `${l.referencia}${l.varianteId && (l.talla || l.color) ? ` · ${[l.talla, l.color].filter(Boolean).join(" / ")}` : ""}`;
                    if (l.varianteId) {
                      return (
                        <div key={l.id} id={`recibir-linea-${l.id}`} className={`px-5 py-3 sm:py-2.5 ${completa ? "bg-verde/[0.045]" : ""}`}>
                          {/* escritorio: fila de tabla */}
                          <div className={`hidden gap-x-4 sm:grid ${PLANTILLA_LINEA} sm:items-center`}>
                            <span className="min-w-0 truncate text-sm text-tinta">
                              {l.referencia}
                              {l.descripcion && <span className="block truncate text-xs text-tinta/55">{l.descripcion}</span>}
                            </span>
                            <span className="text-sm text-tinta/75">{[l.talla, l.color].filter(Boolean).join(" / ") || l.sku}</span>
                            <span className="text-center text-sm tabular-nums text-tinta/65">{l.pendiente}</span>
                            <span className="text-center">
                              <input
                                type="number"
                                min={0}
                                max={l.pendiente}
                                aria-label={`Llegó de ${l.referencia} ${[l.talla, l.color].filter(Boolean).join(" ")}`}
                                value={reparto[l.id]?.[l.varianteId] ?? 0}
                                onChange={(e) => fijar(l.id, l.varianteId!, Number(e.target.value))}
                                onFocus={(e) => e.target.select()}
                                className={`${NUMERO} ${excede ? "border-rojo text-rojo" : completa ? "border-verde bg-verde/[0.09] text-verde-profundo" : estado === "faltan" ? "border-ambar bg-ambar/10 text-ambar-profundo" : "border-tinta/20 text-tinta/45"}`}
                              />
                            </span>
                            <EstadoDeLinea estado={estado} faltan={l.pendiente - recibiendoLinea} onCerrar={() => setCerrando(l)} />
                          </div>
                          {/* celular: tarjeta con − y + de a dedo */}
                          <div className="sm:hidden">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-tinta">{l.referencia}</p>
                                <p className="text-xs text-tinta/65">
                                  {[l.talla, l.color].filter(Boolean).join(" / ") || l.sku} · pendiente {l.pendiente}
                                </p>
                              </div>
                              <Chip tono={CHIP_ESTADO[estado]}>{ETIQUETA_ESTADO[estado](l.pendiente - recibiendoLinea)}</Chip>
                            </div>
                            <div className="mt-2.5 flex items-center justify-between gap-3">
                              <PasoCantidad valor={reparto[l.id]?.[l.varianteId] ?? 0} onCambio={(n) => fijar(l.id, l.varianteId!, n)} etiqueta={`Llegó de ${nombre}`} tono={estado} />
                              {estado === "faltan" && (
                                <button type="button" onClick={() => setCerrando(l)} className="label-cayla text-[10px] text-rojo hover:underline">
                                  Cerrar con faltante
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    // Línea agrupada: el proveedor facturó «Blusa Lino x 24» sin talla ni color, y se
                    // reparte acá mirando lo que llegó.
                    const opciones = variantesPorProducto.get(l.productoId) ?? [];
                    return (
                      <div key={l.id} id={`recibir-linea-${l.id}`} className={`space-y-3 px-5 py-3 ${completa ? "bg-verde/[0.045]" : ""}`}>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <span className="min-w-0 text-sm text-tinta">
                            {l.referencia}{" "}
                            <span className="text-xs text-tinta/55">· el comprobante dice {l.pendiente} sin talla ni color — anota lo que llegó de cada una</span>
                            {l.descripcion && <span className="block text-xs text-tinta/55">{l.descripcion}</span>}
                          </span>
                          <span className="flex flex-col items-end gap-1">
                            <Chip tono={CHIP_ESTADO[estado]}>{recibiendoLinea} de {l.pendiente}</Chip>
                            {estado === "faltan" && (
                              <button type="button" onClick={() => setCerrando(l)} className="label-cayla text-[10px] text-rojo hover:underline">
                                Cerrar con faltante
                              </button>
                            )}
                          </span>
                        </div>
                        {opciones.length === 0 ? (
                          <p className="text-xs text-rojo">Este producto no tiene variantes activas en el catálogo — no se puede recibir hasta crearlas.</p>
                        ) : (
                          <CurvaVariantes
                            referencia={l.referencia}
                            variantes={opciones}
                            valores={reparto[l.id] ?? {}}
                            excede={excede}
                            onFijar={(varianteId, n) => fijar(l.id, varianteId, n)}
                          />
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}

            {/* ================= fuera de comprobante (ADR-0076) ================= */}
            <section className="card-cayla space-y-3 p-5">
              <div>
                <p className="font-display text-lg text-tinta">¿Llegó algo que no está en el comprobante?</p>
                <p className="mt-1 text-xs text-tinta/65">
                  A veces el proveedor manda una prenda de más, o el comprobante llega incompleto. Se recibe igual, en esta misma guía — no cuenta contra ningún comprobante ni genera una deuda nueva.
                </p>
              </div>

              {/* `flex flex-wrap`, no grid: mismo patrón que RecepcionFormV2.tsx (recibir_lote) — con 5
                  controles por fila, un grid de columnas fijas se sale del ancho de la tarjeta en pantallas
                  angostas; flex-wrap los baja de línea en vez de desbordar. */}
              {extras.map((ex, i) => {
                const variantesDelProducto = ex.productoId ? variantesPorProducto.get(ex.productoId) ?? [] : [];
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2 border-b border-tinta/10 pb-3 last:border-0">
                    <ComboBuscable
                      etiquetaAccesible="Producto fuera de comprobante"
                      id={`recibir-extra-${i}-producto`}
                      valor={ex.productoId}
                      onValor={(id) => elegirProductoExtra(i, id)}
                      opciones={opcionesProducto}
                      marcador="Busca la prenda…"
                      className="min-w-[12rem] flex-1"
                    />
                    <SelectNativo
                      aria-label="Talla y color"
                      value={ex.varianteId}
                      onChange={(e) => actualizarExtra(i, { varianteId: e.target.value })}
                      disabled={!ex.productoId}
                      className="w-32 shrink-0"
                    >
                      <option value="">{ex.productoId ? "Elige…" : "—"}</option>
                      {variantesDelProducto.map((v) => (
                        <option key={v.varianteId} value={v.varianteId}>
                          {[v.talla, v.color].filter(Boolean).join(" / ") || v.sku}
                        </option>
                      ))}
                    </SelectNativo>
                    <input
                      type="number"
                      min={1}
                      aria-label="Cantidad"
                      value={ex.cantidad}
                      onChange={(e) => actualizarExtra(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                      onFocus={(e) => e.target.select()}
                      className="w-16 shrink-0 border-b border-tinta/20 bg-transparent px-1 py-2 text-center text-sm tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      placeholder="Costo (opc.)"
                      aria-label="Costo unitario"
                      value={ex.costoUnitario}
                      onChange={(e) => {
                        const v = e.target.value;
                        actualizarExtra(i, { costoUnitario: v === "" ? "" : String(Math.max(0, Number(v) || 0)) });
                      }}
                      className="w-24 shrink-0 border-b border-tinta/20 bg-transparent px-1 py-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
                    />
                    <button type="button" onClick={() => quitarExtra(i)} className="label-cayla shrink-0 text-[10px] text-tinta/55 hover:text-rojo">
                      Quitar
                    </button>
                  </div>
                );
              })}

              <button type="button" onClick={agregarExtra} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
                + Agregar producto fuera de comprobante
              </button>
            </section>
          </>
        )}
      </div>

      {/* ================= barra fija: resumen + confirmar ================= */}
      {seleccionadas.length > 0 && (
        <BarraFija
          resumen={
            <>
              <span className="font-display text-2xl tabular-nums text-tinta">{unidadesRecibiendo.toLocaleString("es-PE")}</span>{" "}
              {unidadesRecibiendo === 1 ? "unidad" : "unidades"}
              {unidadesExtra > 0 ? ` (${unidadesFactura} del comprobante, ${unidadesExtra} fuera de comprobante)` : ` · ${conteo.contadas} de ${conteo.total} ${conteo.total === 1 ? "línea contada" : "líneas contadas"}`}
              {ubicacionNombre && (
                <>
                  {" "}
                  → <span className="font-semibold text-tinta">{ubicacionNombre}</span>
                </>
              )}
              {lineasExcedidas > 0 && <span className="ml-3 text-rojo">{lineasExcedidas === 1 ? "1 línea supera" : `${lineasExcedidas} líneas superan`} lo pendiente</span>}
              {conteo.sinContar > 0 && lineasExcedidas === 0 && (
                <span className="block text-xs text-tinta/55">
                  {conteo.sinContar === 1 ? "La línea sin contar no suma" : `Las ${conteo.sinContar} líneas sin contar no suman`} al stock; siguen pendientes en el comprobante.
                </span>
              )}
            </>
          }
          acciones={
            // El tope es `unidadesFactura`, no el total: una guía solo con ítems fuera de comprobante la
            // rechaza la RPC (necesita al menos uno atado a una línea real).
            <Boton type="submit" peso="primario" cargando={loading} disabled={unidadesFactura === 0 || lineasExcedidas > 0}>
              {unidadesRecibiendo > 0 ? `Recibir ${unidadesRecibiendo.toLocaleString("es-PE")} ${unidadesRecibiendo === 1 ? "unidad" : "unidades"} en ${ubicacionNombre}` : `Recibir en ${ubicacionNombre}`}
            </Boton>
          }
        />
      )}

      {cambioPendiente && (
        <Modal titulo="¿Descartar lo que anotaste?" subtitulo={`Tienes cantidades anotadas en ${primera?.documento ?? "la guía"}.`} onClose={() => setCambioPendiente(null)}>
          {(cerrar) => (
            <div className="space-y-4">
              <p className="text-sm text-tinta/75">
                Si cambias a <b className="font-semibold">{cambioPendiente.documento}</b> se descartan las cantidades de la guía en curso. No se registró nada todavía.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={cerrar} className="label-cayla flex-1 rounded-md border border-tinta/25 px-3 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
                  Seguir aquí
                </button>
                <button type="button" onClick={() => aplicarEleccion(cambioPendiente)} className="label-cayla flex-1 rounded-md bg-tinta px-3 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo">
                  Descartar y cambiar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {cerrando && (
        <CerrarFaltanteModal
          compra={compras.find((c) => c.id === cerrando.compraId) ?? primera!}
          linea={cerrando}
          producto={`${cerrando.referencia}${cerrando.varianteId && (cerrando.talla || cerrando.color) ? ` · ${[cerrando.talla, cerrando.color].filter(Boolean).join(" / ")}` : ""}`}
          llegandoAhora={cantidadLinea(cerrando)}
          llegandoEnGuia={lineasActivas.filter((l) => l.compraId === cerrando.compraId).reduce((a, l) => a + cantidadLinea(l), 0)}
          esLider={esLider}
          igvMes={igvMes}
          porRecibirAtrasadas={porRecibirAtrasadas}
          onClose={() => setCerrando(null)}
        />
      )}
    </form>
  );
}

// El estado de una línea, en el mismo código de color que el resto de Compras: nada contado =
// neutro, a medias = ámbar, completo = verde, más de lo facturado = rojo (la RPC lo va a rechazar;
// que se vea antes de enviar).
const ETIQUETA_ESTADO: Record<EstadoLinea, (faltan: number) => string> = {
  sin_contar: () => "Sin contar",
  completa: () => "Completa",
  faltan: (n) => `Faltan ${n}`,
  excede: () => "Excede",
};

function EstadoDeLinea({ estado, faltan, onCerrar }: { estado: EstadoLinea; faltan: number; onCerrar: () => void }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Chip tono={CHIP_ESTADO[estado]}>{ETIQUETA_ESTADO[estado](faltan)}</Chip>
      {estado === "faltan" && (
        <button type="button" onClick={onCerrar} className="label-cayla text-left text-[10px] text-rojo hover:underline">
          Cerrar con faltante
        </button>
      )}
    </span>
  );
}

// Avance de un comprobante, como chip: nada contado = neutro, a medias = ámbar, completo = verde,
// más de lo pendiente = rojo.
function tonoAvance(recibiendo: number, pendiente: number): TonoChip {
  if (recibiendo > pendiente) return "rojo";
  if (recibiendo === 0) return "neutro";
  if (recibiendo === pendiente) return "verde";
  return "ambar";
}

// − y + de 40 px con el número grande: recibir es de pie y con una mano, y el teclado numérico del
// celular es lo más lento. También se puede tipear.
function PasoCantidad({ valor, onCambio, etiqueta, tono }: { valor: number; onCambio: (n: number) => void; etiqueta: string; tono: EstadoLinea }) {
  const color = tono === "completa" ? "text-verde-profundo" : tono === "faltan" ? "text-ambar-profundo" : tono === "excede" ? "text-rojo" : "text-tinta/45";
  return (
    <div role="group" aria-label={etiqueta} className="flex items-center overflow-hidden rounded-[10px] border border-tinta/25">
      <button type="button" onClick={() => onCambio(Math.max(0, valor - 1))} aria-label="Una unidad menos" className="grid h-10 w-10 place-items-center text-xl text-tinta/65 active:bg-tinta/5">
        −
      </button>
      <input
        inputMode="numeric"
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value.replace(/\D/g, "")) || 0)}
        onFocus={(e) => e.target.select()}
        aria-label={etiqueta}
        className={`font-display h-10 w-[46px] border-x border-tinta/15 bg-transparent text-center text-[22px] tabular-nums outline-none ${color}`}
      />
      <button type="button" onClick={() => onCambio(valor + 1)} aria-label="Una unidad más" className="grid h-10 w-10 place-items-center text-xl text-tinta/65 active:bg-tinta/5">
        +
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------
   CurvaVariantes · repartir una línea agrupada por talla y color

   Por qué existe: el comprobante dice "Blusa Emma x 24" y la caja trae 4 S,
   8 M, 12 L en dos colores. Antes esto era una hilera de chips
   "S / Beige [0]" que con 5 tallas × 3 colores se volvía una pared donde
   no se veía qué ya estaba contado. La curva de tallas es cómo el taller
   y las tiendas ya piensan la mercadería: una fila por color, una columna
   por talla, el total de la fila al costado. Si las variantes no tienen
   ni talla ni color (producto único), cae a la lista simple.
   -------------------------------------------------------------------- */
const SIN = "—";
// Celda de la curva: caja completa (no solo línea inferior como NUMERO) para
// que una cuadrícula de 5 × 3 se lea como cuadrícula y no como renglones sueltos.
const CELDA =
  "h-9 rounded-md border bg-transparent px-1 text-center text-sm tabular-nums outline-none transition-colors focus:border-rojo focus:ring-1 focus:ring-rojo/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function CurvaVariantes({
  referencia,
  variantes,
  valores,
  excede,
  onFijar,
}: {
  referencia: string;
  variantes: Variante[];
  valores: Record<string, number>;
  excede: boolean;
  onFijar: (varianteId: string, n: number) => void;
}) {
  const tallas = [...new Set(variantes.map((v) => v.talla ?? SIN))].sort(compararTallas);
  const colores = [...new Set(variantes.map((v) => v.color ?? SIN))].sort((a, b) => a.localeCompare(b, "es"));
  const conEjes = variantes.some((v) => v.talla || v.color);
  const porCelda = new Map(variantes.map((v) => [`${v.color ?? SIN}|${v.talla ?? SIN}`, v]));

  const celda = (v: Variante, etiqueta: string, ancho = "w-14 sm:w-16") => {
    const n = valores[v.varianteId] ?? 0;
    return (
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`${referencia} ${etiqueta}`}
        value={n}
        onChange={(e) => onFijar(v.varianteId, Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className={`${CELDA} ${ancho} ${
          n > 0 ? (excede ? "border-rojo bg-rojo/[0.06] text-rojo" : "border-tinta/60 bg-tinta/[0.05] text-tinta") : "border-tinta/15 text-tinta/45"
        }`}
      />
    );
  };

  if (!conEjes) {
    return (
      <div className="flex flex-wrap gap-2">
        {variantes.map((v) => (
          <label key={v.varianteId} className="flex items-center gap-2 rounded-md border border-tinta/15 px-2.5 py-1.5">
            <span className="text-xs text-tinta/75">{v.sku}</span>
            {celda(v, v.sku, "w-14")}
          </label>
        ))}
      </div>
    );
  }

  // Solo un eje (todo "Única", o sin color): una fila basta, sin rótulo de color que no aporta.
  const unaFila = colores.length === 1 && colores[0] === SIN;

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-x-1.5 border-spacing-y-1 sm:border-spacing-x-2">
        <thead>
          <tr>
            {!unaFila && <th className="w-12 text-left sm:w-24" />}
            {tallas.map((t) => (
              <th key={t} className="label-cayla pb-0.5 text-center text-[11px] font-normal text-tinta/55">
                {t === SIN ? "Talla única" : t}
              </th>
            ))}
            {!unaFila && <th className="label-cayla pb-0.5 pl-2 text-right text-[11px] font-normal text-tinta/55">Total</th>}
          </tr>
        </thead>
        <tbody>
          {colores.map((color) => {
            const fila = tallas.map((t) => porCelda.get(`${color}|${t}`));
            const total = fila.reduce((a, v) => a + (v ? (valores[v.varianteId] ?? 0) : 0), 0);
            return (
              <tr key={color}>
                {!unaFila && <th className="max-w-[4.5rem] truncate pr-1 text-left text-sm font-normal text-tinta/75 sm:max-w-none sm:pr-2">{color === SIN ? "Sin color" : color}</th>}
                {fila.map((v, i) => (
                  <td key={tallas[i]} className="text-center">
                    {v ? celda(v, [tallas[i], color].filter((x) => x !== SIN).join(" ")) : <span className="block w-14 text-center text-xs text-tinta/30 sm:w-16">·</span>}
                  </td>
                ))}
                {!unaFila && <td className={`pl-2 text-right text-sm tabular-nums ${total > 0 ? "text-tinta" : "text-tinta/45"}`}>{total}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
