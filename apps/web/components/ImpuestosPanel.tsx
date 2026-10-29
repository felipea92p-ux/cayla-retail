"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { leerRpcPorPaginas } from "@/lib/rpc-por-paginas";
import { avisar } from "@/components/ui/Avisos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { RespuestaTelar } from "@/components/finanzas/telar/RespuestaTelar";
import { DockTelar } from "@/components/finanzas/telar/DockTelar";
import { PagasImpuestos, CuentaLineas } from "@/components/finanzas/ImpuestosCuenta";
import { LimiteAnio, MesesImpuestos, PendientesImpuestos } from "@/components/finanzas/ImpuestosFila";
import { mesADeclarar, sobresIgv } from "@/lib/impuestos-sobres-reglas";
import { pendientesCompactos } from "@/lib/impuestos-antes-reglas";
import { barrasMeses, cuentaImpuestos, limiteImpuestos } from "@/lib/impuestos-cuenta-reglas";
import { sedeDeLaCabecera } from "@/lib/impuestos-telar-reglas";
import { lineaImpuestosClaure, type VentasClaure } from "@/lib/cuenta-claure-reglas";
import { hrefTelar, type ClaveSede, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { descargarBlob, descargarCsv, textoCsv } from "@/lib/exportar-csv";
import { crearZip } from "@/lib/zip-simple";
import { solesRedondo, textoMes } from "@/lib/gastos-reglas";
import {
  ORDEN_REGISTRO_COMPRAS,
  ORDEN_REGISTRO_VENTAS,
  csvRegistroCompras,
  csvRegistroVentas,
  csvResumenIgv,
  leerFilaCompras,
  leerFilaVentas,
  nombreArchivo,
  nombreMes,
  type PanelImpuestos,
} from "@/lib/impuestos-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Download, FileText, Receipt } from "lucide-react";
import { MenuAcciones } from "@/components/ui/MenuAcciones";

// Finanzas ▸ Impuestos «E · B++» (ADR-0573, Felipe 2026-10-28) sobre El telar (ADR-0493): arriba, UNA respuesta («Pagas») y la cuenta en líneas;
// debajo, en una fila, los pendientes con su monto, el límite del año y el IGV de cada mes. Es de CAYLA entera («Ver» fijo): la ve quien tiene el
// módulo (ADR-0253). La pantalla solo lee: el IGV, el saldo a favor y el límite los calcula la base; el porcentaje de la renta es el del parámetro
// del año (Configuración ▸ Impuestos). Los registros se arman aquí, en el navegador, con lo que devuelve la base.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type Descarga = "ventas" | "compras" | "resumen" | "paquete";

type Contexto = { sede: ClaveSede; sedes: SedeTelar[]; claure: VentasClaure | null };

export function ImpuestosPanel({ panel, falla, sede, sedes, claure }: { panel: PanelImpuestos | null; falla: string | null } & Contexto) {
  if (!panel) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={sedeDeLaCabecera(sede, sedes)} titulo="Impuestos">
          <RespuestaTelar pregunta="¿Cuánto le pagas a SUNAT?" valor={null} motivo={falla ?? "No se pudo leer el IGV. Vuelve a intentarlo en un rato."} />
        </EncabezadoPagina>
      </div>
    );
  }
  return <Pantalla panel={panel} falla={falla} sede={sede} sedes={sedes} claure={claure} />;
}

function Pantalla({ panel, falla, sede, sedes, claure }: { panel: PanelImpuestos; falla: string | null } & Contexto) {
  const router = useRouter();
  const sp = useSearchParams();
  const [bajando, setBajando] = useState<Descarga | null>(null);
  const { mes, mesActual } = panel;
  // Cambiar de mes sube a la cuenta (la respuesta cambia arriba y tiene que verse) y conserva la sede de la mesa de mando.
  const irA = (m: string) => router.push(hrefTelar("/finanzas/impuestos", sp.entries(), { mes: m }, { mismaPantalla: true, mesDeHoy: mesActual }));
  const aDeclarar = mesADeclarar(mesActual);
  const sobres = sobresIgv(panel.historial, mesActual, mes);
  const sobreADeclarar = sobres.find((x) => x.mes === aDeclarar);

  async function bajar(que: Descarga) {
    setBajando(que);
    const supabase = createClient();
    const p = { p_mes: `${mes}-01` };
    try {
      if (que === "resumen") {
        const cr = csvResumenIgv(panel);
        descargarCsv(nombreArchivo("resumen-igv", mes), cr.encabezados, cr.filas);
        avisar.exito(`Resumen del IGV de ${textoMes(mes)}.`);
        setBajando(null);
        return;
      }
      // Por páginas: octubre ya pasa de 1.000 comprobantes y PostgREST corta ahí sin error (el archivo del contador salía incompleto).
      const ventas = que === "compras" ? null : await leerRpcPorPaginas(supabase, "fn_impuestos_registro_ventas", p, ORDEN_REGISTRO_VENTAS, { enParalelo: 1 });
      if (ventas?.error) throw new Error(ventas.error.message);
      const compras = que === "ventas" ? null : await leerRpcPorPaginas(supabase, "fn_impuestos_registro_compras", p, ORDEN_REGISTRO_COMPRAS, { enParalelo: 1 });
      if (compras?.error) throw new Error(compras.error.message);
      const filasV = (ventas?.data ?? []).map(leerFilaVentas);
      const filasC = (compras?.data ?? []).map(leerFilaCompras);
      const cv = csvRegistroVentas(filasV, mes);
      const cc = csvRegistroCompras(filasC, mes);

      if (que === "ventas") {
        descargarCsv(nombreArchivo("registro-ventas", mes), cv.encabezados, cv.filas);
        avisar.exito(`Registro de ventas de ${textoMes(mes)}: ${plural(filasV.length, "comprobante", "comprobantes")}.`);
      } else if (que === "compras") {
        descargarCsv(nombreArchivo("registro-compras", mes), cc.encabezados, cc.filas);
        avisar.exito(`Registro de compras de ${textoMes(mes)}: ${plural(filasC.length, "comprobante", "comprobantes")}.`);
      } else {
        const cr = csvResumenIgv(panel);
        const zip = crearZip([
          { nombre: nombreArchivo("registro-ventas", mes), contenido: textoCsv(cv.encabezados, cv.filas) },
          { nombre: nombreArchivo("registro-compras", mes), contenido: textoCsv(cc.encabezados, cc.filas) },
          { nombre: nombreArchivo("resumen-igv", mes), contenido: textoCsv(cr.encabezados, cr.filas) },
        ]);
        descargarBlob(`cayla-impuestos-${mes}.zip`, new Blob([zip as BlobPart], { type: "application/zip" }));
        avisar.exito(`Paquete de ${textoMes(mes)} para el contador: los dos registros y el resumen del IGV.`);
      }
    } catch (e) {
      avisar.error(`No se pudo armar el archivo: ${e instanceof Error ? e.message : "error desconocido"}`);
    }
    setBajando(null);
  }

  const pendientes = pendientesCompactos(panel);
  const cuenta = cuentaImpuestos(panel, { enCurso: mes === mesActual, pendientes: pendientes.length });
  const limite = limiteImpuestos(panel);
  const { barras, destacada } = barrasMeses(sobres);
  // El IGV de SUNAT es el real y queda entero; si parte de él es de ventas de CLAURE (la boleta sale con el RUC de CAYLA), se dice aparte (ADR-0560).
  const deClaure = lineaImpuestosClaure(claure);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sedeDeLaCabecera(sede, sedes)}
        titulo="Impuestos"
        acciones={
          // Un menú en vez de bajarlo todo: el paquete completo o un solo archivo (Felipe 2026-10-28).
          <span data-guia="fin-impuestos.paquete">
            <MenuAcciones
              texto="Descargar"
              etiqueta="Descargar para el contador"
              deshabilitado={bajando !== null}
              items={[
                { clave: "paquete", etiqueta: "Todo el paquete (ZIP)", onSelect: () => bajar("paquete") },
                { clave: "ventas", etiqueta: "Registro de ventas", onSelect: () => bajar("ventas") },
                { clave: "compras", etiqueta: "Registro de compras", onSelect: () => bajar("compras") },
                { clave: "resumen", etiqueta: "Resumen del IGV", onSelect: () => bajar("resumen") },
              ]}
            />
          </span>
        }
      />
      <DockTelar
        acciones={[
          { texto: "Paquete del contador", tecla: "d", icono: <Download aria-hidden />, principal: true, onClick: () => bajar("paquete") }, // unificar-fijo: el ícono del dock del telar (DockTelar pide uno por acción), no un botón de descarga dibujado a mano
          { texto: "Registro de ventas", tecla: "v", icono: <FileText aria-hidden />, onClick: () => bajar("ventas") },
          { texto: "Registro de compras", tecla: "c", icono: <FileText aria-hidden />, onClick: () => bajar("compras") },
          { texto: "Factura de compra", tecla: "f", icono: <Receipt aria-hidden />, href: "/finanzas/gastos?registrar=1" },
        ]}
      />

      {/* El mes en curso todavía corre: lo urgente es el que se declara ahora, a un toque (la vuelta, hallazgo 9 de la auditoría v3). */}
      {mes !== aDeclarar && sobreADeclarar && (
        <Aviso
          tono={sobreADeclarar.estado === "por_declarar" ? "atencion" : "info"}
          chico
          titulo={`${textoMes(aDeclarar).charAt(0).toUpperCase()}${textoMes(aDeclarar).slice(1)} se declara ahora`}
          accion={
            <button type="button" className="btn-cayla btn-enlace" onClick={() => irA(aDeclarar)} data-guia="fin-impuestos.ir-a-declarar">
              Ver {nombreMes(aDeclarar)}
            </button>
          }
        >
          {sobreADeclarar.aFavor ? `Quedó ${solesRedondo(sobreADeclarar.monto)} de IGV a favor.` : `Su IGV es ${solesRedondo(sobreADeclarar.monto)}, más la renta.`}
        </Aviso>
      )}

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}

      <section className="fin-imp-arriba">
        <PagasImpuestos cuenta={cuenta} guia="fin-impuestos.pagas" />
        <CuentaLineas cuenta={cuenta} guia="fin-impuestos.cuenta" />
      </section>

      {deClaure && (
        <Aviso
          tono="info"
          chico
          titulo={deClaure.titulo}
          guia="fin-impuestos.claure"
          accion={
            <Link href="/finanzas/dinero/claure" className="btn-cayla btn-enlace">
              Ver la cuenta con CLAURE
            </Link>
          }
        >
          {deClaure.texto}
        </Aviso>
      )}

      <section className="fin-imp-fila">
        <PendientesImpuestos pendientes={pendientes} guia="fin-impuestos.por-hacer" />
        <LimiteAnio limite={limite} panel={panel} guia="fin-impuestos.limite" />
        <MesesImpuestos barras={barras} destacada={destacada} onElegir={irA} guia="fin-impuestos.historial" />
      </section>
    </div>
  );
}
