import { Ruler, Store } from "lucide-react";
import {
  curvaDelProveedor,
  sedesDelProveedor,
  trasladoSugerido,
  veredictoDeSede,
  SEMANAS_COBERTURA_TRASLADO,
  type CeldaTallaSede,
  type VeredictoSede,
} from "@/lib/proveedor-tallas-sedes-reglas";
import { MIN_VENDIDAS } from "@/lib/proveedor-analisis-reglas";
import { DIAS_PARA_JUZGAR, MIN_COMPRADAS, SEMANAS_AGOTA, SEMANAS_STOCK_LARGO } from "@/lib/proveedor-ritmo-reglas";
import { DIFERENCIA_QUE_SE_NOTA } from "@/lib/analisis-pedir";
import { fechaCorta } from "@/lib/compras";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Encabezado, Tabla, fila, celda, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";

// Ficha de proveedor ▸ «Las tallas que se llevan» y «Cómo le va en cada sede» (ADR-0502, act. 2026-10-26 (e)). Server Component sin estado:
// las cuentas son las de `proveedor-tallas-sedes-reglas.ts` (las mismas que dan los avisos de «Lo que quizá no ves», así que no se contradicen).
// Unidades, no plata: valen para los dos orígenes (Compras y carga inicial). El traslado solo se sugiere; lo hace una persona en Traslados.

const num = (n: number) => n.toLocaleString("es-PE");
const unaDecima = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });

/* ───────── Tallas ───────── */

const PLANTILLA_TALLAS = "sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_7rem]";
const COLUMNAS_TALLAS: Columna[] = [
  { titulo: "Talla" },
  { titulo: "De lo que vendes", ayuda: "Qué parte de todo lo vendido de este proveedor es de esta talla" },
  { titulo: "De lo que tienes", ayuda: "Qué parte de todo su stock (tiendas, almacén y Taller) es de esta talla" },
  { titulo: "", alinear: "der" },
];

function Tallas({ celdas }: { celdas: readonly CeldaTallaSede[] }) {
  const curva = curvaDelProveedor(celdas);
  if (curva.tipo !== "tallas") {
    return (
      <section className="space-y-3" data-guia="proveedor-ficha.tallas">
        <TituloSeccion>Las tallas que se llevan</TituloSeccion>
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<Ruler />} titulo={curva.tipo === "unica" ? "Sus prendas son de talla única" : "Todavía no hay tallas que comparar"}>
            {curva.tipo === "unica" ? "Sus prendas son de talla única: no hay tallas que repartir." : "Las tallas aparecen cuando haya ventas o prendas con talla de este proveedor."}
          </Vacio>
        </div>
      </section>
    );
  }
  // Con pocas ventas no se concluye nada: se muestran los números, sin decir qué talla pide más o sobra.
  const concluye = curva.vendidas >= MIN_VENDIDAS;
  return (
    <section className="space-y-3" data-guia="proveedor-ficha.tallas">
      <TituloSeccion dato={`${num(curva.vendidas)} vendidas · ${num(curva.tiene)} en stock`}>Las tallas que se llevan</TituloSeccion>
      <Tabla className="@container">
        <Encabezado plantilla={PLANTILLA_TALLAS} columnas={COLUMNAS_TALLAS} />
        {curva.columnas.map((c) => (
          <div key={c.talla} className={fila(PLANTILLA_TALLAS)}>
            <span className={celda("izq", "font-serif text-lg text-tinta")}>{c.talla}</span>
            <span className={celda("izq", "overflow-visible")}>
              <span className="block text-sm tabular-nums text-tinta">
                {c.v} % <span className="text-xs text-taupe">· {num(c.vend)} vendidas</span>
              </span>
              <BarraAvance pct={(c.v / curva.max) * 100} alto="fina" tono="tinta" decorativa className="mt-1" />
            </span>
            <span className={celda("izq", "overflow-visible")}>
              <span className="block text-sm tabular-nums text-tinta">
                {c.t} % <span className="text-xs text-taupe">· {num(c.tiene)} en stock</span>
              </span>
              <BarraAvance pct={(c.t / curva.max) * 100} alto="fina" tono={concluye && c.sobra ? "ambar" : "tinta"} decorativa className="mt-1" />
            </span>
            <span className={celda("der")}>
              {concluye && c.pideMas && <Chip tono="verde">Pide más</Chip>}
              {concluye && c.sobra && <Chip tono="ambar">Sobra</Chip>}
            </span>
          </div>
        ))}
      </Tabla>
      <p className="nota-cayla">
        Si una talla pesa más en lo que vendes que en lo que tienes, pide más; si pesa más en lo que tienes, sobra (desde {DIFERENCIA_QUE_SE_NOTA} puntos de diferencia, igual
        que en Análisis). Cuenta todo lo vendido desde que llegó su ropa.
        {concluye ? "" : ` Con menos de ${MIN_VENDIDAS} vendidas todavía no se dice qué talla pide más.`}
        {curva.nota ? ` ${curva.nota}.` : ""}
      </p>
    </section>
  );
}

/* ───────── Sedes ───────── */

const PLANTILLA_SEDES = "sm:grid-cols-[minmax(8rem,1fr)_5.5rem_5.5rem_6.5rem_minmax(10rem,1.2fr)_8rem]";
const COLUMNAS_SEDES: Columna[] = [
  { titulo: "Sede" },
  { titulo: "Vendidas", alinear: "der" },
  { titulo: "Quedan", alinear: "der" },
  { titulo: "Por semana", alinear: "der", ayuda: "Lo vendido entre las semanas desde que le llegó su primera prenda de este proveedor" },
  { titulo: "Vender lo que queda", ayuda: "Al ritmo de esa sede, cuánto tardaría en venderse lo que tiene" },
  { titulo: "", alinear: "der" },
];

const CHIP_SEDE: Record<VeredictoSede, { tono: TonoChip; texto: string }> = {
  agotada: { tono: "rojo", texto: "Se agotó" },
  "se-agota": { tono: "verde", texto: "Se agota" },
  lenta: { tono: "ambar", texto: "Rota lento" },
  "va-bien": { tono: "neutro", texto: "Va bien" },
  "sin-medir": { tono: "apagado", texto: "Aún no se mide" },
};

function textoTarda(s: ReturnType<typeof sedesDelProveedor>["tiendas"][number]): string {
  const r = s.ritmo;
  if (!r.juzgable) return s.primeraLlegada ? `Le llegó el ${fechaCorta(s.primeraLlegada)}` : "Todavía sin llegadas";
  if (r.enEstantes === 0) return "No le queda nada";
  if (!Number.isFinite(r.semanasParaAgotar)) return "No ha vendido nada";
  return `Unas ${Math.round(r.semanasParaAgotar)} semanas`;
}

function Sedes({ celdas, hoy, hrefTraslados }: { celdas: readonly CeldaTallaSede[]; hoy: string; hrefTraslados: string | null }) {
  const { tiendas, fuera } = sedesDelProveedor(celdas, hoy);
  if (tiendas.length === 0) {
    return (
      <section className="space-y-3" data-guia="proveedor-ficha.sedes">
        <TituloSeccion>Cómo le va en cada sede</TituloSeccion>
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<Store />} titulo="Sus prendas todavía no llegan a una tienda">
            Sus prendas todavía no llegan a una tienda. Cuando lleguen, aquí verás en cuál se venden más rápido.
          </Vacio>
        </div>
      </section>
    );
  }
  const traslado = trasladoSugerido(celdas, hoy);
  const maxPorSemana = Math.max(...tiendas.map((s) => s.ritmo.porSemana), 0);
  return (
    <section className="space-y-3" data-guia="proveedor-ficha.sedes">
      <TituloSeccion cuenta={tiendas.length}>Cómo le va en cada sede</TituloSeccion>
      {traslado && (
        <Aviso
          tono="info"
          guia="proveedor-ficha.traslado"
          titulo={`Lleva ${num(traslado.cantidad)} de ${traslado.origen.sede} a ${traslado.destino.sede}`}
          accion={hrefTraslados ? <BotonVer href={hrefTraslados} chico>Ir a Traslados</BotonVer> : undefined}
        >
          En {traslado.destino.sede} vende {unaDecima(traslado.destino.ritmo.porSemana)} por semana y le quedan {num(traslado.destino.stock)}; en {traslado.origen.sede} vender lo que tiene tardaría{" "}
          {Number.isFinite(traslado.origen.ritmo.semanasParaAgotar) ? `unas ${Math.round(traslado.origen.ritmo.semanasParaAgotar)} semanas` : "más de lo que se puede medir"}. Empieza por:{" "}
          {traslado.lineas.slice(0, 5).map((l) => `${l.referencia} ${l.talla} (${num(l.cantidad)})`).join(", ")}
          {traslado.lineas.length > 5 ? ` y ${num(traslado.lineas.length - 5)} más` : ""}.
        </Aviso>
      )}
      <Tabla className="@container">
        <Encabezado plantilla={PLANTILLA_SEDES} columnas={COLUMNAS_SEDES} />
        {tiendas.map((s) => {
          const v = CHIP_SEDE[veredictoDeSede(s)];
          return (
            <div key={s.ubicacionId} className={fila(PLANTILLA_SEDES)}>
              <span className={celda("izq", "text-sm text-tinta")}>{s.sede}</span>
              {/* En el celular las celdas se apilan: cada número lleva su palabra para no quedar suelto. */}
              <span className={celda("der", "text-sm text-tinta")}>
                {num(s.vendidas)} <span className="text-xs text-taupe sm:hidden">vendidas</span>
              </span>
              <span className={celda("der", "text-sm text-tinta")}>
                {num(s.stock)} <span className="text-xs text-taupe sm:hidden">quedan</span>
              </span>
              <span className={celda("der", "overflow-visible")}>
                <span className="block text-sm tabular-nums text-tinta">
                  {unaDecima(s.ritmo.porSemana)} <span className="text-xs text-taupe sm:hidden">por semana</span>
                </span>
                <BarraAvance pct={maxPorSemana > 0 ? (s.ritmo.porSemana / maxPorSemana) * 100 : 0} alto="fina" tono="tinta" decorativa className="mt-1" />
              </span>
              <span className={celda("izq", "text-sm text-tinta")}>{textoTarda(s)}</span>
              <span className={celda("der")}>
                <Chip tono={v.tono}>{v.texto}</Chip>
              </span>
            </div>
          );
        })}
      </Tabla>
      <p className="nota-cayla">
        Cada tienda se mide desde que le llegó su primera prenda de este proveedor, con la misma regla que el ranking: rota lento si vender lo que tiene tardaría{" "}
        {SEMANAS_STOCK_LARGO} semanas o más, se agota si le alcanza para {SEMANAS_AGOTA} o menos. Se mide con {MIN_COMPRADAS} unidades o más y {DIAS_PARA_JUZGAR} días en la tienda.
        El traslado deja a cada tienda lo que vende en {SEMANAS_COBERTURA_TRASLADO} semanas y solo lleva prendas que la otra ya vende.
        {fuera.length > 0 ? ` Fuera de las tiendas: ${fuera.map((f) => `${num(f.stock)} en ${f.sede}`).join(", ")}.` : ""}
      </p>
    </section>
  );
}

export function ProveedorTallasSedes({ celdas, hoy, hrefTraslados }: { celdas: readonly CeldaTallaSede[]; hoy: string; hrefTraslados: string | null }) {
  return (
    <div className="grid gap-6 2xl:grid-cols-2">
      <Tallas celdas={celdas} />
      <Sedes celdas={celdas} hoy={hoy} hrefTraslados={hrefTraslados} />
    </div>
  );
}
