import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { ParDato, Pares } from "@/components/ui/ParDato";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { agotadasQueSeVendian, baseDelRitmo, ETIQUETA_ESTADO_MODELO, textoAgotadas, type FilaModelo } from "@/lib/produccion-decisiones";
import { AYUDA_MODELOS, barraDeStock, cuantoDura, ventaPorSemanaDeModelo } from "@/lib/produccion-en-orden";
import { lineaDeOrigen, type HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { TONO_ESTADO_MODELO } from "./estado-modelo";
import { FilaQueAbreLaHoja } from "./FilaQueAbreLaHoja";
import { FotoModelo } from "./FotoModelo";

// «Los demás modelos»: lo que despliega el recuadro de modelos de «Lo demás está en orden». Los que hoy no piden fabricar (los de «Producir ya» están en «Qué fabricar primero»), con
// la tabla del sistema y encabezados en palabras completas («Se venden por semana», no «Ventas/sem.»). Cada fila abre la hoja «Ver el modelo». Componente de servidor.

const PLANTILLA = "sm:grid-cols-[minmax(0,1.6fr)_5.5rem_8.5rem_minmax(10rem,1.2fr)_6.5rem_10.5rem]";

const COLUMNAS: Columna[] = [
  { titulo: "Modelo" },
  { titulo: "En tiendas", alinear: "der" },
  { titulo: "Se venden por semana", alinear: "der" },
  { titulo: "Cuánto dura" },
  { titulo: "Fabricándose", alinear: "der" },
  { titulo: "Qué hacer" },
];

function FilaDeModelo({ m, hoja, presentaciones }: { m: FilaModelo; hoja: HojaDeModelo; presentaciones: Record<string, PresentacionDeModelo> }) {
  const agotadas = textoAgotadas(agotadasQueSeVendian(m));
  const origen = lineaDeOrigen(hoja?.ficha ?? null);
  const porSemana = ventaPorSemanaDeModelo(m);
  const pocaBase = porSemana !== null && baseDelRitmo(m.ventasBase).pocaBase;
  const barra = barraDeStock(m);
  const dura = cuantoDura(m);
  return (
    <FilaQueAbreLaHoja hoja={hoja} presentacion={presentaciones[m.productoId]} className={fila(PLANTILLA, "w-full cursor-pointer text-left focus-visible:-outline-offset-2 sm:items-center!")}>
      <span className="flex min-w-0 items-center gap-3">
        <FotoModelo productoId={m.productoId} presentaciones={presentaciones} ancho={40} className="w-10" />
        <span className="min-w-0">
          <span className="line-clamp-2 break-words text-sm font-medium leading-snug text-tinta">{m.referencia}</span>
          {/* De quién es y a quién se le compra: a la vista en la lista, sin abrir la hoja (Felipe 2026-10-15). Dos piezas, sin punto medio. */}
          {origen && (
            <span data-origen className="flex flex-wrap gap-x-3 text-detalle text-tenue">
              <span className="break-words">{origen.marca}</span>
              <span className="break-words">{origen.proveedor}</span>
            </span>
          )}
          {agotadas && (
            <span className="mt-0.5 flex items-start gap-1.5 text-detalle leading-snug text-ambar">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ambar" />
              <span className="min-w-0">{agotadas}</span>
            </span>
          )}
          {/* En la forma angosta de la tabla las columnas de cifras se esconden: sus datos van aquí, cada uno con su nombre. */}
          <Pares className="mt-2 sm:hidden">
            <ParDato rotulo="En tiendas">{m.stockRed}</ParDato>
            <ParDato rotulo="Se venden por semana">{porSemana ?? "Sin ventas"}</ParDato>
            {m.enProduccion > 0 && <ParDato rotulo="Fabricándose">{m.enProduccion}</ParDato>}
          </Pares>
        </span>
      </span>
      <span className={celda("der", "hidden text-sm text-tinta sm:block")}>{m.stockRed}</span>
      <span className={celda("der", "hidden text-sm text-tinta sm:block")}>
        {porSemana ?? <span className="text-tenue">Sin ventas</span>}
        {pocaBase && (
          <span className="mt-1 block">
            <Chip tono="pizarra">Poca base</Chip>
          </span>
        )}
      </span>
      <span className="min-w-0">
        {/* Días de stock en las tiendas, con las rayitas de 7 y 30 días: una medida, no un avance (nunca pasa a verde). El texto de al lado ya lo dice. */}
        {barra && <BarraAvance pct={barra.pct} tono="tinta" marca={barra.marcas} decorativa />}
        <span className={`block text-detalle tabular-nums ${m.diasRed !== null && m.stockRed <= 0 ? "text-ambar" : "text-secundario"} ${barra ? "mt-1" : ""}`}>{dura}</span>
        {m.stockTaller > 0 && <span className="block text-detalle tabular-nums text-tenue">Además, {m.stockTaller} en el Taller</span>}
      </span>
      <span className={celda("der", "hidden text-sm text-tinta sm:block")}>{m.enProduccion > 0 ? m.enProduccion : <span className="text-tenue">Nada</span>}</span>
      <span className="min-w-0">
        <Chip tono={TONO_ESTADO_MODELO[m.estado]}>{ETIQUETA_ESTADO_MODELO[m.estado]}</Chip>
      </span>
    </FilaQueAbreLaHoja>
  );
}

export function TablaDeModelos({ modelos, hojas, presentaciones }: { modelos: readonly FilaModelo[]; hojas: Record<string, HojaDeModelo>; presentaciones: Record<string, PresentacionDeModelo> }) {
  return (
    <div data-guia="prod-resumen.demas-modelos" className="space-y-2.5">
      <TituloSeccion nivel={3} cuenta={modelos.length} ayuda={AYUDA_MODELOS}>
        Los demás modelos
      </TituloSeccion>
      <Tabla>
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {modelos.map((m) => (
          <FilaDeModelo key={m.productoId} m={m} hoja={hojas[m.productoId]} presentaciones={presentaciones} />
        ))}
      </Tabla>
    </div>
  );
}
