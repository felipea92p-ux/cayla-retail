import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { ESTADO_ORDEN, fraseDestino, type DetalleOrden } from "@/lib/ordenes-compra-reglas";

// Una orden de compra por dentro (ADR-0362, fase 1 · actividad 3): lo mismo en la ventana que se abre sobre la lista y en la página
// completa que se ve al recargar o compartir el enlace. Sin estado: lo dibuja el servidor.
//
// Arriba, lo que la ubica (proveedor, a dónde llega, cuándo se emitió y cuándo se espera); al medio, lo que se pidió, línea por línea,
// con el descuento en soles y el % si se escribió así; abajo, el total, la nota y quién la creó. Una anulada lo dice primero, con su
// motivo: es lo único que importa de ella.
//
// # · Categoría y marca (+ descripción) · Cantidad · Precio · Descuento · Subtotal. Las columnas las decide el ANCHO DISPONIBLE
// (`@container`), no la ventana: la misma pieza vive en una ventana de 896 px y en una página con el menú abierto, donde con una
// ventana chica la tabla mide 400 px y la prenda se aplastaba a cero. Con menos de 40 rem no hay columnas: la cuenta de la línea va
// en un solo renglón bajo la prenda («30 × S/ 42.00 = S/ 1,260.00»), en vez de un renglón por cifra.
const PLANTILLA = "@min-[40rem]:grid-cols-[2rem_minmax(0,1fr)_5rem_6.5rem_6.5rem_7rem]";
// Una celda que solo existe con la tabla en columnas.
const EN_COLUMNAS = "hidden @min-[40rem]:block";
// Una cifra en su columna, a la derecha.
const CIFRA = `${EN_COLUMNAS} min-w-0 whitespace-nowrap text-right tabular-nums`;

const porcentaje = (pct: number) => `${pct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;

export function DetalleOrdenCompra({ orden: d }: { orden: DetalleOrden }) {
  const estado = ESTADO_ORDEN[d.estado];
  const creada = diaYHoraLima(d.creadaEn);
  const anulada = d.anuladaEn ? diaYHoraLima(d.anuladaEn) : null;
  return (
    <div className="@container space-y-5">
      {d.estado === "anulada" && (
        <Aviso tono="atencion" titulo="Esta orden está anulada">
          {d.motivoAnulacion ? `«${d.motivoAnulacion}»` : "Sin motivo escrito"}
          {anulada && ` · ${d.anuladaPor ?? "alguien"} la anuló el ${anulada.dia} a las ${anulada.hora}.`}
          {" "}Su número no vuelve a usarse.
        </Aviso>
      )}

      <dl className="grid gap-x-6 gap-y-3 text-sm @min-[28rem]:grid-cols-2 @min-[48rem]:grid-cols-4">
        <div>
          <dt className="text-xs text-taupe">Proveedor</dt>
          <dd className="font-medium text-tinta">{d.proveedor.nombre}</dd>
          {d.proveedor.ruc && <dd className="text-xs tabular-nums text-taupe">RUC {d.proveedor.ruc}</dd>}
        </div>
        <div>
          <dt className="text-xs text-taupe">Destino</dt>
          <dd className="text-tinta">{fraseDestino(d.destino?.nombre ?? null)}</dd>
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

      <Tabla>
        {/* Los títulos, solo con la tabla en columnas (el `Encabezado` decide por la ventana; esta caja, por el ancho disponible). */}
        <div className="hidden @min-[40rem]:block">
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "#" },
              { titulo: "Prenda" },
              { titulo: "Cantidad", alinear: "der" },
              { titulo: "Precio u.", alinear: "der" },
              { titulo: "Descuento", alinear: "der" },
              { titulo: "Subtotal", alinear: "der" },
            ]}
          />
        </div>
        {d.lineas.map((l) => (
          <div key={l.posicion} className={fila(PLANTILLA)}>
            <span className={celda("izq", `${EN_COLUMNAS} text-xs tabular-nums text-taupe`)}>{l.posicion}</span>
            <span className={celda("izq", "whitespace-normal")}>
              <span className="block text-tinta">
                {l.categoria} · {l.marca}
              </span>
              {l.descripcion && <span className="block text-xs text-taupe">{l.descripcion}</span>}
              {/* Sin columnas: la cuenta entera en un renglón. */}
              <span className="mt-1 block text-sm tabular-nums text-tinta/80 @min-[40rem]:hidden">
                {l.cantidad.toLocaleString("es-PE")} × {soles(l.precioUnitario)}
                {l.descuento > 0 && ` − ${soles(l.descuento)}${l.descuentoPct != null ? ` (${porcentaje(l.descuentoPct)})` : ""}`} ={" "}
                <b className="font-medium text-tinta">{soles(l.subtotal)}</b>
              </span>
            </span>
            <span className={`${CIFRA} text-tinta`}>{l.cantidad.toLocaleString("es-PE")}</span>
            <span className={`${CIFRA} text-tinta/80`}>{soles(l.precioUnitario)}</span>
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
        ))}
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
          <span className="text-sm text-taupe">
            {d.lineas.length} {d.lineas.length === 1 ? "línea" : "líneas"} · {d.unidades.toLocaleString("es-PE")} {d.unidades === 1 ? "unidad" : "unidades"}
          </span>
          <span className="text-sm text-taupe">
            Total <b className="font-display ml-1 text-xl font-normal tabular-nums text-tinta">{soles(d.total)}</b>
          </span>
        </div>
      </Tabla>

      {d.nota && <p className="nota-cayla sin-i whitespace-pre-line">{d.nota}</p>}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-taupe">
        <Chip tono={estado.tono}>{estado.texto}</Chip>
        <span>
          Creada por {d.creadaPor ?? "alguien sin nombre en Dynamic"} el {creada.dia} a las {creada.hora}
        </span>
      </p>
    </div>
  );
}
