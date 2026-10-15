import { Scissors } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { filasDeTela, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// La tela de la orden (ADR-0400, decisión 6; vista D): por tela y color, lo que pide el plan, lo que ya se usó y si lo que queda en el estante alcanza para lo que falta. «Alcanza» y
// «Faltan N m» salen del mismo veredicto de la hoja de Nueva orden (`filasDeTela` → `veredictoTela`). Una orden sin tela declarada lo dice, no se dibuja vacía.

const PLANTILLA = "@min-[28rem]:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem]";
const EN_COLUMNAS = "hidden @min-[28rem]:block";

export function TelaDeLaOrdenVista({ datos }: { datos: OrdenPagina }) {
  const filas = filasDeTela(datos.insumos);
  return (
    <section data-guia="prod-orden.tela" aria-label="Tela de la orden" className="@container op-bloque">
      <TituloSeccion dato={datos.orden.producto.tejidoNombre ?? undefined}>Tela</TituloSeccion>
      {filas.length === 0 ? (
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<Scissors />}>
            Esta orden no declaró qué tela lleva.
          </Vacio>
        </div>
      ) : (
        <Tabla>
          <div className={EN_COLUMNAS}>
            <Encabezado plantilla={PLANTILLA} visible="grid" columnas={[{ titulo: "Tela" }, { titulo: "Plan", alinear: "der" }, { titulo: "Usado", alinear: "der" }, { titulo: "Estante", alinear: "der" }]} />
          </div>
          {filas.map((f) => (
            <div key={f.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "whitespace-normal")}>
                <span className="block text-tinta">{f.nombre}</span>
                {f.detalle && <span className="op-sub">{f.detalle}</span>}
                <span className="mt-1.5 block">
                  {f.alcanza ? (
                    <Chip tono="verde" versalitas={false}>
                      Alcanza
                    </Chip>
                  ) : (
                    <Chip tono="ambar" versalitas={false}>
                      Faltan {f.faltan}
                    </Chip>
                  )}
                </span>
              </span>
              <span className={celda("der", `${EN_COLUMNAS}`)}>{f.plan}</span>
              <span className={celda("der", `${EN_COLUMNAS}`)}>{f.usado}</span>
              <span className={celda("der", `${EN_COLUMNAS}`)}>{f.saldo}</span>
              <span className="op-sub @min-[28rem]:hidden">
                plan {f.plan} · usado {f.usado} · estante {f.saldo}
              </span>
            </div>
          ))}
        </Tabla>
      )}
    </section>
  );
}
