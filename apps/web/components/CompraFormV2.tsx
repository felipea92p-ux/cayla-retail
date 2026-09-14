"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Boton, CampoSelectNativo, CampoTexto, Segmentado, SelectNativo } from "@/components/ui/campos";
import { campoEtiqueta } from "@/components/ui/Modal";
import { ETIQUETA_METODO, soles } from "@/lib/compras-reglas";

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

const METODOS = Object.keys(ETIQUETA_METODO);
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

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function CompraFormV2({
  proveedores,
  ubicaciones,
  ubicacionInicialId,
  variantes,
}: {
  proveedores: Proveedor[];
  ubicaciones: Ubicacion[];
  ubicacionInicialId: string;
  variantes: Variante[];
}) {
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

  const lineaVacia = (): Linea => ({
    productoId: productos[0]?.id ?? "",
    varianteId: "",
    cantidad: 1,
    costoUnitario: "",
    descripcion: "",
  });

  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["valor"]>("factura");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [fechaEmision, setFechaEmision] = useState(hoyISO());
  const [condicion, setCondicion] = useState<"contado" | "credito">("contado");
  const [fechaVencimiento, setFechaVencimiento] = useState(sumarDias(hoyISO(), 30));
  const [ubicacionId, setUbicacionId] = useState(ubicacionInicialId || ubicaciones[0]?.id || "");
  const [igvPorcentaje, setIgvPorcentaje] = useState("18");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [pagarAhora, setPagarAhora] = useState(false);
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoMetodo, setPagoMetodo] = useState(METODOS[0]);
  const [pagoReferencia, setPagoReferencia] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const subtotal = lineas.reduce((acc, l) => acc + l.cantidad * (Number(l.costoUnitario) || 0), 0);
  const igv = Math.round(subtotal * (Number(igvPorcentaje) || 0)) / 100;
  const total = Math.round((subtotal + igv) * 100) / 100;
  const hayPago = condicion === "contado" || pagarAhora;

  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    setLineas((actual) => actual.map((l, n) => (n === i ? { ...l, ...cambio } : l)));
  }

  function elegirProducto(i: number, productoId: string) {
    actualizarLinea(i, { productoId, varianteId: "", costoUnitario: "" });
  }

  function elegirVariante(i: number, varianteId: string) {
    const v = variantes.find((x) => x.varianteId === varianteId);
    // El último costo conocido de la variante se sugiere; la factura manda.
    actualizarLinea(i, { varianteId, costoUnitario: v && !lineas[i].costoUnitario ? String(v.costo) : lineas[i].costoUnitario });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validas = lineas.filter((l) => l.productoId && l.cantidad > 0);
    if (!proveedorId) return setError("Elige un proveedor.");
    if (!serie.trim() || !numero.trim()) return setError("La factura necesita serie y número, tal como figuran en el documento.");
    if (validas.length === 0) return setError("Agrega al menos una línea con producto y cantidad.");
    if (validas.some((l) => l.costoUnitario === "" || Number(l.costoUnitario) < 0)) return setError("Cada línea necesita su costo unitario (sin IGV).");
    if (condicion === "credito" && !fechaVencimiento) return setError("Una compra al crédito necesita fecha de vencimiento.");
    if (hayPago && condicion === "credito" && !(Number(pagoMonto) > 0)) return setError("Escribe el monto del pago o desmarca 'Registrar un pago ahora'.");

    setLoading(true);
    setError(null);

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
        costo_unitario: Number(l.costoUnitario),
      })),
      p_tipo: tipo,
      p_fecha_emision: fechaEmision,
      ...(condicion === "credito" ? { p_fecha_vencimiento: fechaVencimiento } : {}),
      p_igv_porcentaje: Number(igvPorcentaje) || 0,
      ...(hayPago
        ? {
            p_pago: {
              monto: condicion === "contado" ? total : Number(pagoMonto),
              metodo: pagoMetodo,
              ...(pagoReferencia.trim() ? { referencia: pagoReferencia.trim() } : {}),
            },
          }
        : {}),
      ...(nota.trim() ? { p_nota: nota.trim() } : {}),
    });

    setLoading(false);
    if (error) {
      setError(traducirError(error, "registrar la factura"));
      return;
    }
    router.push(`/compras/${data}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ---------- cabecera ---------- */}
      <section className="card-cayla space-y-4 p-5">
        <p className={campoEtiqueta}>Documento</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelectNativo etiqueta="Proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.ruc ? ` · ${p.ruc}` : ""}
              </option>
            ))}
          </CampoSelectNativo>
          <CampoSelectNativo etiqueta="Tipo de documento" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.texto}</option>
            ))}
          </CampoSelectNativo>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <CampoTexto etiqueta="Serie" mono value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} placeholder="F001" maxLength={8} autoComplete="off" />
            <CampoTexto etiqueta="Número" mono value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="000123" maxLength={12} autoComplete="off" inputMode="numeric" />
          </div>
          <CampoTexto etiqueta="Fecha de emisión" type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          <Segmentado
            etiqueta="Condición de pago"
            valor={condicion}
            onValor={setCondicion}
            opciones={[
              { valor: "contado", texto: "Al contado" },
              { valor: "credito", texto: "Al crédito" },
            ]}
            pie={condicion === "contado" ? "Se registra con su pago por el total." : "Queda en Por pagar hasta saldarse."}
          />
          {condicion === "credito" ? (
            <CampoTexto etiqueta="Vence el" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} required />
          ) : (
            <div />
          )}
          <CampoSelectNativo etiqueta="Mercadería destinada a" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </CampoSelectNativo>
          <CampoTexto etiqueta="IGV %" mono type="number" min={0} max={100} step="1" value={igvPorcentaje} onChange={(e) => setIgvPorcentaje(e.target.value)} ayuda={<span className="ml-2 normal-case tracking-normal text-tinta/50">0 si el documento no discrimina IGV</span>} />
        </div>
      </section>

      {/* ---------- líneas ---------- */}
      <section className="card-cayla space-y-3 p-5">
        <div className="flex items-baseline justify-between">
          <p className={campoEtiqueta}>Líneas de la factura</p>
          <p className="text-xs text-tinta/55">Costo unitario sin IGV, tal como figura en el documento.</p>
        </div>
        <div className={`hidden gap-2 border-b border-tinta/10 pb-1 sm:grid ${PLANTILLA_LINEAS}`}>
          {["Producto", "Talla y color", "Cantidad", "Costo unit.", "Subtotal", ""].map((t, i) => (
            <span key={i} className={`label-cayla text-[11px] text-tinta/55 ${i === 2 ? "text-center" : i >= 3 ? "text-right" : ""}`}>
              {t}
            </span>
          ))}
        </div>
        {lineas.map((l, i) => {
          const producto = productos.find((p) => p.id === l.productoId);
          return (
            <div key={i} className={`grid gap-2 border-b border-tinta/10 pb-3 last:border-0 sm:items-end ${PLANTILLA_LINEAS}`}>
              <SelectNativo aria-label="Producto" value={l.productoId} onChange={(e) => elegirProducto(i, e.target.value)}>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.referencia}</option>
                ))}
              </SelectNativo>
              <SelectNativo aria-label="Talla y color" value={l.varianteId} onChange={(e) => elegirVariante(i, e.target.value)}>
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
                placeholder="Costo unit."
                aria-label="Costo unitario"
                value={l.costoUnitario}
                onChange={(e) => actualizarLinea(i, { costoUnitario: e.target.value })}
                className={`${NUMERO} border-b border-tinta/25 bg-transparent px-0.5 py-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo`}
              />
              <span className="min-w-0 truncate py-2 text-sm tabular-nums text-tinta/75 sm:text-right" title={soles(l.cantidad * (Number(l.costoUnitario) || 0))}>
                {soles(l.cantidad * (Number(l.costoUnitario) || 0))}
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
        <button type="button" onClick={() => setLineas((a) => [...a, lineaVacia()])} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Agregar línea
        </button>

        <div className="ml-auto grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 pt-2 text-sm">
          <span className="text-tinta/65">Subtotal</span>
          <span className="text-right tabular-nums text-tinta">{soles(subtotal)}</span>
          <span className="text-tinta/65">IGV {Number(igvPorcentaje) || 0}%</span>
          <span className="text-right tabular-nums text-tinta">{soles(igv)}</span>
          <span className="label-cayla self-end text-[11px] text-tinta/65">Total</span>
          <span className="font-display text-right text-2xl tabular-nums text-tinta">{soles(total)}</span>
        </div>
      </section>

      {/* ---------- pago ---------- */}
      <section className="card-cayla space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={campoEtiqueta}>{condicion === "contado" ? "Pago (obligatorio al contado)" : "Pago"}</p>
          {condicion === "credito" && (
            <label className="flex items-center gap-2 text-sm text-tinta/75">
              <input type="checkbox" checked={pagarAhora} onChange={(e) => setPagarAhora(e.target.checked)} className="accent-rojo" />
              Registrar un pago ahora
            </label>
          )}
        </div>
        {hayPago ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {condicion === "contado" ? (
              <div>
                <p className={campoEtiqueta}>Monto</p>
                <p className="font-display mt-1.5 text-2xl tabular-nums text-tinta">{soles(total)}</p>
                <p className="mt-1 text-xs text-tinta/55">Al contado se paga el total.</p>
              </div>
            ) : (
              <CampoTexto etiqueta="Monto" mono type="number" min={0.01} step="0.01" value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)} placeholder="0.00" />
            )}
            <CampoSelectNativo etiqueta="Medio de pago" value={pagoMetodo} onChange={(e) => setPagoMetodo(e.target.value)}>
              {METODOS.map((m) => (
                <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>
              ))}
            </CampoSelectNativo>
            <CampoTexto etiqueta="Referencia" mono value={pagoReferencia} onChange={(e) => setPagoReferencia(e.target.value)} placeholder="N° operación" autoComplete="off" />
          </div>
        ) : (
          <p className="text-sm text-tinta/65">Sin pago por ahora: la factura aparecerá en Por pagar con vencimiento el {fechaVencimiento.split("-").reverse().join("/")}.</p>
        )}
      </section>

      <CampoTexto etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que conviene recordar de esta compra" />

      {error && <p className="text-sm text-rojo">{error}</p>}

      <div className="flex justify-end gap-3">
        <Boton type="button" peso="discreto" onClick={() => router.push("/compras")} disabled={loading}>
          Cancelar
        </Boton>
        <Boton type="submit" peso="primario" cargando={loading}>
          {condicion === "contado" ? `Registrar factura y pago · ${soles(total)}` : "Registrar factura"}
        </Boton>
      </div>
    </form>
  );
}
