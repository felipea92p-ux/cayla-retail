"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { clave } from "@/lib/buscar-prenda-v2";
import { Boton, CampoSelectNativo, CampoTexto, SelectNativo } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { compararTallas } from "@/lib/tallas";
import { fechaCorta, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";

// Recibir mercadería contra facturas (ADR-0035). Una guía = una recepción,
// que puede cubrir varias facturas del MISMO proveedor. Cada línea de
// factura se precarga con lo que falta por recibir; si la factura vino
// agrupada ("Blusa Lino x 24", sin talla/color), acá se reparte por
// variante. La regla dura —nunca recibir más de lo facturado— la aplica la
// RPC `recibir_compras`; el formulario solo la anticipa para no mandar algo
// que va a fallar.
//
// 2026-09-14, lista + panel (decisión de Felipe entre tres opciones): a la
// izquierda las facturas pendientes, agrupadas por proveedor y con buscador;
// a la derecha la guía que se está armando. Antes era una lista de casillas
// y "todo aparecía abajo" al marcar — con dos facturas de veinte líneas la
// pantalla se volvía un rollo. Ahora: tocar una factura la pone en la guía
// (y reemplaza lo que hubiera); "+ Sumar" agrega otra del mismo proveedor;
// las de otros proveedores quedan atenuadas mientras la guía tenga dueño.
type Variante = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  productoId: string;
  referencia: string;
};
type Ubicacion = { id: string; nombre: string };

// Por línea de factura: cuántas unidades de cada variante llegan.
type Reparto = Record<string /* lineaId */, Record<string /* varianteId */, number>>;

// Fuera de factura (ADR-0075): una prenda que llegó en la misma guía pero
// ninguna factura seleccionada la lista. Va en un array aparte, no en
// `Reparto` — ese tipo está indexado por línea de factura, y esto no tiene
// una.
type Extra = { productoId: string; varianteId: string; cantidad: number; costoUnitario: string };

const NUMERO =
  "w-16 border-b bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none [appearance:textfield] focus:border-b-2 focus:border-rojo [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function RecepcionCompraFormV2({
  compras,
  lineas,
  variantes,
  ubicaciones,
  ubicacionInicialId,
  compraInicialId,
}: {
  compras: CompraResumen[];
  lineas: LineaCompra[];
  variantes: Variante[];
  ubicaciones: Ubicacion[];
  ubicacionInicialId: string;
  compraInicialId: string | null;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const inicial = compraInicialId && compras.some((c) => c.id === compraInicialId) ? [compraInicialId] : [];
  const [seleccionadas, setSeleccionadas] = useState<string[]>(inicial);
  const [reparto, setReparto] = useState<Reparto>(() => precargar(inicial, lineas, {}));
  const [extras, setExtras] = useState<Extra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [nota, setNota] = useState("");
  const [ubicacionId, setUbicacionId] = useState(ubicacionInicialId || ubicaciones[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ unidades: number; facturas: number; extras: number } | null>(null);

  const variantesPorProducto = useMemo(() => {
    const m = new Map<string, Variante[]>();
    for (const v of variantes) m.set(v.productoId, [...(m.get(v.productoId) ?? []), v]);
    return m;
  }, [variantes]);

  // Catálogo completo, agrupado por producto — mismo patrón que
  // `opcionesProducto` de CompraFormV2.tsx ("Registrar factura"). A
  // diferencia de las líneas de la izquierda, esto no depende de qué
  // factura esté seleccionada: cualquier prenda del catálogo puede llegar
  // fuera de factura.
  const opcionesProducto = useMemo(
    () =>
      [...variantesPorProducto.entries()].map(([productoId, vs]) => ({
        valor: productoId,
        texto: vs[0].referencia,
        detalle: `${vs.length} ${vs.length === 1 ? "variante" : "variantes"}`,
      })),
    [variantesPorProducto],
  );

  const proveedorActivo = seleccionadas.length ? (compras.find((c) => c.id === seleccionadas[0])?.proveedorId ?? null) : null;
  const proveedorNombre = seleccionadas.length ? (compras.find((c) => c.id === seleccionadas[0])?.proveedorNombre ?? "") : "";
  const lineasActivas = lineas.filter((l) => seleccionadas.includes(l.compraId) && l.pendiente > 0);

  // Lista de la izquierda: buscador en memoria (la página ya trae ≤ 50
  // facturas) y agrupada por proveedor, en el orden en que llegan.
  const k = clave(busqueda);
  const visibles = compras.filter((c) => !k || clave(`${c.documento} ${c.proveedorNombre} ${c.proveedorRuc ?? ""}`).includes(k));
  const grupos = useMemo(() => {
    const m = new Map<string, { nombre: string; facturas: CompraResumen[] }>();
    for (const c of visibles) {
      const g = m.get(c.proveedorId) ?? {
        nombre: c.proveedorNombre,
        facturas: [],
      };
      g.facturas.push(c);
      m.set(c.proveedorId, g);
    }
    return [...m.entries()].map(([id, g]) => ({ id, ...g }));
  }, [visibles]);

  function cantidadLinea(l: LineaCompra): number {
    return Object.values(reparto[l.id] ?? {}).reduce((a, n) => a + n, 0);
  }

  function irAlPanel() {
    // En celular la lista y el panel se apilan: al elegir, bajar al panel
    // para que se vea que pasó algo. En escritorio están lado a lado.
    if (typeof window !== "undefined" && window.innerWidth < 1024) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Tocar una factura arma una guía nueva con ella sola — incluido lo fuera
  // de factura que se hubiera agregado a la guía anterior.
  function elegir(c: CompraResumen) {
    setSeleccionadas([c.id]);
    setReparto(precargar([c.id], lineas, {}));
    setExtras([]);
    irAlPanel();
  }

  // "+ Sumar": la agrega a la guía en curso (mismo proveedor, lo garantiza
  // quien muestra el botón).
  function sumar(c: CompraResumen) {
    setSeleccionadas((s) => [...s, c.id]);
    setReparto((r) => precargar([c.id], lineas, r));
  }

  function quitar(compraId: string) {
    const resto = seleccionadas.filter((id) => id !== compraId);
    setSeleccionadas(resto);
    setReparto((r) => {
      const copia = { ...r };
      lineas.filter((l) => l.compraId === compraId).forEach((l) => delete copia[l.id]);
      return copia;
    });
    // Sin ninguna factura seleccionada no hay guía — lo fuera de factura
    // tampoco tiene dónde vivir.
    if (resto.length === 0) setExtras([]);
  }

  // Fuera de factura: mismo trío agregar/quitar/actualizar que ya usa
  // RecepcionFormV2.tsx (recibir_lote) para sus líneas — acá el array
  // empieza vacío porque, a diferencia de esa pantalla, esto es la
  // excepción, no el motivo de estar en /compras/recibir.
  function agregarExtra() {
    setExtras((actual) => [...actual, { productoId: "", varianteId: "", cantidad: 1, costoUnitario: "" }]);
  }

  function quitarExtra(i: number) {
    setExtras((actual) => actual.filter((_, n) => n !== i));
  }

  function actualizarExtra(i: number, cambio: Partial<Extra>) {
    setExtras((actual) => actual.map((e, n) => (n === i ? { ...e, ...cambio } : e)));
  }

  // Cambiar de producto olvida la variante elegida — la talla/color de la
  // prenda anterior casi nunca aplica a la nueva.
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

  // "Todo llegó" / "Nada": solo las líneas con variante; las agrupadas no se
  // pueden adivinar (hay que repartirlas a mano mirando la caja).
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
    // Fuera de factura (ADR-0075): mismo criterio de "línea completa" que
    // RecepcionFormV2.tsx — sin producto o sin variante elegida, la fila
    // todavía no cuenta, no es un error.
    const itemsExtra = extras
      .filter((ex) => ex.varianteId && ex.cantidad > 0)
      .map((ex) => ({
        compra_item_id: null as string | null,
        variante_id: ex.varianteId,
        cantidad: ex.cantidad,
        ...(ex.costoUnitario ? { costo_unitario: Number(ex.costoUnitario) } : {}),
      }));

    if (seleccionadas.length === 0) return void avisar.error("Elige al menos una factura.", { enfocar: "recibir-buscar" });
    if (itemsFactura.length === 0)
      return void avisar.error("Indica cuánto llegó de la factura — al menos una línea con cantidad. Si nada llegó facturado, usa «Recibir sin factura».", {
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
      detalle: [seleccionadas.length === 1 ? "Contra una factura." : `Contra ${seleccionadas.length} facturas.`, itemsExtra.length > 0 ? `+${itemsExtra.length} fuera de factura.` : null]
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
  const unidadesFactura = lineasActivas.reduce((a, l) => a + cantidadLinea(l), 0);
  const unidadesExtra = extras.filter((ex) => ex.varianteId && ex.cantidad > 0).reduce((a, ex) => a + ex.cantidad, 0);
  const unidadesRecibiendo = unidadesFactura + unidadesExtra;
  const lineasExcedidas = lineasActivas.filter((l) => cantidadLinea(l) > l.pendiente).length;

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-5 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">Mercadería recibida</p>
        <p className="font-display text-3xl text-tinta">{ok.unidades} unidades</p>
        <p className="text-sm text-tinta/70">
          Ya suman al stock de {ubicacionNombre}, contra {ok.facturas === 1 ? "una factura" : `${ok.facturas} facturas`}
          {ok.extras > 0 && ` (${ok.extras} fuera de factura)`}.
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
            Ver facturas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`grid gap-6 lg:grid-cols-[minmax(18rem,22rem)_1fr] lg:items-start ${seleccionadas.length > 0 ? "pb-28 sm:pb-24" : ""}`}>
      {/* ================= izquierda: facturas pendientes ================= */}
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
        {grupos.length === 0 && <p className="px-4 py-5 text-sm text-tinta/65">Nada coincide con «{busqueda.trim()}».</p>}
        {grupos.map((g) => {
          const ajeno = proveedorActivo !== null && g.id !== proveedorActivo;
          return (
            <div key={g.id} className={ajeno ? "opacity-40" : ""}>
              <p className="label-cayla px-4 pb-1 pt-3 text-[11px] text-tinta/65">{g.nombre}</p>
              {g.facturas.map((c) => {
                const marcada = seleccionadas.includes(c.id);
                const pendiente = c.facturadoCantidad - c.recibidoCantidad;
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
                        Emitida {fechaCorta(c.fechaEmision)} · {pendiente} de {c.facturadoCantidad} por recibir
                      </span>
                    </button>
                    {marcada ? (
                      seleccionadas.length > 1 && (
                        <button type="button" onClick={() => quitar(c.id)} className="label-cayla shrink-0 text-[10px] text-tinta/55 hover:text-rojo">
                          Quitar
                        </button>
                      )
                    ) : proveedorActivo === g.id ? (
                      <button type="button" onClick={() => sumar(c)} className="label-cayla shrink-0 text-[10px] text-rojo hover:underline">
                        + Sumar
                      </button>
                    ) : (
                      c.estadoRecepcion === "parcial" && <Chip tono="ambar">Parcial</Chip>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {proveedorActivo && grupos.some((g) => g.id !== proveedorActivo) && (
          <p className="px-4 py-2.5 text-xs text-tinta/55">Una guía cubre facturas de un solo proveedor. Toca una de otro proveedor para empezar otra guía.</p>
        )}
      </aside>

      {/* ================= derecha: la guía ================= */}
      <div ref={panel} className="min-w-0 space-y-4 scroll-mt-24">
        {seleccionadas.length === 0 ? (
          <div className="card-cayla flex min-h-[16rem] flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="font-display text-xl text-tinta">¿Qué llegó?</p>
            <p className="max-w-sm text-sm text-tinta/65">
              Elige a la izquierda la factura que cubre la guía. Si la guía trae mercadería de varias facturas del mismo proveedor, súmalas después.
            </p>
          </div>
        ) : (
          <>
            {/* guía y destino */}
            <section className="card-cayla p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-xl text-tinta">Guía de {proveedorNombre}</p>
                <p className="text-xs text-tinta/55">{seleccionadas.length === 1 ? "1 factura" : `${seleccionadas.length} facturas`}</p>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <CampoTexto
                  etiqueta="Número de guía"
                  mono
                  value={numeroGuia}
                  onChange={(e) => setNumeroGuia(e.target.value)}
                  placeholder="T001-000123"
                  autoComplete="off"
                />
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

            {/* una sección por factura */}
            {seleccionadas.map((compraId) => {
              const c = compras.find((x) => x.id === compraId);
              const propias = lineasActivas.filter((l) => l.compraId === compraId);
              if (!c) return null;
              const recibiendo = propias.reduce((a, l) => a + cantidadLinea(l), 0);
              const pendienteTotal = propias.reduce((a, l) => a + l.pendiente, 0);
              const hayDetalladas = propias.some((l) => l.varianteId);
              // Primero las líneas con variante (tabla), después las agrupadas
              // (curva de tallas): así el encabezado de columnas queda pegado a
              // las filas que describe y no flotando sobre una cuadrícula.
              const ordenadas = [...propias.filter((l) => l.varianteId), ...propias.filter((l) => !l.varianteId)];
              return (
                <section key={compraId} className="card-cayla divide-y divide-tinta/10">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-sm tabular-nums text-tinta">
                        {c.documento} <span className="text-xs text-tinta/65">· emitida {fechaCorta(c.fechaEmision)}</span>
                      </p>
                      {/* El avance de la factura como chip, no como texto gris:
                          con dos facturas en la guía hay que saber sin leer cuál
                          ya está contada y cuál no. */}
                      <Chip tono={tonoAvance(recibiendo, pendienteTotal)}>
                        {recibiendo} de {pendienteTotal}
                      </Chip>
                    </div>
                    <div className="flex items-center gap-3">
                      {hayDetalladas && (
                        <button type="button" onClick={() => marcarTodas(compraId, true)} className="label-cayla text-[10px] text-tinta/65 hover:text-rojo">
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

                  {/* encabezado de columnas: solo si hay filas con variante */}
                  {hayDetalladas && (
                    <div className="hidden gap-x-4 px-5 py-2 sm:grid sm:grid-cols-[1fr_9rem_6rem_6rem]">
                      {["Producto", "Talla y color", "Pendiente", "Llegó"].map((t, i) => (
                        <span key={t} className={`label-cayla text-[11px] text-tinta/55 ${i >= 2 ? "text-center" : ""}`}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {ordenadas.map((l) => {
                    const recibiendoLinea = cantidadLinea(l);
                    const excede = recibiendoLinea > l.pendiente;
                    const completa = recibiendoLinea === l.pendiente && l.pendiente > 0;
                    if (l.varianteId) {
                      return (
                        <div
                          key={l.id}
                          id={`recibir-linea-${l.id}`}
                          className={`grid gap-x-4 gap-y-1 px-5 py-2.5 sm:grid-cols-[1fr_9rem_6rem_6rem] sm:items-center ${completa ? "bg-verde/[0.04]" : ""}`}
                        >
                          <span className="min-w-0 truncate text-sm text-tinta">
                            {l.referencia}
                            {l.descripcion && <span className="block truncate text-xs text-tinta/55">{l.descripcion}</span>}
                          </span>
                          <span className="text-sm text-tinta/75">{[l.talla, l.color].filter(Boolean).join(" / ") || l.sku}</span>
                          <span className="text-sm tabular-nums text-tinta/65 sm:text-center">{l.pendiente}</span>
                          <span className="sm:text-center">
                            <input
                              type="number"
                              min={0}
                              max={l.pendiente}
                              aria-label={`Llegó de ${l.referencia} ${[l.talla, l.color].filter(Boolean).join(" ")}`}
                              value={reparto[l.id]?.[l.varianteId] ?? 0}
                              onChange={(e) => fijar(l.id, l.varianteId!, Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              className={`${NUMERO} ${excede ? "border-rojo text-rojo" : "border-tinta/20"}`}
                            />
                          </span>
                        </div>
                      );
                    }
                    // Línea agrupada: el proveedor facturó "Blusa Lino x 24" sin
                    // talla ni color, y se reparte acá mirando lo que llegó.
                    const opciones = variantesPorProducto.get(l.productoId) ?? [];
                    return (
                      <div key={l.id} id={`recibir-linea-${l.id}`} className={`space-y-3 px-5 py-3 ${completa ? "bg-verde/[0.04]" : ""}`}>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <span className="min-w-0 text-sm text-tinta">
                            {l.referencia}{" "}
                            <span className="text-xs text-tinta/55">
                              · la factura dice {l.pendiente} sin talla ni color — anota lo que llegó de cada una
                            </span>
                            {l.descripcion && <span className="block text-xs text-tinta/55">{l.descripcion}</span>}
                          </span>
                          <Chip tono={tonoAvance(recibiendoLinea, l.pendiente)}>
                            {recibiendoLinea} de {l.pendiente}
                          </Chip>
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

            {/* ================= fuera de factura (ADR-0075) ================= */}
            <section className="card-cayla space-y-3 p-5">
              <div>
                <p className="font-display text-lg text-tinta">¿Llegó algo que no está en la factura?</p>
                <p className="mt-1 text-xs text-tinta/65">
                  A veces el proveedor manda una prenda de más, o la factura llega incompleta. Se recibe igual, en esta misma guía — no cuenta contra ninguna factura ni genera una deuda nueva.
                </p>
              </div>

              {/* `flex flex-wrap`, no grid: mismo patrón que RecepcionFormV2.tsx
                  (recibir_lote) — con 5 controles por fila, un grid de
                  columnas fijas se sale del ancho de la tarjeta en pantallas
                  angostas; flex-wrap los baja de línea en vez de desbordar. */}
              {extras.map((ex, i) => {
                const variantesDelProducto = ex.productoId ? variantesPorProducto.get(ex.productoId) ?? [] : [];
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2 border-b border-tinta/10 pb-3 last:border-0">
                    <ComboBuscable
                      etiquetaAccesible="Producto fuera de factura"
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
                + Agregar producto fuera de factura
              </button>
            </section>
          </>
        )}
      </div>

      {/* ================= barra fija: resumen + confirmar ================= */}
      {seleccionadas.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t border-sand bg-crema/95 backdrop-blur supports-[backdrop-filter]:bg-crema/80 sm:bottom-0 sm:left-lateral">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-10">
            <div className="text-sm text-tinta/75">
              <span className="font-display text-2xl tabular-nums text-tinta">{unidadesRecibiendo.toLocaleString("es-PE")}</span>{" "}
              {unidadesRecibiendo === 1 ? "unidad" : "unidades"}{" "}
              {unidadesExtra > 0
                ? `(${unidadesFactura} de ${seleccionadas.length === 1 ? "la factura" : `${seleccionadas.length} facturas`}, ${unidadesExtra} fuera de factura)`
                : `de ${seleccionadas.length === 1 ? "una factura" : `${seleccionadas.length} facturas`}`}
              {ubicacionNombre && (
                <>
                  {" "}
                  → <span className="text-tinta">{ubicacionNombre}</span>
                </>
              )}
              {lineasExcedidas > 0 && (
                <span className="ml-3 text-rojo">{lineasExcedidas === 1 ? "1 línea supera" : `${lineasExcedidas} líneas superan`} lo pendiente</span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {/* El tope es `unidadesFactura`, no el total: una guía solo con
                  ítems fuera de factura la rechaza la RPC (necesita al menos
                  uno atado a una línea real). */}
              <Boton type="submit" peso="primario" cargando={loading} disabled={unidadesFactura === 0 || lineasExcedidas > 0}>
                Recibir en {ubicacionNombre}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// Avance de una línea o factura, en el mismo código de color que el resto de
// Compras: nada contado = neutro, a medias = ámbar, completo = verde, más de
// lo facturado = rojo (la RPC lo va a rechazar; que se vea antes de enviar).
function tonoAvance(recibiendo: number, pendiente: number): TonoChip {
  if (recibiendo > pendiente) return "rojo";
  if (recibiendo === 0) return "neutro";
  if (recibiendo === pendiente) return "verde";
  return "ambar";
}

/* --------------------------------------------------------------------
   CurvaVariantes · repartir una línea agrupada por talla y color

   Por qué existe: la factura dice "Blusa Emma x 24" y la caja trae 4 S,
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

  // Solo un eje (todo "Única", o sin color): una fila basta, sin rótulo de
  // color que no aporta.
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

// Precarga: lo que falta de cada línea. Las detalladas van a su variante;
// las agrupadas quedan vacías para que quien recibe reparta lo que ve.
function precargar(compraIds: string[], lineas: LineaCompra[], base: Reparto): Reparto {
  const copia = { ...base };
  for (const l of lineas.filter((x) => compraIds.includes(x.compraId) && x.pendiente > 0)) {
    copia[l.id] = l.varianteId ? { [l.varianteId]: l.pendiente } : {};
  }
  return copia;
}
