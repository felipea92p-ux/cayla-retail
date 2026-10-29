"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { leerRpcPorPaginas } from "@/lib/rpc-por-paginas";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { RespuestaTelar } from "@/components/finanzas/telar/RespuestaTelar";
import { DockTelar } from "@/components/finanzas/telar/DockTelar";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { ImpuestosPulso } from "@/components/finanzas/ImpuestosPulso";
import { BalanzaIgv } from "@/components/finanzas/BalanzaIgv";
import { AntesDeDeclarar } from "@/components/finanzas/AntesDeDeclarar";
import { SobresIgv } from "@/components/finanzas/SobresIgv";
import { mesADeclarar, sobresIgv } from "@/lib/impuestos-sobres-reglas";
import { antesDeDeclarar } from "@/lib/impuestos-antes-reglas";
import { balanzaIgv } from "@/lib/impuestos-balanza-reglas";
import { pulsoImpuestos } from "@/lib/impuestos-pulso-reglas";
import { respuestaImpuestos, sedeDeLaCabecera } from "@/lib/impuestos-telar-reglas";
import { lineaImpuestosClaure, type VentasClaure } from "@/lib/cuenta-claure-reglas";
import { SEDE_TODAS, hrefTelar, type ClaveSede, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { descargarBlob, descargarCsv, textoCsv } from "@/lib/exportar-csv";
import { crearZip } from "@/lib/zip-simple";
import { solesRedondo, textoMes } from "@/lib/gastos-reglas";
import {
  ALCANCE_DEL_AVISO,
  ORDEN_REGISTRO_COMPRAS,
  ORDEN_REGISTRO_VENTAS,
  avisoUmbral,
  csvRegistroCompras,
  csvRegistroVentas,
  csvResumenIgv,
  leerFilaCompras,
  leerFilaVentas,
  nombreArchivo,
  nombreMes,
  porcentaje,
  proyectarUmbral,
  tonoAvance,
  type PanelImpuestos,
} from "@/lib/impuestos-reglas";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { Download, FileText, Receipt, Settings2 } from "lucide-react";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { MenuAcciones } from "@/components/ui/MenuAcciones";

// Finanzas ▸ Impuestos (ADR-0195 F8) en «El telar» (ADR-0493, Felipe 2026-10-23): la cabecera con la respuesta y el dock de la barra
// común → la balanza del IGV y «Antes de declarar» → el límite del régimen → un sobre por mes. Es de CAYLA entera («Ver» fijo): la ve quien tiene el módulo (ADR-0253). La pantalla solo lee: el IGV, el saldo a favor y el
// límite los calcula la base; los registros se arman aquí, en el navegador, con lo que devuelve la base.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type Descarga = "ventas" | "compras" | "paquete";

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
  const anio = Number(mes.slice(0, 4));
  // Cambiar de mes sube a la balanza (la respuesta cambia arriba y tiene que verse) y conserva la sede de la mesa de mando.
  const irA = (m: string) => router.push(hrefTelar("/finanzas/impuestos", sp.entries(), { mes: m }, { mismaPantalla: true, mesDeHoy: mesActual }));
  const aDeclarar = mesADeclarar(mesActual);
  const sobres = sobresIgv(panel.historial, mesActual, mes);
  const sobreADeclarar = sobres.find((x) => x.mes === aDeclarar);

  async function bajar(que: Descarga) {
    setBajando(que);
    const supabase = createClient();
    const p = { p_mes: `${mes}-01` };
    try {
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

  const pulso = pulsoImpuestos(panel);
  const pendientes = antesDeDeclarar(panel);
  // El IGV de SUNAT es el real y queda entero; si parte de él es de ventas de CLAURE (la boleta sale con el RUC de CAYLA), se dice aparte (ADR-0560).
  const deClaure = lineaImpuestosClaure(claure);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sedeDeLaCabecera(sede, sedes)}
        titulo="Impuestos"
        subtitulo="Lo que cobraste de IGV al vender, menos lo que pagaste de IGV al comprar con factura. El contador presenta los libros con lo que sale de aquí."
        acciones={
          <>
            {/* Los dos registros van en «Más»: en la cabecera manda la respuesta (a la derecha) y el paso es el paquete. */}
            <span data-guia="fin-impuestos.registros">
              <MenuAcciones
                texto="Más"
                etiqueta="Más descargas para el contador"
                deshabilitado={bajando !== null}
                items={[
                  { clave: "ventas", etiqueta: "Descargar registro de ventas", onSelect: () => bajar("ventas") },
                  { clave: "compras", etiqueta: "Descargar registro de compras", onSelect: () => bajar("compras") },
                ]}
              />
            </span>
            <BotonDescargar peso="primario" cargando={bajando === "paquete"} disabled={bajando !== null} onClick={() => bajar("paquete")} guia="fin-impuestos.paquete">
              Descargar paquete del contador
            </BotonDescargar>
          </>
        }
      >
        <RespuestaTelar {...respuestaImpuestos(pulso, { enCurso: mes === mesActual, pendientes: pendientes.length })} />
      </EncabezadoPagina>
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
          {sobreADeclarar.aFavor ? `Quedó ${solesRedondo(sobreADeclarar.monto)} de IGV a favor.` : `Su IGV es ${solesRedondo(sobreADeclarar.monto)}, más la renta a cuenta.`} El día exacto depende del último dígito de tu RUC.
        </Aviso>
      )}

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}

      {/* El telar (Felipe 2026-10-23): la balanza del IGV y, al lado, lo que falta antes de declarar. */}
      {panel.foco && pulso.estado !== "sin_mes" ? (
        <section className="fin-balanza-cols">
          <BalanzaIgv balanza={balanzaIgv(panel.foco, panel.renta.monto, { sede: sede === SEDE_TODAS ? null : sede })} mesTexto={textoMes(mes)} guia="fin-impuestos.balanza" anioSinRenta={panel.renta.tasa === null ? anio : null} />
          <AntesDeDeclarar pendientes={pendientes} guia="fin-impuestos.por-hacer" />
        </section>
      ) : (
        <ImpuestosPulso pulso={pulso} />
      )}

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

      <Limite panel={panel} />

      <SobresIgv sobres={sobres} onElegir={irA} mesEnCurso={mesActual} aDeclarar={aDeclarar} guia="fin-impuestos.historial" />

      <p className="nota-cayla" data-guia="fin-impuestos.nota">
        El pago a SUNAT se registra en Cuentas y dinero («Pagar a SUNAT (el IGV)», sale de un banco): baja lo que debes de IGV y el banco. El 1 % de renta a cuenta va como gasto de «Tributos». Mientras no se registre, «sin pago registrado» solo dice que el sistema no lo sabe.{" "}
        <Link href="/finanzas/dinero" className="btn-cayla btn-enlace">
          Registrar el pago
        </Link>
      </p>
    </div>
  );
}

/** El límite del régimen: lo vendido en el año calendario contra el umbral, y lo proyectado a diciembre. Es la misma cifra del aviso anticipado. */
function Limite({ panel }: { panel: PanelImpuestos }) {
  const { umbral, parametros, hoy } = panel;
  const uit = parametros.uit;
  const n = parametros.umbralUit?.valor ?? null;
  const titulo = n !== null ? `El límite de ${n.toLocaleString("es-PE")} UIT` : "El límite de ventas";
  const bajada = "Al cruzarlo, SUNAT te exige llevar el Libro Diario y el Mayor electrónicos.";
  if (umbral.umbralSoles === null || !uit) {
    return (
      <Superficie pad className="anim-sube" guia="fin-impuestos.limite">
        <CabeceraBloque titulo={titulo} bajada={bajada} />
        <Vacio tamano="chico" icono={<Settings2 />} accion={{ texto: "Configúralos en Configuración ▸ Impuestos", href: "/configuracion?tab=impuestos" }}>
          Falta el valor de la UIT o el límite del régimen.
        </Vacio>
      </Superficie>
    );
  }
  // Una base más vieja que esta pantalla todavía mide 12 meses móviles: no se mezcla esa cifra con el año.
  if (umbral.ventasAnio === null) {
    return (
      <Superficie pad className="anim-sube" guia="fin-impuestos.limite">
        <CabeceraBloque titulo={titulo} bajada={bajada} />
        <Vacio tamano="chico" icono={<Settings2 />}>
          Esta cifra aparece cuando la base de datos esté al día.
        </Vacio>
      </Superficie>
    );
  }
  const vendido = umbral.ventasAnio;
  const avance = umbral.avance ?? 0;
  const p = proyectarUmbral(umbral.ventasMeses, hoy, umbral.umbralSoles, umbral.primerMes, umbral.ajuste);
  const proyectado = Math.min(1, p.proyectadoDiciembre / umbral.umbralSoles);
  const tono = tonoAvance(umbral.avance);
  const provisional = uit.provisional || parametros.umbralUit?.provisional;
  // El aviso anticipado (parámetro `aviso_umbral_uit`): mide el mismo año calendario de la barra de arriba.
  const aviso = avisoUmbral(panel);
  return (
    <Superficie pad className="anim-sube" guia="fin-impuestos.limite">
      <CabeceraBloque titulo={titulo} bajada={bajada}>
        <Chip tono={tono}>{porcentaje(avance)}</Chip>
      </CabeceraBloque>
      <div className="fin-umbral-barra" data-tono={tono} role="img" aria-label={`${porcentaje(avance)} del límite; a diciembre, ${porcentaje(proyectado)}`}>
        <i className="fin-proy" style={{ width: `${Math.max(proyectado, Math.min(1, avance)) * 100}%` }} />
        <i style={{ width: `${Math.min(1, avance) * 100}%` }} />
      </div>
      <div className="fin-marcas">
        <span>S/&nbsp;0</span>
        <span>
          Vendido en {umbral.anio ?? "el año"}: <b>{solesRedondo(vendido)}</b>
        </span>
        <span>{solesRedondo(umbral.umbralSoles)}</span>
      </div>
      <p className="nota-cayla mt-3">
        {p.proyectadoDiciembre > vendido
          ? `La franja rayada es lo proyectado a diciembre (${solesRedondo(p.proyectadoDiciembre)}).`
          : `A diciembre, a este ritmo, el año queda en ${solesRedondo(p.proyectadoDiciembre)}.`}{" "}
        {p.yaCruzado ? (
          <b>Ya lo cruzaste: habla con el contador sobre los libros y el pago a cuenta.</b>
        ) : p.mesCruce ? (
          <>
            A este ritmo lo cruzas en <b>{textoMes(p.mesCruce)}</b>.
          </>
        ) : (
          "A este ritmo no lo cruzas este año."
        )}{" "}
        Sin IGV, de los comprobantes emitidos de enero a hoy. UIT {uit.anio} = {solesRedondo(uit.valor)}
        {provisional && (
          <>
            {" · "}
            <b>por confirmar con el contador</b>
          </>
        )}
        .
      </p>
      {aviso.titulo && (aviso.nivel === "aviso" || aviso.nivel === "cruzado") && (
        <Aviso tono={aviso.nivel === "cruzado" ? "error" : "atencion"} titulo={aviso.titulo} className="mt-3">
          {aviso.detalle}
        </Aviso>
      )}
      <p className="fin-tenue mt-3 text-[13px]">
        {ALCANCE_DEL_AVISO}
        {aviso.ajuste > 0 && ` Incluye ${solesRedondo(aviso.ajuste)} de ajuste cargado en Configuración (${solesRedondo(aviso.ventasSistema)} en el sistema).`}
      </p>
    </Superficie>
  );
}
