import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ComprobanteCompleto } from "@/lib/comprobantes";
import { montoALetras } from "./numero-a-letras";

// Formato A4 para email/impresión en oficina: sigue la estructura estándar
// que usan los OSE peruanos (Alegra, Nubefact, etc.) para que un contador o
// un cliente que recibe muchas boletas de distintas fuentes la reconozca de
// inmediato — encabezado izq. (emisor) / caja der. (tipo + número), tabla de
// ítems, desglose de IGV, monto en letras, pie legal.
//
// Deliberadamente SIN código QR ni hash: esos datos los devuelve SUNAT recién
// cuando se transmite el comprobante (ADR-0005, todavía sin decidir cómo se
// transmite). Mientras el estado sea "pendiente", el PDF lo dice explícito en
// vez de fingir un comprobante ya válido ante SUNAT.

const money = (n: number) => `S/${n.toFixed(2)}`;

const ETIQUETA_TIPO: Record<string, string> = {
  boleta: "BOLETA DE VENTA\nELECTRÓNICA",
  factura: "FACTURA\nELECTRÓNICA",
  nota_credito: "NOTA DE CRÉDITO\nELECTRÓNICA",
};

const PREFIJO_DOC: Record<string, string> = { dni: "DNI", ruc: "RUC", sin_documento: "" };

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: "#1a1a1a" },
  filaEncabezado: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  emisor: { flexDirection: "column", maxWidth: 330 },
  nombreComercial: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  razonSocial: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  lineaEmisor: { fontSize: 7.5, color: "#444", marginBottom: 1.5 },
  cajaTipo: { border: "1px solid #1a1a1a", padding: 10, width: 190, alignItems: "center" },
  ruc: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  tipoDoc: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 },
  numeroDoc: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  seccionCliente: { flexDirection: "row", justifyContent: "space-between", borderTop: "1px solid #ccc", borderBottom: "1px solid #ccc", paddingVertical: 6, marginBottom: 10 },
  clienteCol: { flexDirection: "column", maxWidth: 340 },
  fechaCol: { flexDirection: "column", alignItems: "flex-end" },
  etiqueta: { fontSize: 6.5, color: "#666", textTransform: "uppercase" },
  valor: { fontSize: 8.5, marginBottom: 3 },
  tabla: { marginBottom: 10 },
  filaTablaHead: { flexDirection: "row", backgroundColor: "#1a1a1a", color: "#fff", paddingVertical: 4, paddingHorizontal: 3 },
  filaTabla: { flexDirection: "row", borderBottom: "0.5px solid #ddd", paddingVertical: 4, paddingHorizontal: 3 },
  colCantidad: { width: "8%" },
  colUnidad: { width: "12%" },
  // El ancho de la antigua columna de descuento se sumó a la descripción:
  // `comprobantes.items` (jsonb, ADR-0009) no modela descuentos por línea.
  colDescripcion: { width: "52%" },
  colValorUnit: { width: "13%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },
  filaPie: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  montoLetras: { fontSize: 8, fontStyle: "italic", maxWidth: 320 },
  cajaTotales: { width: 190 },
  filaTotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  filaTotalFinal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTop: "1px solid #1a1a1a", marginTop: 2 },
  notas: { marginTop: 14, fontSize: 7.5, color: "#555" },
  estadoAviso: { marginTop: 10, padding: 6, fontSize: 7, color: "#8a5a00", backgroundColor: "#fdf3d8", border: "0.5px solid #e8c96a" },
  firmas: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  cajaFirma: { width: "45%", borderTop: "0.5px solid #999", paddingTop: 4, fontSize: 7, color: "#666", textAlign: "center" },
  pieLegal: { marginTop: 16, textAlign: "center", fontSize: 7, color: "#888" },
});

export function ComprobanteA4({ c }: { c: ComprobanteCompleto }) {
  const direccionSede = [c.sede.direccion, c.sede.distrito, c.sede.provincia, c.sede.departamento].filter(Boolean).join(", ");
  const fecha = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(c.created_at));
  const clienteDoc = c.cliente_num_doc ? `${PREFIJO_DOC[c.cliente_tipo_doc]} ${c.cliente_num_doc}` : "Sin documento";

  return (
    <Document title={`${c.tipo}-${c.serie}-${c.numero}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.filaEncabezado}>
          <View style={styles.emisor}>
            <Text style={styles.nombreComercial}>{c.empresa.nombre_comercial ?? c.empresa.razon_social}</Text>
            <Text style={styles.razonSocial}>{c.empresa.razon_social}</Text>
            {direccionSede ? <Text style={styles.lineaEmisor}>{direccionSede}</Text> : null}
            {c.sede.ubigeo ? <Text style={styles.lineaEmisor}>Código ubigeo: {c.sede.ubigeo}</Text> : null}
            {(c.sede.telefono ?? c.empresa.telefono) ? <Text style={styles.lineaEmisor}>Telf: {c.sede.telefono ?? c.empresa.telefono}</Text> : null}
            {(c.empresa.email || c.empresa.web) ? (
              <Text style={styles.lineaEmisor}>{[c.empresa.email, c.empresa.web].filter(Boolean).join(" · ")}</Text>
            ) : null}
          </View>
          <View style={styles.cajaTipo}>
            <Text style={styles.ruc}>RUC {c.empresa.ruc}</Text>
            <Text style={styles.tipoDoc}>{ETIQUETA_TIPO[c.tipo]}</Text>
            <Text style={styles.numeroDoc}>{c.serie}-{String(c.numero).padStart(6, "0")}</Text>
          </View>
        </View>

        <View style={styles.seccionCliente}>
          <View style={styles.clienteCol}>
            <Text style={styles.etiqueta}>Señor(es)</Text>
            <Text style={styles.valor}>{c.cliente_nombre ?? "Cliente varios"}</Text>
            <Text style={styles.etiqueta}>{c.cliente_tipo_doc === "ruc" ? "RUC" : "DNI"}</Text>
            <Text style={styles.valor}>{clienteDoc}</Text>
          </View>
          <View style={styles.fechaCol}>
            <Text style={styles.etiqueta}>Fecha de emisión</Text>
            <Text style={styles.valor}>{fecha}</Text>
          </View>
        </View>

        <View style={styles.tabla}>
          <View style={styles.filaTablaHead}>
            <Text style={styles.colCantidad}>Cant.</Text>
            <Text style={styles.colUnidad}>U.M.</Text>
            <Text style={styles.colDescripcion}>Descripción</Text>
            <Text style={styles.colValorUnit}>V. Unit.</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {/* Las líneas viven en `comprobantes.items` (jsonb): no tienen id
              propio, y su orden dentro del comprobante ES su identidad. */}
          {c.items.map((item, i) => (
            <View key={i} style={styles.filaTabla}>
              <Text style={styles.colCantidad}>{item.cantidad}</Text>
              <Text style={styles.colUnidad}>{item.unidad_medida}</Text>
              <Text style={styles.colDescripcion}>{item.descripcion}</Text>
              <Text style={styles.colValorUnit}>{money(item.valor_unitario)}</Text>
              <Text style={styles.colTotal}>{money(item.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.filaPie}>
          <Text style={styles.montoLetras}>{montoALetras(c.total)}</Text>
          <View style={styles.cajaTotales}>
            <View style={styles.filaTotal}>
              <Text>Op. gravada</Text>
              <Text>{money(c.subtotal)}</Text>
            </View>
            <View style={styles.filaTotal}>
              <Text>IGV (18.00%)</Text>
              <Text>{money(c.igv)}</Text>
            </View>
            <View style={styles.filaTotalFinal}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Total</Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{money(c.total)}</Text>
            </View>
          </View>
        </View>

        {c.estado === "pendiente" || c.estado === "rechazado" ? (
          <Text style={styles.estadoAviso}>
            {c.estado === "pendiente"
              ? "Comprobante con numeración oficial reservada, aún no transmitido a SUNAT. Este PDF es la representación impresa que se entrega al cliente; el envío queda pendiente."
              : `Comprobante RECHAZADO por SUNAT${c.motivo_rechazo ? `: ${c.motivo_rechazo}` : "."} No es válido como sustento tributario.`}
          </Text>
        ) : null}

        <Text style={styles.notas}>Cambios dentro de los 15 días posteriores a la compra, con este comprobante.</Text>

        <View style={styles.firmas}>
          <Text style={styles.cajaFirma}>Elaborado por</Text>
          <Text style={styles.cajaFirma}>Recibido, firma y/o sello</Text>
        </View>

        <Text style={styles.pieLegal}>
          Representación impresa de {c.tipo === "factura" ? "factura" : "boleta"} de venta electrónica
          {c.empresa.resolucion_autorizacion ? ` · Autorizado mediante resolución N° ${c.empresa.resolucion_autorizacion}` : ""}
        </Text>
      </Page>
    </Document>
  );
}
