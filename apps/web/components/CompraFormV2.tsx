"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Boton, Campo, CampoSelectNativo, CampoTexto, Interruptor, Segmentado, SelectNativo } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { SelectorAdjuntos } from "@/components/AdjuntosCompra";
import { LineasPago, lineaPagoVacia, lineasPagoParaRpc, sumaLineasPago, type LineaPago } from "@/components/LineasPago";
import { subirAdjuntosCompra } from "@/lib/adjuntos-compra";
import { campoEtiqueta } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { costoBase, costoParaTipear, soles, totalesCompra } from "@/lib/compras-reglas";

// Registrar una factura de proveedor (ADR-0035). Dos reglas de Felipe que
// esta pantalla refleja pero NO decide — las decide la RPC `registrar_compra`:
//   · Contado ⇒ el pago es obligatorio y es por el total. Acá el monto se
//     muestra fijo; si alguien lo manda distinto, la base lo rechaza igual.
//   · Crédito ⇒ vencimiento obligatorio, pago opcional (cae en "Por pagar").
// Líneas: cada proveedor factura distinto. Si detalla talla/color, se elige
// la variante; si agrupa ("Blusa Lino x 24"), se deja "Sin desglose" y el
// reparto por talla/color se hace al recibir.
type Variante = { varianteId: string; sku: string; talla: string | null; color: string | null; productoId: string; referencia: string; costo: number };
type Proveedor = { id: string; nombre: string; ruc: string | null };
type Ubicacion = { id: string; nombre: string };

type Linea = { productoId: string; varianteId: string; cantidad: number; costoUnitario: string; descripcion: string };

// Producto · Talla y color · Cantidad · Costo unitario · Subtotal · Quitar.
// Todo lo numérico con ancho fijo: cada línea es su propia grilla, y una
// columna `auto` o `fr` en una cifra hacía que "S/ 300,000.00" ensanchara
// SU fila y no las demás — se descuadraban entre sí y con el encabezado.
const PLANTILLA_LINEAS = "sm:grid-cols-[1.4fr_1.2fr_5.5rem_7rem_8rem_3.5rem]";
// Los <input type=number> sin las flechitas del navegador: ocupan espacio,
// cambian de tamaño según el valor y no aportan nada al tipear una cantidad.
const NUMERO = "w-full min-w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const TIPOS = [
  { valor: "factura", texto: "Factura" },
  { valor: "boleta", texto: "Boleta" },
  { valor: "nota_venta", texto: "Nota de venta" },
] as const;

// Solo la factura discrimina IGV (y da crédito fiscal). En boleta y nota de
// venta el precio del papel ya es el costo: el IGV va en cero, y la base lo
// exige con `compras_igv_solo_factura` (20260914160000_igv_solo_en_factura.sql)
// — esto es la cortesía en pantalla, no el candado.
const IGV_POR_DEFECTO = "18";
function discriminaIgv(tipo: (typeof TIPOS)[number]["valor"]): boolean {
  return tipo === "factura";
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// El número de paso: documento → líneas → pago, en ese orden, siempre. Solo
// tinta (ningún color nuevo) y sin `label-cayla` heredado (mayúsculas y
// tracking se ven mal en un solo dígito) — se resetea a mano.
function NumeroSeccion({ n }: { n: number }) {
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-tinta/25 text-[10px] font-semibold normal-case tracking-normal text-tinta/70">
      {n}
    </span>
  );
}

export function CompraFormV2({ proveedores, ubicaciones, ubicacionInicialId, variantes }: { proveedores: Proveedor[]; ubicaciones: Ubicacion[]; ubicacionInicialId: string; variantes: Variante[] }) {
  const router = useRouter();

  const productos = useMemo(() => {
    const m = new Map<string, { referencia: string; variantes: Variante[] }>();
    for (const v of variantes) {
      const p = m.get(v.productoId) ?? { referencia: v.referencia, variantes: [] };
      p.variantes.push(v);
      m.set(v.productoId, p);
    }
    return [...m.entries()].map(([id, p]) => ({ id, ...p })).sort((a, b) => a.referencia.localeCompare(b.referencia));
  }, [variantes]);

  // La línea nace sin producto: el combobox muestra "Busca la prenda…" y
  // quien copia la factura tipea. Preseleccionar el primero del catálogo
  // era una trampa — una línea olvidada se registraba con un producto real.
  const lineaVacia = (): Linea => ({
    productoId: "",
    varianteId: "",
    cantidad: 1,
    costoUnitario: "",
    descripcion: "",
  });

  const opcionesProducto = useMemo(() => productos.map((p) => ({ valor: p.id, texto: p.referencia, detalle: `${p.variantes.length} ${p.variantes.length === 1 ? "variante" : "variantes"}` })), [productos]);
  // El RUC va como detalle: el combo filtra por texto + detalle, así que se
  // encuentra al proveedor tipeando su nombre o su número.
  const opcionesProveedor = useMemo(() => proveedores.map((p) => ({ valor: p.id, texto: p.nombre, detalle: p.ruc ?? undefined })), [proveedores]);

  // Sin proveedor preseleccionado: elegir al primero de la lista era una
  // trampa — una factura registrada sin mirar iba a parar al proveedor
  // equivocado. La validación ya pedía "Elige un proveedor".
  const [proveedorId, setProveedorId] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["valor"]>("factura");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [fechaEmision, setFechaEmision] = useState(hoyISO());
  const [condicion, setCondicion] = useState<"contado" | "credito">("contado");
  const [fechaVencimiento, setFechaVencimiento] = useState(sumarDias(hoyISO(), 30));
  const [ubicacionId, setUbicacionId] = useState(ubicacionInicialId || ubicaciones[0]?.id || "");
  const [igvPorcentaje, setIgvPorcentaje] = useState(IGV_POR_DEFECTO);
  // Cómo vienen los precios en el papel. La base siempre guarda el costo sin
  // IGV (`costoBase` en lib/compras-reglas.ts); esto solo dice cómo se tipea.
  const [precioIncluyeIgv, setPrecioIncluyeIgv] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [pagarAhora, setPagarAhora] = useState(false);
  // Uno o varios medios de pago (LineasPago). Al contado la suma tiene que
  // ser el total; al crédito, no pasarse. La RPC lo vuelve a exigir.
  const [pagos, setPagos] = useState<LineaPago[]>([lineaPagoVacia()]);
  const [nota, setNota] = useState("");
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  const igvEfectivo = discriminaIgv(tipo) ? Number(igvPorcentaje) || 0 : 0;
  // Solo hay algo que descontar en una factura con IGV; en boleta y nota de
  // venta el precio del papel ya es el costo y el selector no aparece.
  const conIgv = igvEfectivo > 0 && precioIncluyeIgv;
  const baseDeLinea = (l: Linea) => costoBase(Number(l.costoUnitario), igvEfectivo, conIgv);
  // Lo que se muestra en cada línea: con IGV incluido, lo que dice el papel
  // (cantidad × precio tipeado); sin IGV, la base. El resumen sale de la
  // misma regla que aplica la RPC (`totalesCompra`), así nunca difieren.
  const importeDeLinea = (l: Linea) => (conIgv ? Math.round(l.cantidad * (Number(l.costoUnitario) || 0) * 100) / 100 : l.cantidad * baseDeLinea(l));
  const { subtotal, igv, total } = totalesCompra(
    lineas.map((l) => ({ cantidad: l.cantidad, costoTipeado: Number(l.costoUnitario) })),
    igvEfectivo,
    conIgv,
  );
  const hayPago = condicion === "contado" || pagarAhora;
  const sumaPagos = sumaLineasPago(pagos);
  // Al contado con un solo medio, el monto ES el total: acompaña a las líneas
  // mientras se tipean. Con dos o más medios, la persona reparte a mano.
  // Ajustado en el render (estado derivado), no en un efecto.
  const [totalPrevio, setTotalPrevio] = useState(total);
  if (total !== totalPrevio) {
    setTotalPrevio(total);
    if (condicion === "contado" && pagos.length === 1) setPagos([{ ...pagos[0], monto: total > 0 ? total.toFixed(2) : "" }]);
  }

  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    setLineas((actual) => actual.map((l, n) => (n === i ? { ...l, ...cambio } : l)));
  }

  function elegirProducto(i: number, productoId: string) {
    actualizarLinea(i, { productoId, varianteId: "", costoUnitario: "" });
  }

  function elegirVariante(i: number, varianteId: string) {
    const v = variantes.find((x) => x.varianteId === varianteId);
    // El último costo conocido de la variante se sugiere; la factura manda.
    actualizarLinea(i, { varianteId, costoUnitario: v && !lineas[i].costoUnitario ? String(costoParaTipear(v.costo, igvEfectivo, conIgv)) : lineas[i].costoUnitario });
  }

  function agregarLinea() {
    setLineas((a) => [...a, lineaVacia()]);
  }

  // Enter en el costo de la última línea agrega otra, como al bajar de
  // renglón en la factura de papel. En cualquier otro input, Enter no
  // envía el formulario: registrar una factura es el botón, no un tecleo.
  function enterEnCosto(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (i === lineas.length - 1 && lineas[i].productoId && lineas[i].costoUnitario !== "") agregarLinea();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validas = lineas.filter((l) => l.productoId && l.cantidad > 0);
    // Cada validación avisa arriba a la derecha Y deja el cursor en el campo.
    if (!proveedorId) return void avisar.error("Elige un proveedor.", { enfocar: "compra-proveedor" });
    if (!serie.trim()) return void avisar.error("La factura necesita serie y número, tal como figuran en el documento.", { enfocar: "compra-serie" });
    if (!numero.trim()) return void avisar.error("La factura necesita serie y número, tal como figuran en el documento.", { enfocar: "compra-numero" });
    if (validas.length === 0) return void avisar.error("Agrega al menos una línea con producto y cantidad.", { enfocar: "compra-linea-0-producto" });
    const sinCosto = lineas.findIndex((l) => l.productoId && l.cantidad > 0 && (l.costoUnitario === "" || Number(l.costoUnitario) < 0));
    if (sinCosto >= 0) return void avisar.error(`Cada línea necesita su costo unitario (${conIgv ? "con" : "sin"} IGV).`, { enfocar: `compra-linea-${sinCosto}-costo` });
    if (condicion === "credito" && !fechaVencimiento) return void avisar.error("Una compra al crédito necesita fecha de vencimiento.", { enfocar: "compra-vence" });
    const pagosRpc = hayPago ? lineasPagoParaRpc(pagos) : null;
    const pagoSinMonto = pagos.findIndex((l) => !(Number(l.monto) > 0));
    if (hayPago && !pagosRpc) return void avisar.error(condicion === "contado" ? "Cada medio de pago necesita su monto." : "Escribe el monto del pago o desmarca 'Registrar un pago ahora'.", { enfocar: `compra-pagos-monto-${Math.max(0, pagoSinMonto)}` });
    if (hayPago && condicion === "contado" && Math.abs(sumaPagos - total) > 0.005) return void avisar.error(`Al contado el pago debe sumar el total (${soles(total)}); los medios suman ${soles(sumaPagos)}.`, { enfocar: "compra-pagos-monto-0" });
    if (hayPago && sumaPagos > total + 0.005) return void avisar.error(`El pago (${soles(sumaPagos)}) supera el total de la factura (${soles(total)}).`, { enfocar: "compra-pagos-monto-0" });

    setLoading(true);
    const cerrarProceso = avisar.proceso(`Registrando ${TIPOS.find((t) => t.valor === tipo)!.texto.toLowerCase()} ${serie.trim().toUpperCase()}-${numero.trim()}…`);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("registrar_compra", {
      p_proveedor_id: proveedorId,
      p_serie: serie.trim(),
      p_numero: numero.trim(),
      p_condicion: condicion,
      p_ubicacion_destino_id: ubicacionId,
      p_items: validas.map((l) => ({
        producto_id: l.productoId,
        ...(l.varianteId ? { variante_id: l.varianteId } : {}),
        ...(l.descripcion.trim() ? { descripcion: l.descripcion.trim() } : {}),
        cantidad: l.cantidad,
        costo_unitario: baseDeLinea(l),
      })),
      p_tipo: tipo,
      p_fecha_emision: fechaEmision,
      ...(condicion === "credito" ? { p_fecha_vencimiento: fechaVencimiento } : {}),
      p_igv_porcentaje: igvEfectivo,
      // Con precios con IGV, el total del papel manda y el IGV absorbe el
      // redondeo (20260914190000_compras_total_del_papel.sql).
      ...(conIgv ? { p_total: total } : {}),
      ...(pagosRpc ? { p_pago: pagosRpc } : {}),
      ...(nota.trim() ? { p_nota: nota.trim() } : {}),
    });

    if (error) {
      cerrarProceso();
      setLoading(false);
      // Serie-número repetidos para este proveedor (candado `unique` en
      // `compras`): el cursor vuelve a la serie, como en las demás validaciones.
      const duplicada = error.code === "P0001" && error.message.includes("ya está registrada");
      avisar.error(traducirError(error, "registrar la factura"), duplicada ? { enfocar: "compra-serie" } : undefined);
      return;
    }

    // La factura ya existe. Los adjuntos se suben recién ahora (la ruta lleva
    // su id) y si alguno falla NO se pierde nada: se va al detalle con el
    // aviso de cuáles quedaron por subir, y desde ahí se reintenta.
    let fallidos: string[] = [];
    if (adjuntos.length) {
      const r = await subirAdjuntosCompra(supabase, data, adjuntos);
      fallidos = r.fallidos.map((f) => f.nombre);
    }
    cerrarProceso();
    setLoading(false);
    const documento = `${serie.trim().toUpperCase()}-${numero.trim()}`;
    avisar.exito(`${TIPOS.find((t) => t.valor === tipo)!.texto} ${documento} registrada`, {
      detalle: condicion === "contado" ? `Pagada al contado · ${soles(total)}` : `Queda en Por pagar · ${soles(total - sumaPagos)}`,
    });
    if (fallidos.length) avisar.aviso(`${fallidos.length === 1 ? "1 adjunto no subió" : `${fallidos.length} adjuntos no subieron`}: ${fallidos.join(", ")}`, { detalle: "Puedes reintentarlo desde el detalle." });
    // Registrada → de vuelta a la lista: el aviso de éxito ya dice qué quedó
    // (pagada / por pagar) y la factura recién creada aparece primera. Se usa
    // `replace` para que "atrás" no vuelva a este formulario ya enviado.
    //
    // Excepción: si algún adjunto no subió, se abre el detalle (como modal
    // encima de esta pantalla, ruta interceptada) porque es el único lugar
    // desde donde se reintenta. `desde=nueva` hace que al cerrarlo vaya a la
    // lista y no "atrás".
    if (fallidos.length) {
      const aviso = new URLSearchParams({ desde: "nueva", adjuntos_fallidos: fallidos.join("|") });
      router.push(`/compras/factura/${data}?${aviso}`);
    } else {
      router.replace("/compras");
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start"
    >
      {/* Columna principal: documento, líneas, pago, nota. El resumen va en
          la columna de la derecha y se queda fijo al hacer scroll. */}
      <div className="min-w-0 space-y-6">
        {/* ---------- cabecera ---------- */}
        <section className="card-cayla space-y-4 p-5">
          <p className={`${campoEtiqueta} flex items-center gap-2`}>
            <NumeroSeccion n={1} />
            Documento
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Proveedor"
              pie={
                <>
                  ¿No está en la lista?{" "}
                  <Link href="/compras/proveedores" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                    Regístralo en Proveedores
                  </Link>
                  .
                </>
              }
            >
              <div id="compra-proveedor">
                <ComboBuscable etiquetaAccesible="Proveedor" valor={proveedorId} onValor={setProveedorId} opciones={opcionesProveedor} marcador="Busca por nombre o RUC…" />
              </div>
            </Campo>
            <CampoSelectNativo
              etiqueta="Tipo de documento"
              value={tipo}
              onChange={(e) => {
                const nuevo = e.target.value as typeof tipo;
                setTipo(nuevo);
                // Al cambiar de tipo el IGV se acomoda solo; si vuelve a factura,
                // vuelve al 18 (no a lo que hubiera quedado escrito).
                setIgvPorcentaje(discriminaIgv(nuevo) ? IGV_POR_DEFECTO : "0");
              }}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.texto}
                </option>
              ))}
            </CampoSelectNativo>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <CampoTexto etiqueta="Serie" id="compra-serie" mono value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} placeholder="F001" maxLength={8} autoComplete="off" />
              <CampoTexto etiqueta="Número" id="compra-numero" mono value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="000123" maxLength={12} autoComplete="off" inputMode="numeric" />
            </div>
            <CampoFecha etiqueta="Fecha de emisión" valor={fechaEmision} onValor={setFechaEmision} required />
            <Segmentado
              etiqueta="Condición de pago"
              valor={condicion}
              onValor={(c) => {
                setCondicion(c);
                // Al pasar a contado, el único medio arranca con el total.
                if (c === "contado" && pagos.length === 1) setPagos([{ ...pagos[0], monto: total > 0 ? total.toFixed(2) : "" }]);
              }}
              opciones={[
                { valor: "contado", texto: "Al contado" },
                { valor: "credito", texto: "Al crédito" },
              ]}
              pie={condicion === "contado" ? "Se registra con su pago por el total." : "Queda en Por pagar hasta saldarse."}
            />
            {condicion === "credito" ? <CampoFecha etiqueta="Vence el" id="compra-vence" valor={fechaVencimiento} onValor={setFechaVencimiento} required /> : <div />}
            <CampoSelectNativo etiqueta="Mercadería destinada a" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </CampoSelectNativo>
            <CampoTexto
              etiqueta="IGV %"
              mono
              type="number"
              min={0}
              max={100}
              step="1"
              value={discriminaIgv(tipo) ? igvPorcentaje : "0"}
              onChange={(e) => setIgvPorcentaje(e.target.value)}
              disabled={!discriminaIgv(tipo)}
              ayuda={discriminaIgv(tipo) ? <span className="ml-2 normal-case tracking-normal text-tinta/50">0 si la factura no discrimina IGV</span> : undefined}
              pie={discriminaIgv(tipo) ? undefined : `Una ${TIPOS.find((t) => t.valor === tipo)!.texto.toLowerCase()} no discrimina IGV: el precio del documento ya es el costo.`}
            />
          </div>
        </section>

        {/* ---------- líneas ---------- */}
        <section className="card-cayla space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1">
            <p className={`${campoEtiqueta} flex items-center gap-2`}>
              <NumeroSeccion n={2} />
              Líneas de la factura
            </p>
            {igvEfectivo > 0 && <span aria-hidden className="hidden h-4 w-px bg-tinta/15 sm:block" />}
            {igvEfectivo > 0 ? (
              <Interruptor
                activo={precioIncluyeIgv}
                onActivo={setPrecioIncluyeIgv}
                etiqueta="El precio incluye IGV"
                pie={conIgv ? `El total es el que suma el papel; el ${igvEfectivo} % se descuenta al guardar el costo.` : undefined}
              />
            ) : (
              <p className="text-xs text-tinta/55">Costo unitario tal como figura en el documento: ya es el costo.</p>
            )}
          </div>
          <div className={`hidden gap-2 border-b border-tinta/10 pb-1 sm:grid ${PLANTILLA_LINEAS}`}>
            {["Producto", "Talla y color", "Cantidad", conIgv ? "Precio c/IGV" : "Costo unit.", conIgv ? "Importe c/IGV" : "Subtotal", ""].map((t, i) => (
              <span key={i} className={`label-cayla text-[11px] text-tinta/55 ${i === 2 ? "text-center" : i >= 3 ? "text-right" : ""}`}>
                {t}
              </span>
            ))}
          </div>
          {lineas.map((l, i) => {
            const producto = productos.find((p) => p.id === l.productoId);
            return (
              <div key={i} className={`grid gap-2 border-b border-tinta/10 pb-3 last:border-0 sm:items-end ${PLANTILLA_LINEAS}`}>
                <ComboBuscable
                  etiquetaAccesible="Producto"
                  id={`compra-linea-${i}-producto`}
                  valor={l.productoId}
                  onValor={(id) => elegirProducto(i, id)}
                  opciones={opcionesProducto}
                  marcador="Busca la prenda…"
                  autoFocus={i > 0 && i === lineas.length - 1}
                />
                <SelectNativo aria-label="Talla y color" value={l.varianteId} onChange={(e) => elegirVariante(i, e.target.value)} disabled={!l.productoId}>
                  <option value="">Sin desglose (se reparte al recibir)</option>
                  {producto?.variantes.map((v) => (
                    <option key={v.varianteId} value={v.varianteId}>
                      {[v.talla, v.color].filter(Boolean).join(" / ") || v.sku}
                    </option>
                  ))}
                </SelectNativo>
                <input
                  type="number"
                  min={1}
                  max={999999}
                  aria-label="Cantidad"
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, { cantidad: Math.min(999999, Math.max(1, Number(e.target.value) || 1)) })}
                  className={`${NUMERO} border-b border-tinta/25 bg-transparent px-0.5 py-2 text-center text-sm tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  id={`compra-linea-${i}-costo`}
                  placeholder="Costo unit."
                  aria-label="Costo unitario"
                  value={l.costoUnitario}
                  onChange={(e) => actualizarLinea(i, { costoUnitario: e.target.value })}
                  onKeyDown={(e) => enterEnCosto(e, i)}
                  className={`${NUMERO} border-b border-tinta/25 bg-transparent px-0.5 py-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo`}
                />
                <span className="min-w-0 truncate py-2 text-sm tabular-nums text-tinta/75 sm:text-right" title={soles(importeDeLinea(l))}>
                  {soles(importeDeLinea(l))}
                </span>
                <span className="py-2 sm:text-right">
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => setLineas((a) => a.filter((_, n) => n !== i))} className="text-xs text-rojo">
                      Quitar
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          <div className="flex items-baseline justify-between">
            <button type="button" onClick={agregarLinea} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
              + Agregar línea
            </button>
            <span className="text-xs text-tinta/45">Enter en el costo también agrega una línea.</span>
          </div>
        </section>

        {/* ---------- pago ---------- */}
        <section className="card-cayla space-y-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={`${campoEtiqueta} flex items-center gap-2`}>
              <NumeroSeccion n={3} />
              {condicion === "contado" ? "Pago (obligatorio al contado)" : "Pago"}
            </p>
            {condicion === "credito" && (
              <label className="flex items-center gap-2 text-sm text-tinta/75">
                <input type="checkbox" checked={pagarAhora} onChange={(e) => setPagarAhora(e.target.checked)} className="accent-rojo" />
                Registrar un pago ahora
              </label>
            )}
          </div>
          {hayPago ? (
            <LineasPago id="compra-pagos" lineas={pagos} onLineas={setPagos} objetivo={total} exacto={condicion === "contado"} />
          ) : (
            <p className="text-sm text-tinta/65">Sin pago por ahora: la factura aparecerá en Por pagar con vencimiento el {fechaVencimiento.split("-").reverse().join("/")}.</p>
          )}
        </section>

      </div>

      {/* ---------- resumen (columna derecha) ----------
          El formulario es largo (documento, N líneas, pago, nota) y el total
          quedaba abajo del todo: al escribir la línea 8 nadie sabía si el
          total ya cuadraba con el papel. El resumen vive a la derecha y se
          queda pegado al hacer scroll (pedido de Felipe, 2026-09-14 — antes
          era un pie fijo abajo). En celular cae al final del formulario. */}
      <aside className="card-cayla space-y-4 p-5 lg:sticky lg:top-24">
        <p className={campoEtiqueta}>Resumen</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-tinta/65">Subtotal</dt>
            <dd className="tabular-nums text-tinta">{soles(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-tinta/65">{discriminaIgv(tipo) ? `IGV ${igvEfectivo} %` : "Sin IGV discriminado"}</dt>
            <dd className="tabular-nums text-tinta">{soles(igv)}</dd>
          </div>
        </dl>
        <div className="border-t border-sand pt-3">
          <p className={campoEtiqueta}>Total</p>
          <p className="font-display mt-1 text-3xl tabular-nums text-tinta">{soles(total)}</p>
          {condicion === "contado" ? (
            <p className="mt-1 text-xs text-tinta/55">Se registra con su pago por el total.</p>
          ) : (
            <p className="mt-1 text-xs text-tinta/55">Queda en Por pagar hasta el {fechaVencimiento.split("-").reverse().join("/")}.</p>
          )}
        </div>
        <SelectorAdjuntos archivos={adjuntos} onArchivos={setAdjuntos} />
        {/* La nota va en el resumen y no al final de la columna larga, y
            DESPUÉS de los adjuntos: es lo último que se escribe antes de
            registrar, así queda pegada al botón (pedido de Felipe, 2026-09-14). */}
        <CampoTexto etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que conviene recordar" />
        <div className="flex flex-col gap-2">
          <Boton type="submit" peso="primario" cargando={loading} className="w-full">
            {loading && adjuntos.length
              ? "Registrando y subiendo adjuntos…"
              : condicion === "contado" ? `Registrar ${TIPOS.find((t) => t.valor === tipo)!.texto.toLowerCase()} y pago · ${soles(total)}` : `Registrar ${TIPOS.find((t) => t.valor === tipo)!.texto.toLowerCase()}`}
          </Boton>
          <Boton type="button" peso="discreto" onClick={() => router.push("/compras")} disabled={loading} className="w-full">
            Cancelar
          </Boton>
        </div>
      </aside>
    </form>
  );
}
