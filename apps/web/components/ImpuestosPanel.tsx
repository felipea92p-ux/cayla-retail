"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { CabeceraBloque, Herramientas, SelectFin, Superficie } from "@/components/finanzas/kit";
import { ImpuestosPulso } from "@/components/finanzas/ImpuestosPulso";
import { pulsoImpuestos } from "@/lib/impuestos-pulso-reglas";
import { descargarBlob, descargarCsv, textoCsv } from "@/lib/exportar-csv";
import { crearZip } from "@/lib/zip-simple";
import { mesesRecientes, solesRedondo, textoMes } from "@/lib/gastos-reglas";
import {
  TEXTO_ESTADO_MES,
  avisoUmbral,
  csvRegistroCompras,
  csvRegistroVentas,
  csvResumenIgv,
  estadoMes,
  leerFilaCompras,
  leerFilaVentas,
  mesCorto,
  nombreArchivo,
  nombreMes,
  porcentaje,
  proyectarUmbral,
  sumarMeses,
  tonoAvance,
  type MesIgv,
  type PanelImpuestos,
} from "@/lib/impuestos-reglas";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { Settings2 } from "lucide-react";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Boton } from "@/components/ui/campos";

// Finanzas ▸ Impuestos (ADR-0195 F8), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/, `vista-impuestos.js`):
// cabecera con «CAYLA entera» y las descargas → cuatro cifras → el límite del régimen y lo que conviene revisar → los
// últimos 6 meses. Es de CAYLA entera («Ver» fijo): la ve quien tiene el módulo (ADR-0253). La pantalla solo lee: el IGV, el saldo a favor y el
// límite los calcula la base; los registros se arman aquí, en el navegador, con lo que devuelve la base.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
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
  const { mes, mesActual, foco, parametros } = panel;
  const anio = Number(mes.slice(0, 4));
  const titulo = `IGV de ${nombreMes(mes)}${anio !== Number(mesActual.slice(0, 4)) ? ` ${anio}` : ""}`;
  const irA = (m: string) => router.push(`/finanzas/impuestos?mes=${m}`, { scroll: false });

  async function bajar(que: Descarga) {
    setBajando(que);
    const supabase = createClient();
    const p = { p_mes: `${mes}-01` } as never;
    try {
      const ventas = que === "compras" ? null : await supabase.rpc("fn_impuestos_registro_ventas" as never, p);
      if (ventas?.error) throw new Error(ventas.error.message);
      const compras = que === "ventas" ? null : await supabase.rpc("fn_impuestos_registro_compras" as never, p);
      if (compras?.error) throw new Error(compras.error.message);
      const filasV = ((ventas?.data ?? []) as Record<string, unknown>[]).map(leerFilaVentas);
      const filasC = ((compras?.data ?? []) as Record<string, unknown>[]).map(leerFilaCompras);
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

  const siguiente = nombreMes(sumarMeses(mes, 1));
  const aFavor = !!foco && foco.aPagar === 0 && foco.saldoAFavor > 0;
  const tasaIgv = parametros.igv ? Math.round(parametros.igv.valor * 100) : 18;

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
      />

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}

      {/* Camino A (Felipe 2026-10-15): primero la respuesta, después las cifras. */}
      <ImpuestosPulso pulso={pulsoImpuestos(panel)} />

      <section className="fin-cifras" data-guia="fin-impuestos.cifras">
        <TarjetaCifra etiqueta="IGV cobrado al vender" valor={foco ? solesRedondo(foco.debito) : null} {...entra(1)}>
          {foco
            ? `${tasaIgv} % de las ventas del mes, de ${plural(foco.comprobantes, "comprobante emitido", "comprobantes emitidos")}${foco.igvNotasCredito > 0 ? `. Ya resta ${solesRedondo(foco.igvNotasCredito)} de notas de crédito` : ""}`
            : "Sin datos"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="IGV que descuentas" valor={foco ? solesRedondo(foco.credito) : null} {...entra(2)}>
          {`Facturas de mercadería, gastos, activos e insumos${foco && foco.creditoNotas > 0 ? `, menos ${solesRedondo(foco.creditoNotas)} de notas de crédito` : ""}${
            panel.revisar.igvPerdido.igv > 0 ? `, menos ${solesRedondo(panel.revisar.igvPerdido.igv)} que se pierde por pagar sin banco` : ""
          }`}
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta={aFavor ? `Saldo a favor para ${siguiente}` : `IGV a pagar en ${siguiente}`}
          tono={aFavor ? "text-verde" : undefined}
          valor={foco ? solesRedondo(aFavor ? foco.saldoAFavor : foco.aPagar) : null}
          {...entra(3)}
        >
          {aFavor
            ? "Descontaste más IGV del que cobraste: se descuenta el mes siguiente"
            : `Vence según el último dígito de tu RUC${foco && foco.saldoAnterior > 0 ? `. Ya descuenta ${solesRedondo(foco.saldoAnterior)} a favor del mes anterior` : ""}`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Pago a cuenta de renta" valor={panel.renta.monto !== null ? solesRedondo(panel.renta.monto) : null} {...entra(4)}>
          {panel.renta.tasa !== null ? (
            <>
              {porcentaje(panel.renta.tasa, panel.renta.tasa * 100 % 1 === 0 ? 0 : 1)} de la venta neta.{" "}
              {(parametros.renta?.provisional || parametros.regimen?.provisional) && <b className="font-semibold text-tinta">Confirmar régimen con el contador</b>}
            </>
          ) : (
            <>
              Falta la tasa del régimen para {anio}.{" "}
              <Link href="/configuracion?tab=impuestos" className="btn-enlace">
                Configurarla
              </Link>
            </>
          )}
        </TarjetaCifra>
      </section>

      <section className="fin-dos-col fin-dos-col-izq">
        <Limite panel={panel} />
        <ParaRevisar panel={panel} />
      </section>

      <Superficie className="anim-sube" guia="fin-impuestos.historial">
        <Herramientas>
          <b className="text-sm font-semibold text-tinta">Últimos 6 meses</b>
          <span className="text-[12.5px] text-taupe">{mesCorto(mesActual)} (*) va a la fecha y todavía puede cambiar. Toca un mes para verlo.</span>
          <label className="ml-auto flex items-center gap-2 whitespace-nowrap text-[12.5px] text-taupe" data-guia="fin-impuestos.otro-mes">
            Otro mes
            <SelectFin
              etiqueta="Mes que se mira"
              className="w-fit"
              valor={mes}
              onValor={irA}
              opciones={mesesRecientes(`${mesActual}-01`, 24).map((m) => ({ valor: m, texto: textoMes(m) }))}
            />
          </label>
        </Herramientas>
        <div className="fin-tabla-wrap">
          <table className="fin-tabla" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Mes</th>
                <th className="fin-num">IGV cobrado</th>
                <th className="fin-num">IGV descontado</th>
                <th className="fin-num">A pagar</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {panel.historial.map((m) => (
                <FilaMes key={m.mes} m={m} mesActual={mesActual} activa={m.mes === mes} onAbrir={() => irA(m.mes)} />
              ))}
            </tbody>
          </table>
        </div>
      </Superficie>

      <p className="nota-cayla" data-guia="fin-impuestos.nota">
        El pago a SUNAT se registra en Cuentas y dinero («Pagar a SUNAT (el IGV)», sale de un banco): baja lo que debes de IGV y el banco. El 1 % de renta a cuenta va como gasto de «Tributos». Mientras no se registre, «sin pago registrado» solo dice que el sistema no lo sabe.{" "}
        <Link href="/finanzas/dinero" className="btn-cayla btn-enlace">
          Registrar el pago
        </Link>
      </p>
    </div>
  );
}

/** «2026-10» → «2026-09»: el mes que se declara ahora (la pantalla abre en él). */
function mesAnteriorA(mes: string): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

function FilaMes({ m, mesActual, activa, onAbrir }: { m: MesIgv; mesActual: string; activa: boolean; onAbrir: () => void }) {
  const e = TEXTO_ESTADO_MES[estadoMes(m, mesActual)];
  return (
    <tr
      data-clic
      tabIndex={0}
      aria-current={activa ? "true" : undefined}
      className={activa ? "fin-fila-activa" : undefined}
      // Guía interactiva (ADR-0389): el mes en curso y el que se declara ahora, para pasar de uno al otro y volver.
      data-guia={m.mes === mesActual ? "fin-impuestos.mes-en-curso" : m.mes === mesAnteriorA(mesActual) ? "fin-impuestos.mes-a-declarar" : undefined}
      onClick={onAbrir}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onAbrir();
        }
      }}
    >
      <td data-l="Mes">
        {mesCorto(m.mes)}
        {m.mes === mesActual ? "*" : ""}
        {m.mes.slice(0, 4) !== mesActual.slice(0, 4) ? ` ${m.mes.slice(0, 4)}` : ""}
      </td>
      <td className="fin-num" data-l="Cobrado">
        {solesRedondo(m.debito)}
      </td>
      <td className="fin-num" data-l="Descontado">
        {solesRedondo(m.credito)}
      </td>
      <td className="fin-num" data-l="A pagar">
        <b>{solesRedondo(m.aPagar)}</b>
        {m.aPagar === 0 && m.saldoAFavor > 0 && <span className="fin-sub">a favor {solesRedondo(m.saldoAFavor)}</span>}
      </td>
      <td data-l="Estado">
        <Chip tono={e.tono}>{e.texto}</Chip>
      </td>
    </tr>
  );
}

/** El límite del régimen: lo vendido en 12 meses contra el umbral, y lo proyectado a diciembre. */
function Limite({ panel }: { panel: PanelImpuestos }) {
  const { umbral, parametros, hoy } = panel;
  const uit = parametros.uit;
  const n = parametros.umbralUit?.valor ?? null;
  const titulo = n !== null ? `El límite de ${n.toLocaleString("es-PE")} UIT` : "El límite de ventas";
  if (umbral.umbralSoles === null || !uit) {
    return (
      <Superficie pad className="anim-sube" guia="fin-impuestos.limite">
        <CabeceraBloque titulo={titulo} bajada="Al cruzarlo, SUNAT te exige llevar el Libro Diario y el Mayor electrónicos." />
        <Vacio tamano="chico" icono={<Settings2 />} accion={{ texto: "Configúralos en Configuración ▸ Impuestos", href: "/configuracion?tab=impuestos" }}>
          Falta el valor de la UIT o el límite del régimen.
        </Vacio>
      </Superficie>
    );
  }
  const avance = umbral.avance ?? 0;
  const p = proyectarUmbral(umbral.ventasMeses, hoy, umbral.umbralSoles, umbral.primerMes);
  const proyectado = Math.min(1, p.proyectadoDiciembre / umbral.umbralSoles);
  const tono = tonoAvance(umbral.avance);
  const provisional = uit.provisional || parametros.umbralUit?.provisional;
  // El aviso anticipado (parámetro `aviso_umbral_uit`): mide el AÑO calendario, no los 12 meses de la barra de arriba.
  const aviso = avisoUmbral(panel);
  return (
    <Superficie pad className="anim-sube" guia="fin-impuestos.limite">
      <CabeceraBloque titulo={titulo} bajada="Al cruzarlo, SUNAT te exige llevar el Libro Diario y el Mayor electrónicos.">
        <Chip tono={tono}>{porcentaje(avance)}</Chip>
      </CabeceraBloque>
      <div className="fin-umbral-barra" data-tono={tono} role="img" aria-label={`${porcentaje(avance)} del límite; a diciembre, ${porcentaje(proyectado)}`}>
        <i className="fin-proy" style={{ width: `${Math.max(proyectado, Math.min(1, avance)) * 100}%` }} />
        <i style={{ width: `${Math.min(1, avance) * 100}%` }} />
      </div>
      <div className="fin-marcas">
        <span>S/&nbsp;0</span>
        <span>
          Vendido en 12 meses: <b>{solesRedondo(umbral.ventas12m)}</b>
        </span>
        <span>{solesRedondo(umbral.umbralSoles)}</span>
      </div>
      <p className="nota-cayla mt-3">
        {p.proyectadoDiciembre > umbral.ventas12m
          ? `La franja rayada es lo proyectado a diciembre (${solesRedondo(p.proyectadoDiciembre)}).`
          : `A diciembre, a este ritmo, los 12 meses quedan en ${solesRedondo(p.proyectadoDiciembre)}.`}{" "}
        {p.yaCruzado ? (
          <b>Ya lo cruzaste: habla con el contador sobre los libros y el pago a cuenta.</b>
        ) : p.mesCruce ? (
          <>
            A este ritmo lo cruzas en <b>{textoMes(p.mesCruce)}</b>.
          </>
        ) : (
          "A este ritmo no lo cruzas en los próximos dos años."
        )}{" "}
        {p.mesesConDatos > 0 && p.mesesConDatos < 12 && `El sistema tiene ventas desde ${textoMes(umbral.primerMes!)}: los 12 meses todavía cuentan menos de lo real. `}
        Sin IGV, de los comprobantes emitidos. UIT {uit.anio} = {solesRedondo(uit.valor)}
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
      {aviso.ventasAnio !== null && aviso.nivel !== "sin_datos" && (
        <p className="fin-tenue mt-3 text-[13px]">
          Ventas de {umbral.anio}, sin IGV: <b>{solesRedondo(aviso.ventasAnio)}</b>
          {aviso.ventasPrevias > 0 ? ` (${solesRedondo(aviso.ventasSistema)} en el sistema y ${solesRedondo(aviso.ventasPrevias)} de antes de que empezara).` : " en el sistema."}
        </p>
      )}
      {aviso.quedaCorto && <p className="nota-cayla mt-3">{aviso.quedaCorto}</p>}
    </Superficie>
  );
}

type Punto = { tono: "ambar" | "pizarra" | "rojo" | "verde"; titulo: string; detalle: string; accion?: { texto: string; href: string } };

/** Lo que puede hacer que se pague de más (o que falte IGV en el cálculo), del mes que se mira. */
function ParaRevisar({ panel }: { panel: PanelImpuestos }) {
  const { revisar: r, mes } = panel;
  const nombre = nombreMes(mes);
  const puntos: Punto[] = [];
  if (r.boletas.n > 0) {
    puntos.push({
      tono: "ambar",
      titulo: `${plural(r.boletas.n, "compra", "compras")} con boleta este mes`,
      detalle: `Una boleta no da IGV descontable. Si el proveedor emite factura, pídela${r.boletas.proveedores.length ? `: ${r.boletas.proveedores.join(", ")}` : ""}.`,
      accion: r.boletas.gastos > 0 ? { texto: "Ver gastos", href: `/finanzas/gastos?mes=${mes}&ver=todas` } : undefined,
    });
  }
  // ADR-0362, fase 6 · actividad 8 (decisión 72): el IGV que se perdió en el mes del pago. La base ya lo restó; aquí se dice y se dice qué hacer.
  if (r.igvPerdido.igv > 0) {
    puntos.push({
      tono: "ambar",
      titulo: `${solesRedondo(r.igvPerdido.igv)} de IGV que no se descuenta`,
      detalle: `${plural(r.igvPerdido.n, "pago", "pagos")} en efectivo o desde un fondo de facturas de S/\u00a02,000 o más. SUNAT pide pagarlas por el banco: ese IGV ya está restado de lo que descuentas.`,
    });
  }
  if (r.rechazados.n > 0) {
    puntos.push({
      tono: "rojo",
      titulo: `${plural(r.rechazados.n, "comprobante rechazado", "comprobantes rechazados")} por SUNAT`,
      detalle: `Suman ${solesRedondo(r.rechazados.total)} y no entran al IGV hasta que se vuelvan a emitir.`,
      accion: { texto: "Ver en Facturación", href: "/vender/comprobantes" },
    });
  }
  if (r.sinAceptar.n > 0) {
    puntos.push({
      tono: "pizarra",
      titulo: `${plural(r.sinAceptar.n, "venta", "ventas")} de ${nombre} sin comprobante aceptado`,
      detalle: "El IGV se reconoce al vender, pero SUNAT debe tenerlos. Siguen reintentándose solos.",
      accion: { texto: "Ver en Facturación", href: "/vender/comprobantes" },
    });
  }
  if (r.sinComprobante.n > 0) {
    puntos.push({
      tono: "ambar",
      titulo: `${plural(r.sinComprobante.n, "venta", "ventas")} sin boleta ni factura (${solesRedondo(r.sinComprobante.total)})`,
      detalle: `Notas de venta o ventas sin comprobante${r.sinComprobante.alegra ? `; ${r.sinComprobante.alegra} las emitió Alegra` : ""}. Su IGV no está en este cálculo: díselo al contador.`,
    });
  }
  puntos.push({
    tono: "pizarra",
    titulo: "Recibos por honorarios: retención del 8 %",
    detalle: `${r.honorarios.n > 0 ? `${plural(r.honorarios.n, "recibo", "recibos")} este mes${r.honorarios.mayores ? `, ${r.honorarios.mayores} de más de S/\u00a01,500` : ""}. ` : ""}El contador define si CAYLA debe retener. Mientras tanto, se paga el total.`,
  });
  return (
    <Superficie pad className="anim-sube" guia="fin-impuestos.revisar">
      <CabeceraBloque titulo="Para revisar antes de declarar" bajada="Lo que puede hacer que pagues de más." />
      <ul className="fin-decidir">
        {puntos.map((p) => (
          <li key={p.titulo}>
            <span className="fin-punto" data-tono={p.tono} aria-hidden />
            <div>
              <b>{p.titulo}</b>
              <p>{p.detalle}</p>
            </div>
            {p.accion ? (
              <BotonVer href={p.accion.href} chico>
                {p.accion.texto}
              </BotonVer>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
    </Superficie>
  );
}
