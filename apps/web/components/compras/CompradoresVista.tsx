import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { Chip } from "@/components/ui/Chip";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { textoCierre } from "./DetalleComprador";
import {
  estadoDeFila,
  filasDeCompradores,
  gastoDeRonda,
  loQuePide,
  porRevisarDeRonda,
  resumenDeCompradores,
  rondasCerradasConAlgo,
  type CompradorSinRonda,
  type FilaComprador,
  type RondaDeCompras,
} from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { nombreDelMes } from "@/lib/comprobantes-lista-reglas";
import { primerNombre } from "@/lib/fondos-reglas";

// Lo que se DIBUJA de Compras ▸ Compradores (ADR-0704, act. 2026-11-26 c): la página lee y esta vista dibuja, sin leer nada (así se prueba con
// datos inventados). Una sola tabla de «quién tiene plata de CAYLA» —quien tiene su ronda abierta y quien tiene plata sin haberla abierto—,
// con totales, cuatro cifras que sirven para decidir y las rondas que ya cerraron. Las cuentas viven en `lib/compradores-reglas.ts`.
// `rondas = null`: no se pudo leer, y lo dice. `entregar` y `porDefinir` son piezas de cliente que arma la página.

const LIMITE_CERRADAS = 8;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** Un cero no compite con las cifras que sí dicen algo. */
const cero = (n: number): string => (Math.abs(n) <= 0.005 ? "text-tenue" : "text-tinta");

// Persona · Le diste · Gastó (con su barra) · Le queda · Compras · Qué pide · ›
const PLANTILLA = "sm:grid-cols-[minmax(11rem,1.2fr)_8rem_11rem_9rem_8rem_minmax(11rem,1fr)_1rem]";
// Persona · Ronda · Compras · Gastó · Cómo cerró · ›
const PLANTILLA_CERRADAS = "sm:grid-cols-[minmax(11rem,1.2fr)_10rem_10rem_8rem_minmax(11rem,1fr)_1rem]";

export function CompradoresVista({
  rondas,
  sinRonda,
  hoy,
  entregar,
  porDefinir,
  rendiciones,
}: {
  rondas: RondaDeCompras[] | null;
  /** Quien tiene plata en la mano y todavía no abrió su ronda. Sin el dato (no se pudo leer), la tabla sale solo con las rondas abiertas. */
  sinRonda?: CompradorSinRonda[] | null;
  hoy: string;
  entregar?: ReactNode;
  porDefinir?: ReactNode;
  /** Las rendiciones de fondo por aprobar (ADR-0362), solo si hay alguna. */
  rendiciones?: ReactNode;
}) {
  const filas = filasDeCompradores(rondas ?? [], sinRonda ?? [], hoy);
  const r = resumenDeCompradores(rondas ?? [], filas, hoy);
  const cerradas = rondasCerradasConAlgo(rondas ?? []).slice(0, LIMITE_CERRADAS);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Compradores"
        subtitulo="Quién tiene plata de CAYLA y en qué la gastó."
        ayuda="Cada persona recibe plata, abre su ronda en «Mis compras», anota lo que compra y lo manda a la tienda. Aquí ves cuánto tiene cada una en la mano, cuánto gastó y qué falta revisar."
        acciones={entregar}
      />

      {rondas === null ? (
        <Aviso tono="error" titulo="No se pudo leer quién está comprando">
          Vuelve a intentarlo en un momento.
        </Aviso>
      ) : (
        <>
          <div className="@container">
            <div data-guia="compradores.cifras" className="grid grid-cols-1 gap-3 @[36rem]:grid-cols-2 @[68rem]:grid-cols-4">
              <TarjetaCifra etiqueta="Plata en la calle" valor={soles(r.enLaCalle)}>
                {r.conPlata === 0 ? "Nadie tiene plata en la mano" : `En manos de ${plural(r.conPlata, "persona", "personas")}`}
              </TarjetaCifra>
              <TarjetaCifra etiqueta={`Gastaron en ${nombreDelMes(hoy)}`} valor={soles(r.gastadoMes)}>
                {r.comprasMes === 0 ? "Sin compras este mes" : `${plural(r.comprasMes, "compra", "compras")} de ${plural(r.personasMes, "persona", "personas")}`}
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Por revisar" valor={r.porRevisar} unidad={r.porRevisar === 1 ? "compra" : "compras"} punto={r.porRevisar > 0 ? "ambar" : "verde"}>
                {r.porRevisar > 0 ? `De ${plural(r.quienesPorRevisar, "persona", "personas")}` : "Todo revisado"}
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Falta pagar" valor={soles(r.faltaPagar)} punto={r.faltaPagar > 0.005 ? "ambar" : "verde"}>
                {r.faltaPagar > 0.005 ? `${plural(r.comprasPorPagar, "compra", "compras")} a medio pagar` : "Nada pendiente con proveedores"}
              </TarjetaCifra>
            </div>
          </div>

          {rendiciones}

          <section className="space-y-3">
            <TituloSeccion cuenta={filas.length}>Quién tiene plata</TituloSeccion>
            {filas.length === 0 ? (
              <div className="card-cayla">
                <Vacio icono={<Users />} titulo="Nadie tiene plata ni ronda abierta" acciones={entregar}>
                  Entrégale plata a quien va a comprar y aparece aquí.
                </Vacio>
              </div>
            ) : (
              <Tabla guia="compradores.personas">
                <Encabezado
                  plantilla={PLANTILLA}
                  columnas={[
                    { titulo: "Persona" },
                    { titulo: "Le diste", alinear: "der" },
                    { titulo: "Gastó", alinear: "der" },
                    { titulo: "Le queda", alinear: "der" },
                    { titulo: "Compras", alinear: "der" },
                    { titulo: "Qué pide" },
                    { titulo: "" },
                  ]}
                />
                {filas.map((f) => (
                  <FilaPersona key={f.personaId} f={f} />
                ))}
                {filas.length > 1 && (
                  <div className={fila(PLANTILLA, "sm:items-center")}>
                    <span className={celda("izq", "text-sm font-semibold text-tinta")}>Total</span>
                    <span className={celda("der", "hidden text-sm font-semibold text-tinta sm:block")}>{soles(r.total.dieron)}</span>
                    <span className={celda("der", "hidden text-sm font-semibold text-tinta sm:block")}>{soles(r.total.gasto)}</span>
                    <span className={celda("der", "hidden font-display text-xl leading-tight text-tinta sm:block")}>{soles(r.total.queda)}</span>
                    <TresCifras dieron={r.total.dieron} gasto={r.total.gasto} queda={r.total.queda} />
                  </div>
                )}
              </Tabla>
            )}
          </section>

          {/* «Por definir» va DESPUÉS de las personas (/formidable 2026-11-26): la pantalla responde primero quién tiene plata. */}
          {porDefinir}

          {cerradas.length > 0 && (
            <section className="space-y-3">
              <TituloSeccion cuenta={cerradas.length}>Rondas que ya cerraron</TituloSeccion>
              <Tabla guia="compradores.cerradas">
                <Encabezado
                  plantilla={PLANTILLA_CERRADAS}
                  columnas={[{ titulo: "Persona" }, { titulo: "Ronda" }, { titulo: "Compras", alinear: "der" }, { titulo: "Gastó", alinear: "der" }, { titulo: "Cómo cerró" }, { titulo: "" }]}
                />
                {cerradas.map((ronda) => (
                  <FilaCerrada key={ronda.id} r={ronda} />
                ))}
              </Tabla>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Los tres números con su nombre, para cuando la tabla pasa a su forma de celular (ahí no hay cabecera que los nombre). */
function TresCifras({ dieron, gasto, queda }: { dieron: number; gasto: number; queda: number }) {
  const deMas = queda < -0.005;
  return (
    <span className="grid grid-cols-3 gap-2 sm:hidden">
      <CifraChica etiqueta="Le diste" valor={soles(dieron)} clase={cero(dieron)} />
      <CifraChica etiqueta="Gastó" valor={soles(gasto)} clase={cero(gasto)} />
      <CifraChica etiqueta={deMas ? "Pagó de más" : "Le queda"} valor={soles(Math.abs(queda))} clase={deMas ? "text-ambar" : cero(queda)} fuerte />
    </span>
  );
}

function CifraChica({ etiqueta, valor, clase, fuerte = false }: { etiqueta: string; valor: string; clase: string; fuerte?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-secundario">{etiqueta}</span>
      <span className={`block whitespace-nowrap tabular-nums ${fuerte ? "font-display text-lg leading-tight" : "text-detalle"} ${clase}`}>{valor}</span>
    </span>
  );
}

function FilaPersona({ f }: { f: FilaComprador }) {
  const deMas = f.queda < -0.005;
  const compras = f.compras === 0 ? null : `${plural(f.compras, "compra", "compras")}, ${plural(f.prendas, "prenda", "prendas")}`;
  return (
    <Link href={`/compras/compradores/${f.personaId}`} className={fila(PLANTILLA, "group sm:items-center")}>
      <span className={celda("izq", "flex items-center gap-3")}>
        <AvatarPersona personaId={f.personaId} nombre={f.persona} tamano={40} />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-tinta">{primerNombre(f.persona)}</span>
          <span className="block truncate text-detalle text-secundario">{estadoDeFila(f)}</span>
        </span>
      </span>
      <span className={celda("der", `hidden text-sm sm:block ${cero(f.dieron)}`)}>{soles(f.dieron)}</span>
      <span className={celda("der", `hidden text-sm sm:block ${cero(f.gasto)}`)}>
        <span className="block">{soles(f.gasto)}</span>
        {f.usado !== null && (
          <span className="mt-1.5 flex items-center justify-end gap-2">
            <BarraAvance pct={f.usado} alto="fina" tono="tinta" decorativa className="w-16" />
            <span className="w-10 text-right text-xs text-secundario">{f.usado} %</span>
          </span>
        )}
      </span>
      <span className={celda("der", `hidden font-display text-xl leading-tight sm:block ${deMas ? "text-ambar" : cero(f.queda)}`)}>{soles(Math.abs(f.queda))}</span>
      <span className={celda("der", "hidden text-sm text-tinta sm:block")}>
        {f.compras === 0 ? (
          <span className="text-tenue">Ninguna</span>
        ) : (
          <>
            <span className="block">{f.compras}</span>
            <span className="block text-detalle text-secundario">{plural(f.prendas, "prenda", "prendas")}</span>
          </>
        )}
      </span>
      <TresCifras dieron={f.dieron} gasto={f.gasto} queda={f.queda} />
      {compras && <span className="text-detalle text-secundario sm:hidden">{compras}</span>}
      <span className={celda("izq", "flex flex-wrap gap-1.5 overflow-visible whitespace-normal")}>
        {loQuePide(f, soles).map((p) => (
          <Chip key={p.texto} tono={p.tono}>
            {p.texto}
          </Chip>
        ))}
      </span>
      <ChevronRight aria-hidden className="hidden h-4 w-4 text-tenue transition-transform duration-300 sm:block [@media(hover:hover)]:group-hover:translate-x-0.5" />
    </Link>
  );
}

function FilaCerrada({ r }: { r: RondaDeCompras }) {
  const porRevisar = porRevisarDeRonda(r);
  const fechas = diaMes(r.abiertaEn) === diaMes(r.cerradaEn) ? `El ${diaMes(r.abiertaEn)}` : `Del ${diaMes(r.abiertaEn)} al ${diaMes(r.cerradaEn)}`;
  return (
    <Link href={`/compras/compradores/${r.personaId}?ronda=${r.id}`} className={fila(PLANTILLA_CERRADAS, "group sm:items-center")}>
      <span className={celda("izq", "flex items-center gap-3")}>
        <AvatarPersona personaId={r.personaId} nombre={r.persona} tamano={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-tinta">{primerNombre(r.persona)}</span>
          <span className="block truncate text-detalle text-secundario sm:hidden">{fechas}</span>
        </span>
      </span>
      <span className={celda("izq", "hidden text-sm tabular-nums text-secundario sm:block")}>{fechas}</span>
      <span className={celda("der", "hidden text-sm text-tinta sm:block")}>
        <span className="block">{r.cuenta.compras}</span>
        <span className="block text-detalle text-secundario">{plural(r.cuenta.prendas, "prenda", "prendas")}</span>
      </span>
      <span className={celda("der", "hidden text-sm text-tinta sm:block")}>{soles(gastoDeRonda(r.cuenta))}</span>
      <span className="flex items-baseline justify-between gap-3 text-detalle sm:hidden">
        <span className="text-secundario">
          {plural(r.cuenta.compras, "compra", "compras")}, {plural(r.cuenta.prendas, "prenda", "prendas")}
        </span>
        <span className="tabular-nums text-tinta">{soles(gastoDeRonda(r.cuenta))}</span>
      </span>
      <span className={celda("izq", "flex flex-wrap items-center gap-1.5 overflow-visible whitespace-normal text-sm text-secundario")}>
        {textoCierre(r)}
        {porRevisar > 0 && <Chip tono="ambar">{porRevisar} por revisar</Chip>}
      </span>
      <ChevronRight aria-hidden className="hidden h-4 w-4 text-tenue transition-transform duration-300 sm:block [@media(hover:hover)]:group-hover:translate-x-0.5" />
    </Link>
  );
}
