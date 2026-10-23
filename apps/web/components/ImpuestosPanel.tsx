"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { leerRpcPorPaginas } from "@/lib/rpc-por-paginas";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { CabeceraBloque, SelectFin, Superficie } from "@/components/finanzas/kit";
import { ImpuestosPulso } from "@/components/finanzas/ImpuestosPulso";
import { BalanzaIgv } from "@/components/finanzas/BalanzaIgv";
import { AntesDeDeclarar } from "@/components/finanzas/AntesDeDeclarar";
import { SobresIgv } from "@/components/finanzas/SobresIgv";
import { Volver } from "@/components/ui/Volver";
import { mesADeclarar, sobresIgv } from "@/lib/impuestos-sobres-reglas";
import { antesDeDeclarar } from "@/lib/impuestos-antes-reglas";
import { balanzaIgv } from "@/lib/impuestos-balanza-reglas";
import { pulsoImpuestos } from "@/lib/impuestos-pulso-reglas";
import { descargarBlob, descargarCsv, textoCsv } from "@/lib/exportar-csv";
import { crearZip } from "@/lib/zip-simple";
import { mesesRecientes, solesRedondo, textoMes } from "@/lib/gastos-reglas";
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
import { Settings2 } from "lucide-react";
import { Boton } from "@/components/ui/campos";

// Finanzas ▸ Impuestos (ADR-0195 F8), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/, `vista-impuestos.js`):
// cabecera con «CAYLA entera» y las descargas → cuatro cifras → el límite del régimen y lo que conviene revisar → los
// últimos 6 meses. Es de CAYLA entera («Ver» fijo): la ve quien tiene el módulo (ADR-0253). La pantalla solo lee: el IGV, el saldo a favor y el
// límite los calcula la base; los registros se arman aquí, en el navegador, con lo que devuelve la base.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type Descarga = "ventas" | "compras" | "paquete";

export function ImpuestosPanel({ panel, falla }: { panel: PanelImpuestos | null; falla: string | null }) {
  if (!panel) {
    return (
      <div className="space-y-6">
        <CabeceraPantalla sobretitulo="Finanzas · Impuestos" titulo="Impuestos" />
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla ?? "No se pudo leer el IGV."}</p>
      </div>
    );
  }
  return <Pantalla panel={panel} falla={falla} />;
}

function Pantalla({ panel, falla }: { panel: PanelImpuestos; falla: string | null }) {
  const router = useRouter();
  const [bajando, setBajando] = useState<Descarga | null>(null);
  const { mes, mesActual } = panel;
  const anio = Number(mes.slice(0, 4));
  const titulo = `IGV de ${nombreMes(mes)}${anio !== Number(mesActual.slice(0, 4)) ? ` ${anio}` : ""}`;
  // Cambiar de mes sube a la balanza: la respuesta cambia arriba y tiene que verse (antes quedaba fuera de la vista).
  const irA = (m: string) => router.push(`/finanzas/impuestos?mes=${m}`);
  const otroMes = mes !== mesADeclarar(mesActual);

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

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Finanzas · Impuestos"
        titulo={titulo}
        accionesAbajo
        bajada="Lo que cobraste de IGV al vender, menos lo que pagaste de IGV al comprar con factura. Los libros electrónicos los presenta el contador con el reporte de aquí."
        acciones={
          <>
            <Chip versalitas={false}>CAYLA entera</Chip>
            <Boton cargando={bajando === "ventas"} textoCargando="Armando…" type="button" disabled={bajando !== null} onClick={() => bajar("ventas")} data-guia="fin-impuestos.registro-ventas">
              Registro de ventas
            </Boton>
            <Boton cargando={bajando === "compras"} textoCargando="Armando…" type="button" disabled={bajando !== null} onClick={() => bajar("compras")} data-guia="fin-impuestos.registro-compras">
              Registro de compras
            </Boton>
            <Boton peso="primario" cargando={bajando === "paquete"} textoCargando="Armando…" type="button" disabled={bajando !== null} onClick={() => bajar("paquete")} data-guia="fin-impuestos.paquete">
              Paquete para el contador
            </Boton>
          </>
        }
      >
        {/* La vuelta de una vista interna: mirar otro mes es salir del que se declara ahora (hallazgo 9 de la auditoría v3). */}
        {otroMes && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-taupe">
            <Volver onClick={() => irA(mesADeclarar(mesActual))} a={`Volver a ${textoMes(mesADeclarar(mesActual))}, el mes que se declara`} />
            Estás viendo {textoMes(mes)}. El que se declara ahora es {textoMes(mesADeclarar(mesActual))}.
          </p>
        )}
      </CabeceraPantalla>

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}

      {/* El telar (Felipe 2026-10-23): la balanza del IGV y, al lado, lo que falta antes de declarar. */}
      {panel.foco && pulso.estado !== "sin_mes" ? (
        <section className="fin-balanza-cols">
          <BalanzaIgv balanza={balanzaIgv(panel.foco, panel.renta.monto)} mesTexto={textoMes(mes)} guia="fin-impuestos.balanza" anioSinRenta={panel.renta.tasa === null ? anio : null} />
          <AntesDeDeclarar pendientes={antesDeDeclarar(panel)} guia="fin-impuestos.por-hacer" />
        </section>
      ) : (
        <ImpuestosPulso pulso={pulso} />
      )}

      <Limite panel={panel} />

      <SobresIgv sobres={sobresIgv(panel.historial, mesActual, mes)} onElegir={irA} mesEnCurso={mesActual} aDeclarar={mesADeclarar(mesActual)} guia="fin-impuestos.historial">
        {/* Para un mes más viejo que los seis sobres (hasta que la mesa de mando del telar traiga el mes). */}
        <label className="flex items-center gap-2 whitespace-nowrap text-[12.5px] text-taupe" data-guia="fin-impuestos.otro-mes">
          Otro mes
          <SelectFin
            etiqueta="Mes que se mira"
            className="w-fit"
            valor={mes}
            onValor={irA}
            opciones={mesesRecientes(`${mesActual}-01`, 24).map((m) => ({ valor: m, texto: textoMes(m) }))}
          />
        </label>
      </SobresIgv>

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
