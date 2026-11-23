import Link from "next/link";
import { History } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { exigirModulo } from "@/lib/persona-actual";
import { getHistorialBarridos } from "@/lib/barrido-piso";
import { estadoDelHistorial, fechaDelBarrido, porResolverDeLaFila, type FilaHistorial } from "@/lib/barrido-piso-reglas";

// «Historial de barridos» (ADR-0690, actividad 9). Felipe: «al final de su conteo […] se guarde con hora del conteo de cada prenda y al
// final salga en alguna parte un historial de conteo total». La lista de los barridos de la sede activa, del más nuevo al más viejo: cuándo,
// quién lo empezó y lo cerró, cuánto se escaneó y qué corrigió. Cada fila abre su detalle. Solo lectura.

const PLANTILLA = "sm:grid-cols-[minmax(10rem,1.4fr)_7.5rem_minmax(8rem,1fr)_6rem_6rem_6.5rem_6rem]";
const COLUMNAS: Columna[] = [
  { titulo: "Cuándo" },
  { titulo: "Estado" },
  { titulo: "Quién" },
  { titulo: "Escaneadas", alinear: "der" },
  { titulo: "Al piso", alinear: "der" },
  { titulo: "Al almacén", alinear: "der" },
  { titulo: "Por resolver", alinear: "der" },
];

const n = (x: number | null) => (x === null ? "—" : x.toLocaleString("es-PE"));

export default async function HistorialBarridosPage() {
  const persona = await exigirModulo("existencias");
  const sede = persona.ubicacionEtiqueta;
  const { historial, fallo } = await getHistorialBarridos(persona.ubicacionId);
  const confirmados = historial?.barridos.filter((b) => b.estado === "confirmado") ?? [];
  const ultimo = confirmados[0] ?? null;

  return (
    <div className="space-y-6 pb-24">
      <EncabezadoPagina
        sede={sede}
        titulo="Historial de barridos"
        subtitulo="Cada barrido del piso de esta tienda: quién escaneó, cuándo y qué corrigió."
        volver={<Volver href="/inventario/barrido" a="Barrido del piso" />}
      />
      {fallo || !historial ? (
        <p role="alert" className="nota-cayla">
          {fallo}
        </p>
      ) : historial.barridos.length === 0 ? (
        <Vacio icono={<History />} titulo="Todavía no hay barridos">
          El primero aparece aquí apenas alguien lo empiece en «Barrido del piso».
        </Vacio>
      ) : (
        <>
          <div data-guia="barridos.cifras" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TarjetaCifra etiqueta="Barridos" valor={historial.total.toLocaleString("es-PE")}>
              {confirmados.length === 1 ? "1 confirmado" : `${confirmados.length.toLocaleString("es-PE")} confirmados`}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="El último confirmado" valor={ultimo ? fechaDelBarrido(ultimo.cerradoEn ?? ultimo.abiertoEn) : "—"}>
              {ultimo?.cerradoPor ? `Lo confirmó ${ultimo.cerradoPor.split(" ")[0]}` : "Ninguno todavía"}
            </TarjetaCifra>
            <TarjetaCifra className="hidden sm:flex" etiqueta="Corrigió el último" valor={ultimo ? ((ultimo.alPiso ?? 0) + (ultimo.alAlmacen ?? 0)).toLocaleString("es-PE") : "—"} unidad="prendas">
              {ultimo ? `${n(ultimo.alPiso)} al piso · ${n(ultimo.alAlmacen)} al almacén` : "Sin barridos confirmados"}
            </TarjetaCifra>
          </div>
          <Tabla guia="barridos.tabla">
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
            {historial.barridos.map((b) => (
              <FilaBarrido key={b.id} b={b} />
            ))}
          </Tabla>
        </>
      )}
    </div>
  );
}

function FilaBarrido({ b }: { b: FilaHistorial }) {
  const estado = estadoDelHistorial(b.estado);
  const quien = b.estado === "abierto" ? b.abiertoPor : (b.cerradoPor ?? b.abiertoPor);
  return (
    <Link href={`/inventario/barrido/historial/${b.id}`} className={fila(PLANTILLA, "grid-cols-[minmax(0,1fr)_auto] gap-y-1")}>
      <span className={celda("izq", "text-[15px] text-tinta")}>{fechaDelBarrido(b.abiertoEn)}</span>
      <span className={celda()}>
        <Chip tono={estado.tono}>{estado.texto}</Chip>
      </span>
      <span className={celda("izq", "texto-detalle text-taupe sm:text-[15px] sm:text-tinta")}>
        {quien ?? "—"}
        {b.personas > 1 ? ` y ${b.personas - 1} más` : ""}
      </span>
      <span className={celda("der")}>{b.unidades.toLocaleString("es-PE")}</span>
      <span className={celda("der", "hidden sm:block")}>{n(b.alPiso)}</span>
      <span className={celda("der", "hidden sm:block")}>{n(b.alAlmacen)}</span>
      <span className={celda("der", "hidden sm:block")}>{n(porResolverDeLaFila(b))}</span>
    </Link>
  );
}
