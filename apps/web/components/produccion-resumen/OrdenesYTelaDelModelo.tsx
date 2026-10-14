import Link from "next/link";
import { ClipboardList, Scissors } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, fila, celda, Tabla, type Columna } from "@/components/ui/Tabla";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { textoDeEntrega, type MaterialesDeHoja, type OrdenDeHoja } from "@/lib/produccion-hoja-modelo";
import { Rotulo } from "./CifrasDeLaHoja";

// Lo que Producción necesita saber de un modelo ANTES de abrir otra orden, y que la hoja de Catálogo no tiene: qué órdenes suyas ya están en marcha y si la tela y los avíos que lleva
// alcanzan para lo que falta fabricar. Todo sale de datos que ya existen (órdenes abiertas; consumo real de las órdenes ya cerradas y saldo de Insumos): donde no hay base honesta —sin
// consumo medido— se dice, no se adivina. Solo lectura: lo que se hace con esto sale de «Abrir orden» y de Insumos.

const PLANTILLA_ORDENES = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]";
const COLUMNAS_ORDENES: Columna[] = [{ titulo: "Orden" }, { titulo: "Va en" }, { titulo: "Entrega" }];

export function OrdenesDelModelo({ ordenes }: { ordenes: OrdenDeHoja[] }) {
  return (
    <div>
      <TituloGrupo cuenta={ordenes.length > 0 ? String(ordenes.length) : undefined}>Órdenes abiertas de este modelo</TituloGrupo>
      {ordenes.length === 0 ? (
        <Vacio tamano="chico" icono={<ClipboardList />}>
          No hay ninguna orden abierta de este modelo.
        </Vacio>
      ) : (
        <Tabla guia="prod-resumen.hoja-ordenes" className="mt-2">
          <Encabezado columnas={COLUMNAS_ORDENES} plantilla={PLANTILLA_ORDENES} />
          {ordenes.map((o) => (
            <Link key={o.id} href={`/produccion/ordenes?orden=${o.id}`} className={`${fila(PLANTILLA_ORDENES)} text-left transition-colors hover:bg-tinta/[0.03]`}>
              {/* Sin `celda()`: su `truncate` cortaba la insignia «Muestra» a media palabra. */}
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta">
                {o.cantidad} {o.cantidad === 1 ? "prenda" : "prendas"}
                {o.esMuestra && <Chip tono="pizarra">Muestra</Chip>}
              </span>
              <span className={celda("izq", "text-sm text-tinta")}>
                <Rotulo>Va en</Rotulo>
                {o.etapa}
              </span>
              <span className={celda("izq", `text-sm ${o.entrega.tipo === "vencida" ? "text-ambar-profundo" : "text-tinta"}`)}>{textoDeEntrega(o)}</span>
            </Link>
          ))}
        </Tabla>
      )}
    </div>
  );
}

export function TelaDelModelo({ materiales }: { materiales: MaterialesDeHoja | null }) {
  if (!materiales) {
    return (
      <div>
        <TituloGrupo>Tela y avíos</TituloGrupo>
        <Vacio tamano="chico" icono={<Scissors />}>
          Todavía no hay consumo medido de este modelo: se mide cuando se cierra una orden suya con los insumos descontados.
        </Vacio>
      </div>
    );
  }
  const paraLas = materiales.prendas > 0;
  const columnas: Columna[] = [
    { titulo: "Insumo" },
    { titulo: "Lleva", subtitulo: "por prenda", alinear: "der" },
    { titulo: "Hay", alinear: "der" },
    paraLas ? { titulo: `Para las ${materiales.prendas}`, subtitulo: "que faltan", alinear: "der" } : { titulo: "Alcanza para", alinear: "der" },
  ];
  // La última columna es la más ancha: ahí va la insignia («Alcanza si llega», «Faltan 80 unid.»), que no se parte ni se corta.
  const plantilla = "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.5fr)]";
  return (
    <div>
      <TituloGrupo>Tela y avíos</TituloGrupo>
      <Tabla guia="prod-resumen.hoja-tela" className="mt-2">
        <Encabezado columnas={columnas} plantilla={plantilla} />
        {materiales.lineas.map((l) => (
          <div key={l.insumoId} className={fila(plantilla)}>
            <span title={l.insumo} className={celda("izq", "text-sm text-tinta")}>
              {l.insumo}
            </span>
            <span className={celda("der", "text-sm text-tinta")}>
              <Rotulo>Lleva por prenda</Rotulo>
              {cantidadTexto(l.porPrenda, l.unidad)}
            </span>
            <span className={celda("der", "text-sm text-tinta")}>
              <Rotulo>Hay</Rotulo>
              {cantidadTexto(l.saldo, l.unidad)}
              {l.porLlegar > 0 && <span className="block text-[11px] text-tinta/65">+ {cantidadTexto(l.porLlegar, l.unidad)} por llegar</span>}
            </span>
            <span className={celda("der", "text-sm text-tinta")}>
              <Rotulo>{paraLas ? `Para las ${materiales.prendas}` : "Alcanza para"}</Rotulo>
              {!paraLas ? (
                `${l.prendasConElSaldo} ${l.prendasConElSaldo === 1 ? "prenda" : "prendas"}`
              ) : l.estado === "alcanza" ? (
                <Chip tono="verde">Alcanza</Chip>
              ) : l.estado === "alcanza_si_llega" ? (
                <span title="Alcanza solo si llega lo ya facturado que todavía no entró al Taller">
                  <Chip tono="ambar">Alcanza si llega</Chip>
                </span>
              ) : (
                <Chip tono="ambar">Faltan {cantidadTexto(l.faltan, l.unidad)}</Chip>
              )}
            </span>
          </div>
        ))}
      </Tabla>
    </div>
  );
}
