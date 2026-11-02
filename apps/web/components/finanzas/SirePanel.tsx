"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { SubirPropuestaSireModal } from "@/components/finanzas/SubirPropuestaSireModal";
import { textoMes } from "@/lib/gastos-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaLima, diaMes, horaLima } from "@/lib/fechas-lima";
import type { ComparacionSire } from "@/lib/sire";
import type { RegistroSire } from "@/lib/sire-propuesta-reglas";
import type { EstadoCruce, LineaCruce } from "@/lib/sire-cruce-reglas";

// Finanzas ▸ Impuestos ▸ Comparar con SUNAT (ADR-0601). Arriba, cuántos comprobantes hay en cada caso (cada cifra filtra la lista);
// debajo, la lista con lo que hay que mirar primero. Antes de subir nada, un vacío que dice de dónde se baja la propuesta.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const TIPO: Record<string, string> = { "01": "Factura", "03": "Boleta", "07": "Nota de crédito", "08": "Nota de débito" };

const ESTADO: Record<EstadoCruce, { texto: string; tono: TonoChip }> = {
  solo_erp: { texto: "SUNAT no la tiene", tono: "rojo" },
  solo_sunat: { texto: "Falta en el ERP", tono: "ambar" },
  montos: { texto: "Montos distintos", tono: "ambar" },
  papel: { texto: "En papel", tono: "pizarra" },
  coincide: { texto: "Cuadra", tono: "verde" },
};

const PLANTILLA = "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_7rem_7rem_minmax(0,1.6fr)]";

function Fila({ l }: { l: LineaCruce }) {
  const e = ESTADO[l.estado];
  return (
    <div className={fila(PLANTILLA)} role="row">
      <div className={celda()} role="cell">
        <p className="text-[15px] text-tinta">
          {TIPO[l.tipo] ?? `Tipo ${l.tipo}`} {l.serie}-{l.numero}
        </p>
        <p className="texto-detalle">{l.fecha ? l.fecha.split("-").reverse().join("/") : "Sin fecha"}</p>
      </div>
      <div className={celda()} role="cell">
        <p className="truncate text-[15px] text-tinta">{l.nombre}</p>
        <p className="texto-detalle">RUC {l.ruc ?? "sin RUC"}</p>
      </div>
      <div className={celda("der", "tabular-nums")} role="cell">
        <span className="text-taupe sm:hidden">SUNAT: </span>
        {!l.sunat ? "—" : l.enDolares ? `${l.sunat.moneda} ${Math.abs(l.sunat.total).toFixed(2)}` : soles(Math.abs(l.sunat.total))}
      </div>
      <div className={celda("der", "tabular-nums")} role="cell">
        <span className="text-taupe sm:hidden">ERP: </span>
        {l.erp ? soles(Math.abs(l.erp.total)) : "—"}
      </div>
      {/* Sin `celda()`: su `truncate` cortaría la explicación, que es lo que hay que leer. */}
      <div className="min-w-0" role="cell">
        <Chip tono={e.tono}>{e.texto}</Chip>
        {l.estado !== "coincide" && <p className="texto-detalle mt-1">{l.motivo}</p>}
      </div>
    </div>
  );
}

export function SirePanel({ registro, mes, comparacion }: { registro: RegistroSire; mes: string; comparacion: ComparacionSire }) {
  const [subiendo, setSubiendo] = useState(false);
  const [filtro, setFiltro] = useState<EstadoCruce | null>(null);
  const { propuesta, cruce, falla } = comparacion;
  const delMes = textoMes(mes);
  const r = cruce?.resumen;
  const lineas = cruce ? cruce.lineas.filter((l) => filtro === null || l.estado === filtro) : [];
  const porMirar = r ? r.solo_erp.n + r.solo_sunat.n + r.montos.n : 0;
  const alternar = (e: EstadoCruce) => setFiltro((f) => (f === e ? null : e));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="CAYLA entera"
        titulo="Comparar con SUNAT"
        detalle={`Impuestos · ${delMes}`}
        subtitulo={`La propuesta de ${registro} que SUNAT armó para ${delMes}, comprobante por comprobante, contra lo registrado en el ERP.`}
        ayuda="SUNAT arma la propuesta con los comprobantes electrónicos que recibió a nombre de CAYLA. Lo que esté solo en el ERP no da crédito de IGV hasta que el proveedor lo envíe; lo que esté solo en SUNAT es un gasto que nadie registró."
        volver={<Volver href={`/finanzas/impuestos?mes=${mes}`} a="Impuestos" />}
        acciones={
          <span data-guia="fin-sire.subir">
            <Boton peso={propuesta ? "fantasma" : "primario"} onClick={() => setSubiendo(true)}>
              {propuesta ? "Subir otra versión" : "Subir la propuesta"}
            </Boton>
          </span>
        }
      />

      {falla && (
        <Aviso tono="error" titulo="No se pudo comparar">
          {falla}
        </Aviso>
      )}

      {!propuesta && !falla && (
        <Vacio
          icono={<FileUp />}
          titulo={`Sube la propuesta de ${registro} de ${delMes}`}
          guia="fin-sire.vacio"
          acciones={
            <Boton peso="primario" onClick={() => setSubiendo(true)}>
              Subir la propuesta
            </Boton>
          }
        >
          Entra al portal SIRE de SUNAT con la Clave SOL, abre el Registro de {registro === "compras" ? "Compras" : "Ventas"} de {delMes} y pulsa «Descargar propuesta» en txt. Súbela aquí y el ERP te dice qué cuadra y qué no.
        </Vacio>
      )}

      {propuesta && r && (
        <>
          <p className="text-sm text-taupe" data-guia="fin-sire.version">
            Propuesta subida{propuesta.subidaPor ? ` por ${propuesta.subidaPor}` : ""} el {diaMes(diaLima(propuesta.subidaAt))}
            {horaLima(propuesta.subidaAt) ? ` a las ${horaLima(propuesta.subidaAt)}` : ""}
            {propuesta.versiones > 1 ? ` · versión ${propuesta.versiones}` : ""} · {plural(propuesta.lineas.length, "comprobante", "comprobantes")} en SUNAT
          </p>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-guia="fin-sire.cifras">
            <TarjetaCifra etiqueta="SUNAT no la tiene" valor={r.solo_erp.n} punto={r.solo_erp.n > 0 ? "rojo" : "neutro"} onClick={() => alternar("solo_erp")} activa={filtro === "solo_erp"}>
              {r.solo_erp.n > 0 ? `${soles(r.solo_erp.igv)} de IGV que no se descuenta` : "Todo lo del ERP está en SUNAT"}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Falta en el ERP" valor={r.solo_sunat.n} punto={r.solo_sunat.n > 0 ? "ambar" : "neutro"} onClick={() => alternar("solo_sunat")} activa={filtro === "solo_sunat"}>
              {r.solo_sunat.n > 0 ? `${soles(r.solo_sunat.igv)} de IGV sin registrar` : "Todo lo de SUNAT está registrado"}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Montos distintos" valor={r.montos.n} punto={r.montos.n > 0 ? "ambar" : "neutro"} onClick={() => alternar("montos")} activa={filtro === "montos"}>
              {r.montos.n > 0 ? "El mismo comprobante, otro monto" : "Ningún monto distinto"}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Cuadran" valor={r.coincide.n} punto={r.coincide.n > 0 ? "verde" : "neutro"} onClick={() => alternar("coincide")} activa={filtro === "coincide"}>
              {r.papel.n > 0 ? `y ${plural(r.papel.n, "factura en papel", "facturas en papel")}` : "Iguales en los dos"}
            </TarjetaCifra>
          </section>

          {porMirar === 0 && (
            <Aviso tono="exito" titulo="Todo cuadra con SUNAT">
              {r.papel.n > 0
                ? `El contador puede aceptar la propuesta y agregar ${plural(r.papel.n, "la factura en papel", "las facturas en papel")} antes de generar.`
                : "El contador puede aceptar la propuesta tal cual y generar el registro."}
            </Aviso>
          )}

          {lineas.length === 0 ? (
            <Vacio icono={<FileUp />} tamano="chico" accion={{ texto: "Ver todos", onClick: () => setFiltro(null) }}>
              No hay comprobantes en «{filtro ? ESTADO[filtro].texto : ""}».
            </Vacio>
          ) : (
            <Tabla guia="fin-sire.lista">
              <Encabezado
                plantilla={PLANTILLA}
                columnas={[{ titulo: "Comprobante" }, { titulo: "Proveedor" }, { titulo: "En SUNAT", alinear: "der" }, { titulo: "En el ERP", alinear: "der" }, { titulo: "Qué pasa" }]}
              />
              {lineas.map((l, i) => (
                <Fila key={`${l.clave}-${i}`} l={l} />
              ))}
            </Tabla>
          )}
        </>
      )}

      {subiendo && <SubirPropuestaSireModal registro={registro} mes={mes} onClose={() => setSubiendo(false)} />}
    </div>
  );
}
