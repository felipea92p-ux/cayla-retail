import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import {
  avisoDeRonda,
  estadoDeCompra,
  gastoDeRonda,
  llegadaDeCompra,
  nombreDelPapel,
  quedaDeRonda,
  type CompraDelLibro,
  type RondaDeCompras,
} from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";

// Lo que se DIBUJA del detalle de una persona en Compradores (ADR-0704, maqueta docs/maquetas/compras-reestructura-2026-11/, pantalla 2): su
// cuenta de la ronda (le diste · gastó · le queda, con el aviso si algo pide atención), lo que espera revisión —la bandeja de siempre, solo con
// lo suyo— y todas sus compras de la ronda, con su papel, el envío en que salieron y si ya se revisaron. Al costado de la cabecera, sus otras
// rondas. No lee nada: lo arma la página (`app/(app)/compras/compradores/[personaId]/page.tsx`).

// Día · Proveedor (papel · prendas · medio) · Envío · Estado · Monto.
const PLANTILLA = "sm:grid-cols-[5rem_minmax(0,1fr)_11rem_10.5rem_7rem]";

export function DetalleComprador({
  nombre,
  ronda,
  otras,
  hoy,
  acciones,
  bandeja,
  cerrarRonda,
  plata,
  personaId,
}: {
  /** `null`: el id no es de nadie que compre o tenga un fondo. */
  nombre: string | null;
  personaId: string;
  /** La ronda que se mira; `null` si la persona no tiene ninguna en los últimos 60 días. */
  ronda: RondaDeCompras | null;
  /** Sus otras rondas (abierta o de los últimos 60 días), para pasar de una a otra. */
  otras: readonly RondaDeCompras[];
  hoy: string;
  acciones?: ReactNode;
  /** Lo que espera revisión de esta persona (la bandeja de Revisar compras, filtrada); `null` si no hay nada. */
  bandeja?: ReactNode;
  /** La acción «Cerrar su ronda», solo si la ronda se puede cerrar desde Compras. */
  cerrarRonda?: ReactNode;
  /** Las entregas, devoluciones y pagos de deuda de esta persona, con su «Anular» (antes, la hoja «Entregas y devoluciones»). */
  plata?: ReactNode;
}) {
  const aviso = ronda ? avisoDeRonda(ronda, hoy, soles) : null;
  const queda = ronda ? quedaDeRonda(ronda.cuenta) : 0;
  const noCuadra = queda < -0.005;
  const detalle = ronda
    ? ronda.cerradaEn
      ? `Ronda del ${diaMes(ronda.abiertaEn)} al ${diaMes(ronda.cerradaEn)}`
      : `Ronda abierta desde el ${diaMes(ronda.abiertaEn)}`
    : undefined;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Compradores"
        titulo={nombre ?? "Persona no encontrada"}
        detalle={detalle}
        subtitulo="Lo que compró con la plata que le diste."
        volver={<Volver href="/compras/compradores" a="Compradores" />}
        acciones={acciones}
      />

      {!ronda ? (
        <div className="card-cayla">
          {nombre ? (
            <Vacio icono={<ShoppingBag />} titulo={`${nombre} no compró en los últimos dos meses`}>
              Cuando abra su ronda en «Mis compras», sus compras aparecen aquí.
            </Vacio>
          ) : (
            <Vacio icono={<ShoppingBag />} titulo="No encontramos a esta persona">
              Vuelve a Compradores y elígela de la lista.
            </Vacio>
          )}
        </div>
      ) : (
        <>
          <div className="@container">
            <div data-guia="comprador.cuenta" className="grid grid-cols-1 gap-3 @[36rem]:grid-cols-3">
              <TarjetaCifra etiqueta="Le diste" valor={soles(ronda.cuenta.dieron)}>
                {ronda.cuenta.dieron > 0 ? "Plata para esta ronda" : "Sin plata registrada"}
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Gastó" valor={soles(gastoDeRonda(ronda.cuenta))}>
                {`En ${ronda.cuenta.compras} ${ronda.cuenta.compras === 1 ? "compra" : "compras"}${ronda.cuenta.gastaste > 0 ? ` y ${soles(ronda.cuenta.gastaste)} de gastos` : ""}`}
              </TarjetaCifra>
              <TarjetaCifra etiqueta={noCuadra ? (ronda.cuenta.dieron > 0 ? "No cuadra" : "Sin plata") : "Le queda"} valor={soles(Math.abs(queda))} punto={noCuadra ? "ambar" : undefined}>
                {noCuadra ? (ronda.cuenta.dieron > 0 ? "Pagó más de lo que le diste" : "Pagó sin plata registrada") : ronda.cerradaEn ? textoCierre(ronda) : "En la mano"}
              </TarjetaCifra>
            </div>
          </div>

          {aviso && (
            <Aviso tono={aviso.tono === "ambar" ? "atencion" : "info"} titulo={aviso.texto} accion={aviso.cerrarRonda ? cerrarRonda : undefined} chico />
          )}

          {bandeja && (
            <section className="space-y-3" data-guia="comprador.por-revisar">
              <TituloSeccion>Por revisar</TituloSeccion>
              {bandeja}
            </section>
          )}

          <section className="space-y-3">
            <TituloSeccion cuenta={ronda.compras.length}>Sus compras</TituloSeccion>
            {ronda.compras.length === 0 ? (
              <div className="card-cayla">
                <Vacio icono={<ShoppingBag />} titulo="Todavía no anota compras" tamano="chico" />
              </div>
            ) : (
              <Tabla guia="comprador.compras">
                <Encabezado
                  plantilla={PLANTILLA}
                  columnas={[{ titulo: "Día" }, { titulo: "Proveedor" }, { titulo: "Envío" }, { titulo: "Estado" }, { titulo: "Monto", alinear: "der" }]}
                />
                {ronda.compras.map((c) => (
                  <FilaCompra key={c.id} c={c} />
                ))}
              </Tabla>
            )}
          </section>
        </>
      )}

      {plata && (
        <section className="space-y-3" data-guia="comprador.plata">
          <TituloSeccion>La plata que le diste</TituloSeccion>
          <div className="card-cayla p-4 sm:p-5">{plata}</div>
        </section>
      )}

      {otras.length > 0 && (
        <section className="space-y-3" data-guia="comprador.rondas">
          <TituloSeccion cuenta={otras.length}>Sus otras rondas</TituloSeccion>
          <ul className="card-cayla divide-y divide-sand p-0">
            {otras.map((r) => (
              <li key={r.id}>
                <Link href={`/compras/compradores/${personaId}?ronda=${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-4 px-5 py-3 text-sm vd-pasa">
                  <span className="min-w-0">
                    <span className="block text-tinta">{r.cerradaEn ? `Del ${diaMes(r.abiertaEn)} al ${diaMes(r.cerradaEn)}` : `Abierta desde el ${diaMes(r.abiertaEn)}`}</span>
                    <span className="block text-secundario">
                      {r.cuenta.compras} {r.cuenta.compras === 1 ? "compra" : "compras"}
                      {r.cerradaEn ? ` · ${textoCierre(r)}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums text-tinta">{soles(gastoDeRonda(r.cuenta))}</span>
                  <ChevronRight aria-hidden className="h-4 w-4 text-tenue" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FilaCompra({ c }: { c: CompraDelLibro }) {
  const estado = estadoDeCompra(c, soles);
  const llegada = llegadaDeCompra(c);
  const envio = c.envios.at(-1);
  return (
    <div className={fila(PLANTILLA)}>
      <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{diaMes(c.fecha)}</span>
      <span className={celda("izq", "min-w-0")}>
        <span className="block truncate text-sm font-medium text-tinta">{c.proveedor}</span>
        <span className="block whitespace-normal text-sm text-secundario">
          {[nombreDelPapel(c.tipo), `${c.prendas} ${c.prendas === 1 ? "prenda" : "prendas"}`, medio(c.medioPago)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className={celda("izq", "whitespace-normal text-sm")}>
        {envio ? (
          <>
            <span className="block tabular-nums text-tinta">{envio.numero}</span>
            <span className="block text-secundario">{llegada}</span>
          </>
        ) : (
          <span className="text-secundario">Sin enviar</span>
        )}
      </span>
      <span className={celda("izq", "overflow-visible")}>
        <Chip tono={estado.tono}>{estado.texto}</Chip>
      </span>
      <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(c.monto)}</span>
    </div>
  );
}

const MEDIOS: Record<string, string> = { yape: "Yape", efectivo: "Efectivo", transferencia: "Transferencia" };
const medio = (m: string | null) => (m ? (MEDIOS[m] ?? m) : null);

/** Cómo cerró, en palabras de tienda. */
export function textoCierre(r: Pick<RondaDeCompras, "cierre">): string {
  if (!r.cierre) return "Cerrada";
  if (r.cierre.decision === "devuelve") return `Devolvió ${soles(r.cierre.monto)}`;
  if (r.cierre.decision === "le_deben") return `CAYLA le debía ${soles(r.cierre.monto)}`;
  return "Se quedó en cero";
}
