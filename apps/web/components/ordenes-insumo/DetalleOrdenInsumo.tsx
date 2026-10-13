import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { etiquetaRubro } from "@/lib/proveedores-produccion-reglas";
import {
  ESTADO_ORDEN,
  cantidadConUnidad,
  nombreUnidad,
  precioUnitarioTexto,
  textoCantidades,
  type DetalleOrdenInsumo as Detalle,
  type LineaOrdenInsumo,
} from "@/lib/ordenes-insumo-reglas";

// Una orden de insumos por dentro (ADR-0362, fase 7 · actividad 2): lo mismo en la ventana que se abre sobre la lista y en la página que
// se ve al recargar o compartir el enlace. Sin estado: lo dibuja el servidor. Es la gemela de `DetalleOrdenCompra` (fase 1).
//
// Arriba, lo que la ubica (proveedor, a qué taller llega, cuándo se emitió y cuándo se espera); al medio, lo que se pidió, línea por línea,
// con la cantidad EN SU UNIDAD («12.5 metros»), el precio por esa unidad (con sus cuatro decimales si los usa: «S/ 0.0350»), el descuento
// y el subtotal; abajo, cuánto se pidió de cada unidad —nunca metros sumados con conos—, el total, la nota, lo que la orden decía antes de
// cada edición y quién la creó. Una anulada lo dice primero, con su motivo: es lo único que importa de ella.
//
// # · Insumo (código y descripción) · Cantidad · Precio u. · Descuento · Subtotal. Las columnas las decide el ANCHO DISPONIBLE
// (`@container`), no la ventana: con menos de 40 rem la cuenta de la línea va en un renglón bajo el insumo.
const PLANTILLA = "@min-[40rem]:grid-cols-[2rem_minmax(0,1fr)_7.5rem_6.5rem_6.5rem_7rem]";
const EN_COLUMNAS = "hidden @min-[40rem]:block";
const CIFRA = `${EN_COLUMNAS} min-w-0 whitespace-nowrap text-right tabular-nums`;

const porcentaje = (pct: number) => `${pct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;

export function DetalleOrdenInsumo({ orden: d }: { orden: Detalle }) {
  const estado = ESTADO_ORDEN[d.estado];
  const creada = diaYHoraLima(d.creadaEn);
  const editada = d.actualizadaEn ? diaYHoraLima(d.actualizadaEn) : null;
  const anulada = d.anuladaEn ? diaYHoraLima(d.anuladaEn) : null;
  return (
    <div className="@container space-y-5">
      {d.estado === "anulada" && (
        <Aviso tono="atencion" titulo="Esta orden está anulada" guia="oi.anulada">
          {d.motivoAnulacion ? `«${d.motivoAnulacion}»` : "Sin motivo escrito"}
          {anulada && ` · ${d.anuladaPor ?? "alguien"} la anuló el ${anulada.dia} a las ${anulada.hora}.`}
          {" "}Su número no vuelve a usarse.
        </Aviso>
      )}

      <dl data-guia="oi.datos" className="grid gap-x-6 gap-y-3 text-sm @min-[28rem]:grid-cols-2 @min-[48rem]:grid-cols-4">
        <div>
          <dt className="text-xs text-taupe">Proveedor</dt>
          <dd className="font-medium text-tinta">{d.proveedor.nombre}</dd>
          <dd className="text-xs tabular-nums text-taupe">
            {[d.proveedor.ruc ? `RUC ${d.proveedor.ruc}` : null, d.proveedor.rubro ? etiquetaRubro(d.proveedor.rubro) : null].filter(Boolean).join(" · ")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-taupe">Llega a</dt>
          <dd className="text-tinta">{d.destino.nombre}</dd>
        </div>
        <div>
          <dt className="text-xs text-taupe">Emitida</dt>
          <dd className="tabular-nums text-tinta">{fechaCorta(d.fechaEmision)}</dd>
        </div>
        <div>
          <dt className="text-xs text-taupe">Entrega estimada</dt>
          <dd className="tabular-nums text-tinta">{d.fechaEntregaEstimada ? fechaCorta(d.fechaEntregaEstimada) : "Sin fecha"}</dd>
        </div>
      </dl>

      <Tabla guia="oi.lineas">
        {/* Los títulos, solo con la tabla en columnas (el `Encabezado` decide por la ventana; esta caja, por el ancho disponible). */}
        <div className="hidden @min-[40rem]:block">
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "#" },
              { titulo: "Insumo" },
              { titulo: "Cantidad", alinear: "der" },
              { titulo: "Precio u.", alinear: "der" },
              { titulo: "Descuento", alinear: "der" },
              { titulo: "Subtotal", alinear: "der" },
            ]}
          />
        </div>
        {d.lineas.map((l) => (
          <LineaDetalle key={l.posicion} l={l} />
        ))}
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
          <span className="text-sm text-taupe">
            {d.lineas.length} {d.lineas.length === 1 ? "línea" : "líneas"}
            {d.cantidades.length > 0 && ` · ${textoCantidades(d.cantidades)}`}
          </span>
          <span className="text-sm text-taupe">
            Total <b className="font-display ml-1 text-xl font-normal tabular-nums text-tinta">{soles(d.total)}</b>
          </span>
        </div>
      </Tabla>

      {/* Con su rótulo, como en el papel: sin él, una barra gris se leía como un aviso o un estado. */}
      {d.nota && (
        <p className="nota-cayla sin-i whitespace-pre-line">
          <b className="font-medium text-tinta">Nota:</b> {d.nota}
        </p>
      )}

      {/* Lo que la orden decía antes de cada edición (`orden_insumo_versiones`): no se pierde, y se lee aquí sin abrir nada más. */}
      {d.versiones.length > 0 && (
        <details data-guia="oi.versiones" className="text-[13px] text-tinta/80">
          {/* Sin anillo propio: el foco de teclado es el anillo común de globals.css (ADR-0351). */}
          <summary className="label-cayla cursor-pointer list-none text-[11px] text-tinta/65 hover:text-tinta [&::-webkit-details-marker]:hidden">
            Lo que decía antes · {d.versiones.length === 1 ? "1 versión" : `${d.versiones.length} versiones`} ›
          </summary>
          <ol className="mt-3 space-y-3">
            {[...d.versiones].reverse().map((v) => {
              const cuando = v.reemplazadaEn ? diaYHoraLima(v.reemplazadaEn) : null;
              return (
                <li key={v.version} className="rounded-lg border border-sand px-3 py-2">
                  <p className="text-tinta">
                    <b className="font-medium">Versión {v.version}</b>
                    {cuando && ` · la cambió ${v.reemplazadaPor ?? "alguien"} el ${cuando.dia} a las ${cuando.hora}`}
                  </p>
                  <p className="text-xs text-taupe">
                    {[v.proveedor, v.fechaEntregaEstimada ? `entrega ${fechaCorta(v.fechaEntregaEstimada)}` : "sin fecha de entrega", soles(v.total)].filter(Boolean).join(" · ")}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs tabular-nums text-tinta/75">
                    {v.lineas.map((l) => (
                      <li key={l.posicion}>
                        {cantidadConUnidad(l.cantidad, l.unidadMedida)} de {l.insumo} a {precioUnitarioTexto(l.precioUnitario)}
                        {l.descuento > 0 && ` − ${soles(l.descuento)}`} = {soles(l.subtotal)}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </details>
      )}

      <p data-guia="oi.pie" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-taupe">
        <Chip tono={estado.tono}>{estado.texto}</Chip>
        <span>
          Creada por {d.creadaPor ?? "alguien sin nombre en Dynamic"} el {creada.dia} a las {creada.hora}
          {editada && ` · editada por ${d.actualizadaPor ?? "alguien sin nombre en Dynamic"} el ${editada.dia} a las ${editada.hora}`}
        </span>
      </p>
    </div>
  );
}

function LineaDetalle({ l }: { l: LineaOrdenInsumo }) {
  const unidadCambio = l.unidadActual != null && l.unidadActual !== l.unidadMedida;
  return (
    <div className={fila(PLANTILLA)}>
      <span className={celda("izq", `${EN_COLUMNAS} text-xs tabular-nums text-taupe`)}>{l.posicion}</span>
      <span className={celda("izq", "whitespace-normal")}>
        <span className="block text-tinta">{l.insumo}</span>
        <span className="block text-xs text-taupe">{[l.codigo, l.descripcion].filter(Boolean).join(" · ")}</span>
        {/* La orden guarda la unidad del día en que se hizo; si el catálogo la cambió después, se avisa (editarla pide la nueva). */}
        {unidadCambio && <span className="block text-xs text-ambar">Hoy este insumo se pide en {nombreUnidad(l.unidadActual!)}</span>}
        {/* Sin columnas: la cuenta entera, cada cifra sin partirse («S/» no queda solo al final de un renglón). */}
        <span className="mt-1 block text-sm tabular-nums text-tinta/80 @min-[40rem]:hidden">
          <span className="whitespace-nowrap">{cantidadConUnidad(l.cantidad, l.unidadMedida)}</span> ×{" "}
          <span className="whitespace-nowrap">{precioUnitarioTexto(l.precioUnitario)}</span>
          {l.descuento > 0 && (
            <>
              {" "}−{" "}
              <span className="whitespace-nowrap">
                {soles(l.descuento)}
                {l.descuentoPct != null ? ` (${porcentaje(l.descuentoPct)})` : ""}
              </span>
            </>
          )}{" "}
          = <b className="whitespace-nowrap font-medium text-tinta">{soles(l.subtotal)}</b>
        </span>
      </span>
      <span className={`${CIFRA} text-tinta`}>{cantidadConUnidad(l.cantidad, l.unidadMedida)}</span>
      <span className={`${CIFRA} text-tinta/80`}>{precioUnitarioTexto(l.precioUnitario)}</span>
      <span className={`${CIFRA} text-tinta/80`}>
        {l.descuento > 0 ? (
          <>
            −{soles(l.descuento)}
            {l.descuentoPct != null && <span className="block text-xs text-taupe">{porcentaje(l.descuentoPct)}</span>}
          </>
        ) : (
          <span className="text-taupe">—</span>
        )}
      </span>
      <span className={`${CIFRA} font-medium text-tinta`}>{soles(l.subtotal)}</span>
    </div>
  );
}
