import { Aviso } from "@/components/ui/Aviso";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { textoCosto, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// El costo de la orden (ADR-0400, decisión 4 y «Pantallas» punto 2; vista D): estimado contra real por concepto — la tela, los avíos y cada servicio de afuera —, el total y lo que sale
// por prenda. Nadie lo teclea: sale de la tela usada y de lo que cada servicio devolvió (devengado). Donde todavía no hay real se dice cuándo lo habrá («al volver», «al cerrar»), no se
// pone un cero. Solo se dibuja si quien mira ve los costos del Taller (`textoCosto` devuelve null si no).

const PLANTILLA = "@min-[28rem]:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem]";
const EN_COLUMNAS = "hidden @min-[28rem]:block";

export function CostoDeLaOrden({ datos }: { datos: OrdenPagina }) {
  const costo = textoCosto(datos);
  if (!costo) return null;
  const real = (texto: string, pendiente: boolean) => <span className={pendiente ? "op-pendiente" : undefined}>{texto}</span>;
  return (
    <section data-guia="prod-orden.costo" aria-label="Costo de la orden" className="@container op-bloque">
      <TituloSeccion dato="estimado · real, en soles">Costo</TituloSeccion>
      <Tabla>
        <div className={EN_COLUMNAS}>
          <Encabezado plantilla={PLANTILLA} visible="grid" columnas={[{ titulo: "Concepto" }, { titulo: "Estimado", alinear: "der" }, { titulo: "Real", alinear: "der" }]} />
        </div>
        {costo.filas.map((f) => (
          <div key={f.clave} className={fila(PLANTILLA)}>
            <span className={celda("izq", "whitespace-normal")}>
              <span className="block text-tinta">{f.concepto}</span>
              {f.detalle && <span className="op-sub">{f.detalle}</span>}
            </span>
            <span className={celda("der", EN_COLUMNAS)}>{f.estimado}</span>
            <span className={celda("der", EN_COLUMNAS)}>{real(f.real, f.realPendiente)}</span>
            <span className="op-sub @min-[28rem]:hidden">
              estimado {f.estimado} · real {real(f.real, f.realPendiente)}
            </span>
          </div>
        ))}
        <div className={fila(PLANTILLA, "op-total")}>
          <span className={celda("izq")}>Total · S/</span>
          <span className={celda("der", EN_COLUMNAS)}>{costo.total.estimado}</span>
          <span className={celda("der", EN_COLUMNAS)}>{costo.total.real}</span>
          <span className="@min-[28rem]:hidden">
            estimado {costo.total.estimado} · real {costo.total.real}
          </span>
        </div>
        <div className={fila(PLANTILLA)}>
          <span className={celda("izq")}>Por prenda · S/</span>
          <span className={celda("der", EN_COLUMNAS)}>{costo.porPrenda.estimado}</span>
          <span className={celda("der", EN_COLUMNAS)}>{real(costo.porPrenda.real, costo.porPrenda.realPendiente)}</span>
          <span className="op-sub @min-[28rem]:hidden">
            estimado {costo.porPrenda.estimado} · real {real(costo.porPrenda.real, costo.porPrenda.realPendiente)}
          </span>
        </div>
      </Tabla>
      {costo.faltaDefinir.length > 0 && (
        <Aviso tono="atencion" chico>
          El total no incluye {costo.faltaDefinir.map((n) => n.toLocaleLowerCase("es")).join(" ni ")}: falta definir quién {costo.faltaDefinir.length === 1 ? "la hace" : "las hace"} y a cuánto.
        </Aviso>
      )}
    </section>
  );
}
