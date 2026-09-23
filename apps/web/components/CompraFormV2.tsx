"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Boton, Campo, CampoTexto, Interruptor, SelectNativo } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { SelectorAdjuntos } from "@/components/AdjuntosCompra";
import { DestinoDeLaMercaderia, RepartoDeLinea } from "@/components/RepartoEnRegistro";
import { LineasPago, lineaPagoVacia, lineasPagoParaRpc, sumaLineasPago, type LineaPago } from "@/components/LineasPago";
import { subirAdjuntosCompra } from "@/lib/adjuntos-compra";
import { campoEtiqueta } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { faltaDatoDePago } from "@/lib/destino-de-pago";
import { ayudaDeCosto, costoConocido, progresoDeCompra, requisitosDeCompra } from "@/lib/compra-form-progreso";
import { AyudaCostoLinea, BarraProgreso, BotonRegistrar, CifraCompra, ListaPendientes, NumeroTramo, TextoQueSeAsienta, type EstadoRegistro } from "@/components/CompraFormProgreso";
import { detalleProveedorCombo, type DatosPagoProveedor } from "@/lib/proveedores-reglas";
import { hoyLima, sumarDias } from "@/lib/fechas-lima";
import { costoBase, costoParaTipear, ETIQUETA_METODO, fechaCorta, METODO_SALDO_A_FAVOR, soles, totalesCompra } from "@/lib/compras-reglas";
import { destinosParaRpc, repartirEnPartesIguales, repartoSoloDe, tiendaGestora, unidadesPorTienda, type RepartoLinea } from "@/lib/reparto-reglas";

// Registrar una factura de proveedor (ADR-0035). Dos reglas de Felipe que
// esta pantalla refleja pero NO decide — las decide la RPC `registrar_compra`:
//   · Contado ⇒ el pago es obligatorio y es por el total. Acá el monto se
//     muestra fijo; si alguien lo manda distinto, la base lo rechaza igual.
//   · Crédito ⇒ vencimiento obligatorio, pago opcional (cae en "Por pagar").
// Líneas: cada proveedor factura distinto. Si detalla talla/color, se elige
// la variante; si agrupa ("Blusa Lino x 24"), se deja "Sin desglose" y el
// reparto por talla/color se hace al recibir.
type Variante = { varianteId: string; sku: string; talla: string | null; color: string | null; productoId: string; referencia: string; costo: number };
// Lo que se sabe de un proveedor al elegirlo (ADR-0111): su plazo y forma de pago preferidos, y lo que ya se le
// debe. Con eso el vencimiento se sugiere solo y se decide la compra sabiendo la deuda que ya hay con él.
// `datosPago` (ADR-0134): cómo se le paga (cuenta, CCI, Yape/Plin, titular); con él el pago muestra a dónde va la plata.
type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  /** Marcas con que se conoce al proveedor (ADR-0140): se buscan y se muestran junto al RUC. */
  marcas?: readonly string[];
  plazoCreditoDias?: number | null;
  formaPagoPreferida?: string | null;
  saldo?: number | null;
  saldoFavor?: number | null;
  datosPago?: DatosPagoProveedor;
};
type Ubicacion = { id: string; nombre: string };

// `id` es la identidad estable de la línea (no se muestra): con ella React sabe CUÁL línea entró o salió, y así se
// anima esa y no otra. Antes la clave era la posición, y quitar la línea 1 «movía» los datos a la 0.
// `reparto` (ADR-0139) solo se usa cuando el comprobante se reparte entre tiendas: tienda → unidades de ESTA línea.
type Linea = { id: string; productoId: string; varianteId: string; cantidad: number; costoUnitario: string; descripcion: string; reparto: RepartoLinea };
let secuenciaLineas = 0;

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

// «Hoy» y los cálculos de fecha son de Lima (`fechas-lima`): `new Date().toISOString()` da la fecha en UTC, y de 7 pm
// a medianoche ya es «mañana» — el comprobante se registraba con la emisión de un día después.
const hoyISO = hoyLima;

// Cuánto dura el colapso de una línea al quitarla (`cr-linea-sale` en comprobantes-registro.css) y cuánto se deja
// ver el visto del botón antes de volver a la lista. Si se cambia uno, cambiar el otro.
const MS_LINEA_SALE = 240;
const MS_VISTO_REGISTRADO = 650;
const sinMovimiento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function CompraFormV2({
  proveedores,
  ubicaciones,
  misTiendas,
  ubicacionInicialId,
  variantes,
  proveedorInicialId = null,
  deudaTotal = 0,
  cabecera,
  repartoDisponible = true,
}: {
  proveedores: Proveedor[];
  ubicaciones: Ubicacion[];
  /** ADR-0151 (F5): solo para un comprador de tienda — las tiendas donde puede ser gestora (`fn_compras_ubicaciones()`),
   *  un subconjunto de `ubicaciones`. `undefined` = sin restricción (líder, como siempre): elige cualquiera de
   *  `ubicaciones` y la gestora sale de `tiendasReparto[0]`. Con esto, la gestora sale de LA tienda del comprador que
   *  siga en el reparto (nunca de la posición 0, que sigue el orden de `ubicaciones` y podría no ser la suya). */
  misTiendas?: Ubicacion[];
  ubicacionInicialId: string;
  variantes: Variante[];
  /** `?prov=<uuid>`: llega desde «+ Comprobante» de la lista o la ficha de un proveedor. */
  proveedorInicialId?: string | null;
  /** Deuda total con todos los proveedores: para mostrar cómo cambia la concentración al registrar. */
  deudaTotal?: number;
  /** Título de la pantalla (enlace «← Comprobantes», título y bajada): va a la izquierda y el avance «Listo N de 4» a la derecha, como en el diseño. */
  cabecera?: ReactNode;
  /** ADR-0139: ¿esta base ya tiene el reparto por tienda? Si no, no se ofrece «Repartir entre tiendas». */
  repartoDisponible?: boolean;
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

  // La línea nace sin producto: el combobox muestra "Busca la prenda…" y
  // quien copia la factura tipea. Preseleccionar el primero del catálogo
  // era una trampa — una línea olvidada se registraba con un producto real.
  const lineaVacia = (): Linea => ({
    id: `l${++secuenciaLineas}`,
    productoId: "",
    varianteId: "",
    cantidad: 1,
    costoUnitario: "",
    descripcion: "",
    reparto: {},
  });

  const opcionesProducto = useMemo(() => productos.map((p) => ({ valor: p.id, texto: p.referencia, detalle: `${p.variantes.length} ${p.variantes.length === 1 ? "variante" : "variantes"}` })), [productos]);
  // El RUC y las marcas van como detalle: el combo filtra por texto + detalle, así que se encuentra al proveedor
  // tipeando su razón social, su número o la marca con que se le conoce (ADR-0140).
  const opcionesProveedor = useMemo(() => proveedores.map((p) => ({ valor: p.id, texto: p.nombre, detalle: detalleProveedorCombo(p.ruc, p.marcas) })), [proveedores]);
  // Solo se promete «marca» si algún proveedor tiene marcas que buscar (si la lectura falló, todos llegan sin ellas).
  const hayMarcas = useMemo(() => proveedores.some((p) => (p.marcas?.length ?? 0) > 0), [proveedores]);

  // Sin proveedor preseleccionado: elegir al primero de la lista era una
  // trampa — una factura registrada sin mirar iba a parar al proveedor
  // equivocado. La validación ya pedía "Elige un proveedor".
  const [proveedorId, setProveedorId] = useState(proveedorInicialId && proveedores.some((p) => p.id === proveedorInicialId) ? proveedorInicialId : "");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["valor"]>("factura");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [fechaEmision, setFechaEmision] = useState(hoyISO());
  const [condicion, setCondicion] = useState<"contado" | "credito">("contado");
  // El vencimiento se SUGIERE con el plazo de crédito del proveedor (emisión + plazo, 30 días si no tiene) mientras la
  // persona no lo haya escrito a mano: el plazo ya se guardaba en la ficha y nadie lo leía, y cada vencimiento tipeado
  // a ojo es uno que puede quedar mal puesto. Si cambia la emisión o el proveedor y no se tocó, se recalcula.
  const [vencimientoEditado, setVencimientoEditado] = useState<string | null>(null);
  // Cuándo se espera el fardo (opcional). Vacío = la base considera atrasada a los 7 días de la emisión.
  // Llegada estimada: arranca en la sugerida (emisión + 7 días) y la acompaña si cambia la emisión; solo se «fija» si la persona la edita.
  const [llegadaEditada, setLlegadaEditada] = useState<string | null>(null);
  const [ubicacionId, setUbicacionId] = useState(ubicacionInicialId || ubicaciones[0]?.id || "");
  // Repartir el comprobante entre tiendas (ADR-0139): cada una recibe lo suyo. Sin repartir, todo va a `ubicacionId` como
  // siempre y la RPC no recibe `destinos`. Las tiendas que participan se marcan una vez y cada línea las reparte.
  const [repartir, setRepartir] = useState(false);
  const [tiendasReparto, setTiendasReparto] = useState<string[]>([]);
  const [igvPorcentaje, setIgvPorcentaje] = useState(IGV_POR_DEFECTO);
  // Cómo vienen los precios en el papel. La base siempre guarda el costo sin
  // IGV (`costoBase` en lib/compras-reglas.ts); esto solo dice cómo se tipea.
  const [precioIncluyeIgv, setPrecioIncluyeIgv] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>(() => [lineaVacia()]);
  // Qué línea acaba de agregarse (entra con un desliz) y cuál se está quitando (se colapsa antes de desaparecer).
  const [lineaNuevaId, setLineaNuevaId] = useState<string | null>(null);
  const [saliendoId, setSaliendoId] = useState<string | null>(null);
  const [pagarAhora, setPagarAhora] = useState(false);
  // Uno o varios medios de pago (LineasPago). Al contado la suma tiene que
  // ser el total; al crédito, no pasarse. La RPC lo vuelve a exigir.
  const [pagos, setPagos] = useState<LineaPago[]>([lineaPagoVacia()]);
  const [nota, setNota] = useState("");
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  // La factura ya quedó registrada: el botón muestra su visto un momento antes de volver a la lista.
  const [registrada, setRegistrada] = useState(false);
  // El bloque de pago solo se revela cuando la PERSONA cambió la condición o marcó «pagar ahora»; al abrir la pantalla
  // ya está ahí y no se anima.
  const [pagoTocado, setPagoTocado] = useState(false);
  // ¿Ya existe este comprobante de este proveedor? Se consulta una vez al salir del campo (no en cada tecla) y se
  // recuerda por clave «proveedor|serie|número». Es una PISTA: quien manda es el candado `unique` de la base.
  const [existentes, setExistentes] = useState<Record<string, boolean>>({});
  // Un reintento (red que se corta después del commit y antes de la respuesta — ADR-0032)
  // tiene que mandar el MISMO token para que `retail.compras.token_cliente` lo reconozca
  // como el mismo envío y devuelva la factura que ya existe, en vez del error
  // "ya está registrada". Solo se renueva después de un éxito.
  const token = useRef<string>(crypto.randomUUID());

  const estadoRegistro: EstadoRegistro = registrada ? "hecho" : loading ? "cargando" : "reposo";
  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const plazoDias = proveedor?.plazoCreditoDias ?? 30;
  // Solo aviso: registrar el comprobante NO depende de tener la cuenta del proveedor.
  const faltaCuenta = proveedor?.datosPago ? faltaDatoDePago(proveedor.datosPago) : null;
  const vencimientoSugerido = sumarDias(fechaEmision, plazoDias);
  const fechaVencimiento = vencimientoEditado ?? vencimientoSugerido;
  const llegadaSugerida = sumarDias(fechaEmision, 7);
  const fechaLlegada = llegadaEditada ?? llegadaSugerida;
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
  // Qué falta para poder registrar: UNA sola función pura (lib/compra-form-progreso.ts) alimenta la lista junto al
  // botón, la barra «Listo N de 4», el círculo de cada tramo, el botón y los avisos de `onSubmit`.
  const requisitos = requisitosDeCompra({
    proveedorId,
    serie,
    numero,
    lineas,
    repartir,
    condicion,
    pagarAhora,
    fechaVencimiento,
    conIgv,
    total,
    sumaPagos,
    indicePagoSinMonto: pagos.findIndex((l) => !(Number(l.monto) > 0)),
  });
  const progreso = progresoDeCompra(requisitos);
  // Para el resumen «Dónde cae»: cuántas unidades le tocan a cada tienda (solo cuando se reparte).
  const unidadesTienda = unidadesPorTienda(lineas.filter((l) => l.productoId && l.cantidad > 0));
  const porTienda = ubicaciones.filter((u) => (unidadesTienda[u.id] ?? 0) > 0).map((u) => ({ id: u.id, nombre: u.nombre, unidades: unidadesTienda[u.id] }));
  // La tienda gestora que se manda a la RPC (ADR-0151, F3: `p_ubicacion_destino_id` es la gestora desde esta ADR;
  // `tiendaGestora`, con sus pruebas, en `lib/reparto-reglas.ts`).
  const gestora = tiendaGestora(repartir, tiendasReparto, ubicacionId, misTiendas?.map((u) => u.id));
  const documentoNormalizado = `${serie.trim().toUpperCase()}-${numero.trim()}`;
  const documentoRepetido = existentes[`${proveedorId}|${documentoNormalizado}`] === true;
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

  function alternarRepartir(activo: boolean) {
    setRepartir(activo);
    // Al activarlo arranca con la tienda que ya estaba elegida; las demás se marcan a mano.
    if (activo && tiendasReparto.length === 0) setTiendasReparto([ubicacionId]);
  }

  function cambiarTiendasReparto(ids: string[]) {
    setTiendasReparto(ids);
    // La tienda que se desmarca deja de recibir en TODAS las líneas (y cada línea vuelve a decir cuánto falta).
    setLineas((a) => a.map((l) => ({ ...l, reparto: repartoSoloDe(l.reparto, ids) })));
  }

  function partesIgualesEnTodas() {
    setLineas((a) => a.map((l) => ({ ...l, reparto: repartirEnPartesIguales(l.cantidad, tiendasReparto) })));
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
    const nueva = lineaVacia();
    setLineaNuevaId(nueva.id);
    setLineas((a) => [...a, nueva]);
  }

  // Quitar: la línea se colapsa (240 ms) y recién entonces sale de la lista. Con movimiento reducido sale de una vez.
  // Mientras una se está yendo no se acepta otro «Quitar»: dos colapsos a la vez se pisarían.
  function quitarLinea(id: string) {
    if (saliendoId) return;
    const sacar = () => setLineas((a) => a.filter((l) => l.id !== id));
    if (sinMovimiento()) return sacar();
    setSaliendoId(id);
    window.setTimeout(() => {
      sacar();
      setSaliendoId(null);
    }, MS_LINEA_SALE);
  }

  // Lectura mínima, solo lectura, al salir del campo (o al elegir proveedor): ¿ya hay un comprobante con esta serie y
  // número de este proveedor? Si el usuario no puede leer `compras` (solo líderes ven el dinero, ADR-0126) o la red
  // falla, no hay pista y no pasa nada: el error real lo da la base al registrar.
  async function comprobarRepetido(proveedor: string, s: string, n: string) {
    const doc = `${s.trim().toUpperCase()}-${n.trim()}`;
    if (!proveedor || !s.trim() || !n.trim()) return;
    const clave = `${proveedor}|${doc}`;
    if (clave in existentes) return;
    const { data, error } = await createClient().from("compras").select("id").eq("proveedor_id", proveedor).eq("serie", s.trim().toUpperCase()).eq("numero", n.trim()).limit(1);
    if (error) return;
    setExistentes((a) => ({ ...a, [clave]: (data?.length ?? 0) > 0 }));
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
    if (loading || registrada) return;
    const validas = lineas.filter((l) => l.productoId && l.cantidad > 0);
    // Las mismas reglas que la lista de pendientes (`requisitosDeCompra`): el primer requisito sin cumplir avisa arriba
    // a la derecha Y deja el cursor en el campo. Con el botón deshabilitado hasta cumplirlos, esto es la red de
    // seguridad (Enter, un envío forzado): la base vuelve a exigir todo en `registrar_compra`.
    const pendiente = requisitos.find((r) => !r.ok);
    if (pendiente) return void (pendiente.error && avisar.error(pendiente.error.mensaje, { enfocar: pendiente.error.enfocar }));
    const pagosRpc = hayPago ? lineasPagoParaRpc(pagos) : null;

    setLoading(true);
    const cerrarProceso = avisar.proceso(`Registrando ${TIPOS.find((t) => t.valor === tipo)!.texto.toLowerCase()} ${serie.trim().toUpperCase()}-${numero.trim()}…`);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("registrar_compra", {
      p_proveedor_id: proveedorId,
      p_serie: serie.trim(),
      p_numero: numero.trim(),
      p_condicion: condicion,
      // Repartido: cada línea trae sus `destinos`, y este parámetro pasa a ser la tienda GESTORA (ADR-0151, F3) —
      // ya no es solo un valor por defecto. Ver `gestora` arriba: para un comprador nunca es una posición ciega.
      p_ubicacion_destino_id: gestora,
      p_items: validas.map((l) => ({
        producto_id: l.productoId,
        ...(l.varianteId ? { variante_id: l.varianteId } : {}),
        ...(l.descripcion.trim() ? { descripcion: l.descripcion.trim() } : {}),
        cantidad: l.cantidad,
        costo_unitario: baseDeLinea(l),
        // Cuántas unidades de ESTA línea le tocan a cada tienda: deben sumar `cantidad` (la base lo exige y rechaza si no).
        ...(repartir ? { destinos: destinosParaRpc(l.reparto) } : {}),
      })),
      p_tipo: tipo,
      p_fecha_emision: fechaEmision,
      ...(condicion === "credito" ? { p_fecha_vencimiento: fechaVencimiento } : {}),
      p_fecha_estimada_llegada: fechaLlegada,
      p_igv_porcentaje: igvEfectivo,
      // Con precios con IGV, el total del papel manda y el IGV absorbe el
      // redondeo (20260914190000_compras_total_del_papel.sql).
      ...(conIgv ? { p_total: total } : {}),
      ...(pagosRpc ? { p_pago: pagosRpc } : {}),
      ...(nota.trim() ? { p_nota: nota.trim() } : {}),
      p_token: token.current,
    });

    if (error) {
      cerrarProceso();
      setLoading(false);
      // Serie-número repetidos para este proveedor (candado `unique` en
      // `compras`): el cursor vuelve a la serie, como en las demás validaciones.
      const duplicada = error.code === "P0001" && error.message.includes("ya está registrada");
      avisar.error(traducirError(error, "registrar el comprobante", { confirmarAntesDeRepetir: true }), duplicada ? { enfocar: "compra-serie" } : undefined);
      return;
    }

    // La factura ya existe: lo que se envíe desde aquí en adelante es otra intención.
    token.current = crypto.randomUUID();

    // Los adjuntos se suben recién ahora (la ruta lleva
    // su id) y si alguno falla NO se pierde nada: se va al detalle con el
    // aviso de cuáles quedaron por subir, y desde ahí se reintenta.
    let fallidos: string[] = [];
    if (adjuntos.length) {
      const r = await subirAdjuntosCompra(supabase, data, adjuntos);
      fallidos = r.fallidos.map((f) => f.nombre);
    }
    cerrarProceso();
    setLoading(false);
    setRegistrada(true);
    const documento = `${serie.trim().toUpperCase()}-${numero.trim()}`;
    avisar.exito(`${TIPOS.find((t) => t.valor === tipo)!.texto} ${documento} registrada`, {
      // Lo que queda por pagar descuenta SOLO lo que de verdad se registró: sin «registrar un pago ahora» no se manda ningún
      // pago (`hayPago`), aunque el medio escrito antes de pasar a crédito conserve su monto en pantalla.
      detalle: condicion === "contado" ? `Pagada al contado · ${soles(total)}` : `Queda en Por pagar · ${soles(total - (hayPago ? sumaPagos : 0))}`,
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
    //
    // Antes de irse, el botón se queda un instante en su visto (se dibuja en ~450 ms): es la confirmación de que
    // quedó registrada. Con movimiento reducido no hay espera.
    if (!sinMovimiento()) await new Promise((r) => window.setTimeout(r, MS_VISTO_REGISTRADO));
    if (fallidos.length) {
      const aviso = new URLSearchParams({ desde: "nueva", adjuntos_fallidos: fallidos.join("|") });
      router.push(`/compras/factura/${data}?${aviso}`);
      // El detalle se abre ENCIMA de este formulario (ruta interceptada), que sigue montado: el botón vuelve a su lugar.
      setRegistrada(false);
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
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start"
    >
      <div className="anim-entra col-span-full flex flex-wrap items-end justify-between gap-x-6 gap-y-4" style={{ "--i": 0 } as CSSProperties}>
        {cabecera && <div className="min-w-0 max-w-3xl flex-1">{cabecera}</div>}
        <div className="w-full sm:ml-auto sm:w-56">
          <BarraProgreso listos={progreso.listos} total={progreso.total} />
        </div>
      </div>
      {/* Columna principal: documento, líneas, pago, nota. El resumen va en
          la columna de la derecha y se queda fijo al hacer scroll. */}
      <div className="min-w-0 space-y-6">
        {/* ---------- cabecera ---------- */}
        <section className="anim-entra card-cayla space-y-4 p-5" style={{ "--i": 2 } as CSSProperties}>
          <p className={`${campoEtiqueta} flex items-center gap-2`}>
            <NumeroTramo n={1} listo={progreso.tramos.documento} />
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
                <ComboBuscable etiquetaAccesible="Proveedor" valor={proveedorId}
                  onValor={(id) => {
                    setProveedorId(id);
                    // El saldo a favor es de UN proveedor: si se cambió de proveedor, una línea «Saldo a favor» ya no
                    // tiene con qué respaldarse (la base la rechazaría). Pasa al medio de siempre, con el mismo monto.
                    setPagos((ps) => (ps.some((l) => l.metodo === METODO_SALDO_A_FAVOR) ? ps.map((l) => (l.metodo === METODO_SALDO_A_FAVOR ? lineaPagoVacia(l.monto) : l)) : ps));
                    void comprobarRepetido(id, serie, numero);
                  }}
                  opciones={opcionesProveedor} marcador={hayMarcas ? "Busca por nombre, marca o RUC…" : "Busca por nombre o RUC…"} />
                {proveedor && (proveedor.plazoCreditoDias != null || proveedor.formaPagoPreferida || (proveedor.saldo ?? 0) > 0 || (proveedor.saldoFavor ?? 0) > 0 || faltaCuenta) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {proveedor.plazoCreditoDias != null && <Chip>Crédito {proveedor.plazoCreditoDias} días</Chip>}
                    {proveedor.formaPagoPreferida && <Chip>{ETIQUETA_METODO[proveedor.formaPagoPreferida] ?? proveedor.formaPagoPreferida}</Chip>}
                    {(proveedor.saldo ?? 0) > 0 && <Chip tono="ambar">Ya le debes {soles(proveedor.saldo ?? 0)}</Chip>}
                    {(proveedor.saldoFavor ?? 0) > 0 && <Chip tono="verde">Te debe {soles(proveedor.saldoFavor ?? 0)} a favor</Chip>}
                    {faltaCuenta && <Chip tono="ambar">{faltaCuenta}</Chip>}
                  </div>
                )}
              </div>
            </Campo>
            <div>
              <p className={campoEtiqueta}>Tipo de documento</p>
              <SegmentoDeslizante
                etiqueta="Tipo de documento"
                className="mt-2"
                valor={tipo}
                onCambio={(nuevo) => {
                  const t = nuevo as typeof tipo;
                  setTipo(t);
                  // Al cambiar de tipo el IGV se acomoda solo; si vuelve a factura,
                  // vuelve al 18 (no a lo que hubiera quedado escrito).
                  setIgvPorcentaje(discriminaIgv(t) ? IGV_POR_DEFECTO : "0");
                }}
                opciones={TIPOS.map((t) => ({ clave: t.valor, etiqueta: t.texto }))}
              />
            </div>
            <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 sm:col-span-2 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)]">
              <CampoTexto
                etiqueta="Serie"
                id="compra-serie"
                mono
                value={serie}
                onChange={(e) => setSerie(e.target.value.toUpperCase())}
                onBlur={() => void comprobarRepetido(proveedorId, serie, numero)}
                placeholder="F001"
                maxLength={8}
                autoComplete="off"
              />
              <CampoTexto
                etiqueta="Número"
                id="compra-numero"
                mono
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                onBlur={() => void comprobarRepetido(proveedorId, serie, numero)}
                placeholder="000123"
                maxLength={12}
                autoComplete="off"
                inputMode="numeric"
                // Pista, no candado: no bloquea el botón ni reemplaza el error de la base al registrar.
                pie={documentoRepetido ? `Ya registraste ${documentoNormalizado} de este proveedor.` : undefined}
                tono={documentoRepetido ? "error" : "neutro"}
              />
              <div className="col-span-2 sm:col-span-1">
                <CampoFecha etiqueta="Fecha de emisión" valor={fechaEmision} onValor={setFechaEmision} required />
              </div>
            </div>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
              <div>
                <p className={campoEtiqueta}>Condición de pago</p>
                <SegmentoDeslizante
                  etiqueta="Condición de pago"
                  className="mt-2"
                  valor={condicion}
                  onCambio={(c) => {
                    const cond = c as typeof condicion;
                    setCondicion(cond);
                    setPagoTocado(true);
                    // Al pasar a contado, el único medio arranca con el total.
                    if (cond === "contado" && pagos.length === 1) setPagos([{ ...pagos[0], monto: total > 0 ? total.toFixed(2) : "" }]);
                  }}
                  opciones={[
                    { clave: "contado", etiqueta: "Contado" },
                    { clave: "credito", etiqueta: "Crédito" },
                  ]}
                />
                <p className="mt-1.5 text-xs leading-snug text-tinta/55">{condicion === "contado" ? "Se registra con su pago por el total." : "Queda en Por pagar hasta saldarse."}</p>
              </div>
              {/* «Vence el» siempre está: al contado se apaga en vez de desaparecer, y la fila no se reacomoda. */}
              <div className={`transition-opacity duration-300 ${condicion === "credito" ? "" : "opacity-45"}`}>
                <CampoFecha etiqueta="Vence el" id="compra-vence" valor={condicion === "credito" ? fechaVencimiento : ""} onValor={setVencimientoEditado} required={condicion === "credito"} disabled={condicion !== "credito"} />
                <p className="mt-1.5 text-xs leading-snug text-tinta/55">
                  {condicion !== "credito" ? (
                    "Al contado no hay vencimiento."
                  ) : vencimientoEditado === null ? (
                    `Sugerido: emisión + ${plazoDias} días${proveedor ? `, el plazo de ${proveedor.nombre}` : ""}. Puedes cambiarlo.`
                  ) : (
                    <>
                      Lo cambiaste.{" "}
                      <button type="button" onClick={() => setVencimientoEditado(null)} className="text-rojo hover:underline">
                        Volver al sugerido ({fechaCorta(vencimientoSugerido).slice(0, 5)})
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div>
                <CampoFecha etiqueta="Fecha estimada de llegada" id="compra-llegada" valor={fechaLlegada} onValor={(v) => setLlegadaEditada(v || null)} required />
                <p className="mt-1.5 text-xs leading-snug text-tinta/55">
                  {llegadaEditada === null ? (
                    `Sugerida: emisión + 7 días. Si no llega para el ${fechaCorta(llegadaSugerida).slice(0, 5)}, aparece como atrasada.`
                  ) : (
                    <>
                      Lo cambiaste.{" "}
                      <button type="button" onClick={() => setLlegadaEditada(null)} className="text-rojo hover:underline">
                        Volver a la sugerida ({fechaCorta(llegadaSugerida).slice(0, 5)})
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
            <DestinoDeLaMercaderia
              ubicaciones={ubicaciones}
              ubicacionesPropia={misTiendas}
              puedeRepartir={repartoDisponible}
              repartir={repartir}
              onRepartir={alternarRepartir}
              ubicacionId={ubicacionId}
              onUbicacionId={setUbicacionId}
              tiendas={tiendasReparto}
              onTiendas={cambiarTiendasReparto}
            />
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
        <section className="anim-entra card-cayla space-y-3 p-5" style={{ "--i": 3 } as CSSProperties}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1">
            <p className={`${campoEtiqueta} flex items-center gap-2`}>
              <NumeroTramo n={2} listo={progreso.tramos.lineas} />
              Líneas del comprobante
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
            {repartir && tiendasReparto.length > 1 && (
              <button type="button" onClick={partesIgualesEnTodas} className="label-cayla ml-auto text-[10.5px] text-rojo hover:underline">
                Repartir todas en partes iguales
              </button>
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
            // Ayuda bajo el costo: el costo que el catálogo ya conoce (`variantes.costo`, promedio ponderado de lo
            // recibido — ADR de costo promedio) contra lo que se está tipeando, en la MISMA base (con o sin IGV).
            const conocidoSinIgv = producto ? costoConocido(producto.variantes, l.varianteId) : null;
            const conocido = conocidoSinIgv === null ? null : costoParaTipear(conocidoSinIgv, igvEfectivo, conIgv);
            return (
              <div key={l.id} className={`cr-linea${l.id === lineaNuevaId ? " cr-linea-entra" : ""}${l.id === saliendoId ? " cr-linea-sale" : ""}`}>
                <div className={`cr-linea-fila grid gap-2 border-b border-tinta/10 pb-3 sm:items-start ${PLANTILLA_LINEAS}`}>
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
                  <div className="min-w-0">
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
                    <AyudaCostoLinea ayuda={ayudaDeCosto(conocido, l.costoUnitario)} onUsar={() => conocido !== null && actualizarLinea(i, { costoUnitario: String(conocido) })} />
                  </div>
                  <span className="min-w-0 truncate py-2 text-sm tabular-nums text-tinta/75 sm:text-right" title={soles(importeDeLinea(l))}>
                    {soles(importeDeLinea(l))}
                  </span>
                  <span className="py-2 sm:text-right">
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => quitarLinea(l.id)} className="text-xs text-rojo">
                        Quitar
                      </button>
                    )}
                  </span>
                  {/* Repartido entre tiendas (ADR-0139): bajo la línea, a todo su ancho. Dentro de `cr-linea-fila` a propósito:
                      `.cr-linea` colapsa con UN solo hijo. Una línea sin producto todavía no se reparte. */}
                  {repartir && l.productoId && (
                    <RepartoDeLinea
                      id={`compra-linea-${i}-reparto`}
                      numeroLinea={i + 1}
                      cantidad={l.cantidad}
                      tiendas={ubicaciones.filter((u) => tiendasReparto.includes(u.id))}
                      reparto={l.reparto}
                      onReparto={(reparto) => actualizarLinea(i, { reparto })}
                    />
                  )}
                </div>
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
        <section className="anim-entra card-cayla space-y-4 p-5" style={{ "--i": 4 } as CSSProperties}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={`${campoEtiqueta} flex items-center gap-2`}>
              <NumeroTramo n={3} listo={progreso.tramos.pago} />
              {condicion === "contado" ? "Pago (obligatorio al contado)" : "Pago"}
            </p>
            {condicion === "credito" && (
              <label className="flex items-center gap-2 text-sm text-tinta/75">
                <input
                  type="checkbox"
                  checked={pagarAhora}
                  onChange={(e) => {
                    setPagarAhora(e.target.checked);
                    setPagoTocado(true);
                  }}
                  className="accent-rojo"
                />
                Registrar un pago ahora
              </label>
            )}
          </div>
          {hayPago ? (
            <div className={pagoTocado ? "cr-revela space-y-4" : "space-y-4"}>
              <LineasPago
                id="compra-pagos"
                lineas={pagos}
                onLineas={setPagos}
                objetivo={total}
                exacto={condicion === "contado"}
                saldoFavor={proveedor?.saldoFavor ?? 0}
                datosProveedor={proveedor?.datosPago}
                enlaceFicha={proveedor ? `/compras/proveedores/${proveedor.id}` : undefined}
              />
            </div>
          ) : (
            <p className="cr-revela text-sm text-tinta/65">Sin pago por ahora: el comprobante aparecerá en Por pagar con vencimiento el {fechaVencimiento.split("-").reverse().join("/")}.</p>
          )}
        </section>

      </div>

      {/* ---------- resumen (columna derecha) ----------
          El formulario es largo (documento, N líneas, pago, nota) y el total
          quedaba abajo del todo: al escribir la línea 8 nadie sabía si el
          total ya cuadraba con el papel. El resumen vive a la derecha y se
          queda pegado al hacer scroll (pedido de Felipe, 2026-09-14 — antes
          era un pie fijo abajo). En celular cae al final del formulario. */}
      <aside className="anim-entra card-cayla space-y-4 p-5 xl:sticky xl:top-24" style={{ "--i": 3 } as CSSProperties}>
        <p className={campoEtiqueta}>Resumen</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-tinta/65">Subtotal</dt>
            <dd className="tabular-nums text-tinta">
              <CifraCompra valor={subtotal} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-tinta/65">{discriminaIgv(tipo) ? `IGV ${igvEfectivo} %` : "Sin IGV discriminado"}</dt>
            <dd className="tabular-nums text-tinta">
              <CifraCompra valor={igv} />
            </dd>
          </div>
        </dl>
        <div className="border-t border-sand pt-3">
          <p className={campoEtiqueta}>Total</p>
          <p className="font-display mt-1 text-3xl tabular-nums text-tinta">
            <CifraCompra valor={total} />
          </p>
          <p className="mt-1 text-xs text-tinta/55">
            <TextoQueSeAsienta valor={condicion === "contado" ? "Se registra con su pago por el total." : `Queda en Por pagar hasta el ${fechaVencimiento.split("-").reverse().join("/")}.`} />
          </p>
        </div>
        {/* Antes de guardar: dónde cae este comprobante y cómo cambian las cuentas con ese proveedor. */}
        <div className="space-y-1.5 border-t border-sand pt-3 text-sm">
          <p className={campoEtiqueta}>Dónde cae</p>
          <div className="flex justify-between gap-3">
            <span className="text-tinta/65">Por pagar</span>
            <span className="tabular-nums text-tinta">
              <TextoQueSeAsienta valor={condicion === "credito" ? `vence ${fechaCorta(fechaVencimiento)}` : "al contado"} />
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-tinta/65">Por recibir</span>
            <span className="tabular-nums text-tinta">
              <TextoQueSeAsienta valor={`esperada ${fechaCorta(fechaLlegada)}`} />
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-tinta/65">Mercadería para</span>
            <span className="text-right text-tinta">
              {repartir ? (
                porTienda.length > 0 ? (
                  porTienda.map((t) => (
                    <span key={t.id} className="block tabular-nums">
                      {t.nombre} · {t.unidades.toLocaleString("es-PE")} u.
                    </span>
                  ))
                ) : (
                  "—"
                )
              ) : (
                <TextoQueSeAsienta valor={ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "—"} />
              )}
            </span>
          </div>
        </div>
        {proveedor && proveedor.saldo != null && total > 0 && (
          <CuentasConProveedor saldo={proveedor.saldo} deudaTotal={deudaTotal} nuevaDeuda={condicion === "credito" ? Math.max(0, total - (hayPago ? sumaPagos : 0)) : 0} />
        )}
        <SelectorAdjuntos archivos={adjuntos} onArchivos={setAdjuntos} />
        {/* La nota va en el resumen y no al final de la columna larga, y
            DESPUÉS de los adjuntos: es lo último que se escribe antes de
            registrar, así queda pegada al botón (pedido de Felipe, 2026-09-14). */}
        <CampoTexto etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que conviene recordar" />
        {/* Lo que falta, a la vista: el botón se activa recién con los cuatro, y en vez de quedar solo gris, esta
            lista dice qué falta (es una vista de `requisitosDeCompra`, las mismas reglas que valida `onSubmit`). */}
        <ListaPendientes id="compra-pendientes" requisitos={requisitos} />
        <div className="flex flex-col gap-2">
          <BotonRegistrar estado={estadoRegistro} habilitado={progreso.completo} describe="compra-pendientes">
            {condicion === "contado" ? `Registrar ${TIPOS.find((t) => t.valor === tipo)!.texto.toLowerCase()} y pago · ${soles(total)}` : `Registrar ${TIPOS.find((t) => t.valor === tipo)!.texto.toLowerCase()}`}
          </BotonRegistrar>
          <Boton type="button" peso="discreto" onClick={() => router.push("/compras")} disabled={loading || registrada} className="w-full">
            Cancelar
          </Boton>
        </div>
      </aside>
    </form>
  );
}

// «Tus cuentas con este proveedor»: saldo hoy, saldo después de este comprobante y cómo se mueve la concentración de la
// deuda (qué parte de todo lo que se debe está en este proveedor). Lo que se paga al contado no suma deuda.
function CuentasConProveedor({ saldo, deudaTotal, nuevaDeuda }: { saldo: number; deudaTotal: number; nuevaDeuda: number }) {
  const antes = deudaTotal > 0 ? (saldo / deudaTotal) * 100 : 0;
  const despues = deudaTotal + nuevaDeuda > 0 ? ((saldo + nuevaDeuda) / (deudaTotal + nuevaDeuda)) * 100 : 0;
  return (
    <div className="space-y-1.5 border-t border-sand pt-3 text-sm">
      <p className={campoEtiqueta}>Tus cuentas con este proveedor</p>
      <div className="flex justify-between gap-3">
        <span className="text-tinta/65">Saldo hoy</span>
        <span className="tabular-nums text-tinta">
          <CifraCompra valor={saldo} />
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-tinta/65">Saldo después</span>
        <span className="tabular-nums text-tinta">
          <CifraCompra valor={saldo + nuevaDeuda} />
        </span>
      </div>
      {nuevaDeuda > 0 && (
        <div className="flex justify-between gap-3">
          <span className="text-tinta/65">Concentración de la deuda</span>
          <span className="tabular-nums text-tinta">
            <CifraCompra valor={antes} formato="porcentaje" /> → <CifraCompra valor={despues} formato="porcentaje" />
          </span>
        </div>
      )}
    </div>
  );
}
