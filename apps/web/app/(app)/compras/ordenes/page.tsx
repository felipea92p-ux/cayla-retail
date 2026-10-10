import { ClipboardList } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { listarOrdenesCompra } from "@/lib/ordenes-compra";
import { ESTADO_ORDEN, fraseDestino, numeroOrdenCompra, textoDestino } from "@/lib/ordenes-compra-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";

// Órdenes de compra (ADR-0362, fase 1): lo que CAYLA le pide a cada proveedor, antes de que llegue la factura. Cada orden lleva un
// número que no se repite ni se libera (OC-000001), su proveedor, a qué tienda llega —o «por repartir», si llega a Lima y se
// reparte después— y sus líneas. Quien tiene el módulo ve las de todas las sedes (decisiones 34 y 37).
//
// Cabecera `EncabezadoPagina` (decisión 36): la sede y la fecha arriba dicen desde dónde se está comprando.
//
// Desde 1280 px, siete columnas: N.º (+ emisión) · Proveedor · Llega a · Entrega · Unidades · Total · Estado. Entre 640 y 1280 px
// (una laptop con el menú abierto) las siete no caben —sus anchos fijos suman ~800 px y el proveedor se aplastaba a cero—, así que
// quedan cuatro: a dónde llega y la entrega bajan bajo el proveedor, y las unidades bajo el total. En celular (se usa en Gamarra)
// cada orden son tres bloques: el número con su estado al lado, el proveedor con a dónde llega, y el total con las unidades.
const PLANTILLA = "sm:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem_6.5rem] xl:grid-cols-[7.5rem_minmax(0,1fr)_9.5rem_5.5rem_5rem_7.5rem_6.5rem]";
// Una celda que solo existe como columna propia desde 1280 px.
const SOLO_XL = "hidden xl:block";
// Lo que debajo de 1280 px va en la segunda línea de otra celda.
const SEGUNDA_LINEA = "block xl:hidden text-xs text-taupe";

export default async function OrdenesCompraPage() {
  const persona = await exigirModulo("ordenes_compra");
  const { filas, falla } = await listarOrdenesCompra();

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Órdenes de compra"
        subtitulo="Lo que le pides a cada proveedor: qué, a cuánto y a qué tienda llega."
      />

      {falla ? (
        <Aviso tono="error" titulo="No se pudieron leer las órdenes de compra">
          {falla}
        </Aviso>
      ) : filas.length === 0 ? (
        <div className="card-cayla">
          <Vacio icono={<ClipboardList />} titulo="Todavía no hay órdenes de compra">
            Aquí vas a ver lo que le pides a cada proveedor, con su número, a qué tienda llega y cuánto suma.
          </Vacio>
        </div>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "N.º" },
              { titulo: "Proveedor" },
              { titulo: "Llega a", desdeXl: true },
              { titulo: "Entrega", subtitulo: "estimada", desdeXl: true },
              { titulo: "Unidades", alinear: "der", desdeXl: true },
              { titulo: "Total", alinear: "der" },
              { titulo: "Estado" },
            ]}
          />
          {filas.map((f) => {
            const estado = ESTADO_ORDEN[f.estado];
            const unidades = `${f.unidades.toLocaleString("es-PE")} ${f.unidades === 1 ? "unidad" : "unidades"}`;
            return (
              <div key={f.id} className={fila(PLANTILLA)}>
                <div className={celda()}>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums text-tinta">{numeroOrdenCompra(f.numero)}</span>
                    <span className="sm:hidden">
                      <Chip tono={estado.tono}>{estado.texto}</Chip>
                    </span>
                  </span>
                  <span className="block text-xs text-taupe">del {diaMes(f.fechaEmision)}</span>
                </div>
                <div className={celda("izq", "text-tinta")}>
                  {f.proveedorNombre}
                  <span className={`${SEGUNDA_LINEA} truncate`}>
                    {fraseDestino(f.destinoNombre)}
                    {f.fechaEntregaEstimada ? ` · entrega ${diaMes(f.fechaEntregaEstimada)}` : ""}
                  </span>
                </div>
                <div className={celda("izq", `${SOLO_XL} text-tinta/80`)}>{textoDestino(f.destinoNombre)}</div>
                <div className={celda("izq", `${SOLO_XL} tabular-nums text-tinta/80`)}>{diaMes(f.fechaEntregaEstimada)}</div>
                <div className={celda("der", `${SOLO_XL} text-tinta/80`)}>{f.unidades.toLocaleString("es-PE")}</div>
                <div className={celda("der", "font-medium text-tinta")}>
                  {soles(f.total)}
                  <span className={`${SEGUNDA_LINEA} font-normal`}>{unidades}</span>
                </div>
                <div className={celda("izq", "hidden sm:block")}>
                  <Chip tono={estado.tono}>{estado.texto}</Chip>
                </div>
              </div>
            );
          })}
        </Tabla>
      )}
    </div>
  );
}
