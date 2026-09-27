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
import { descargarBlob, descargarCsv, textoCsv } from "@/lib/exportar-csv";
import { crearZip } from "@/lib/zip-simple";
import { mesesRecientes, solesRedondo, textoMes } from "@/lib/gastos-reglas";
import {
  TEXTO_ESTADO_MES,
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

// Finanzas ▸ Impuestos (ADR-0195 F8), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/, `vista-impuestos.js`):
// cabecera con «CAYLA entera» y las descargas → cuatro cifras → el límite del régimen y lo que conviene revisar → los
// últimos 6 meses. Es de CAYLA entera («Ver» fijo) y solo del líder. La pantalla solo lee: el IGV, el saldo a favor y el
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
            <button type="button" className="btn-cayla btn-secundario" disabled={bajando !== null} onClick={() => bajar("ventas")}>
              {bajando === "ventas" ? "Armando…" : "Registro de ventas"}
            </button>
            <button type="button" className="btn-cayla btn-secundario" disabled={bajando !== null} onClick={() => bajar("compras")}>
              {bajando === "compras" ? "Armando…" : "Registro de compras"}
            </button>
            <button type="button" className="btn-cayla btn-primario" disabled={bajando !== null} onClick={() => bajar("paquete")}>
              {bajando === "paquete" ? "Armando…" : "Paquete para el contador"}
            </button>
          </>
        }
      />

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}

      <section className="fin-cifras">
        <TarjetaCifra compacta etiqueta="IGV cobrado al vender" valor={foco ? solesRedondo(foco.debito) : "—"} {...entra(1)}>
          {foco
            ? `${tasaIgv} % de las ventas del mes, de ${plural(foco.comprobantes, "comprobante emitido", "comprobantes emitidos")}${foco.igvNotasCredito > 0 ? `. Ya resta ${solesRedondo(foco.igvNotasCredito)} de notas de crédito` : ""}`
            : "Sin datos"}
        </TarjetaCifra>
        <TarjetaCifra compacta etiqueta="IGV que descuentas" valor={foco ? solesRedondo(foco.credito) : "—"} {...entra(2)}>
          {`Facturas de mercadería, gastos, activos e insumos${foco && foco.creditoNotas > 0 ? `, menos ${solesRedondo(foco.creditoNotas)} de notas de crédito` : ""}`}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          etiqueta={aFavor ? `Saldo a favor para ${siguiente}` : `IGV a pagar en ${siguiente}`}
          tono={aFavor ? "text-verde" : undefined}
          valor={foco ? solesRedondo(aFavor ? foco.saldoAFavor : foco.aPagar) : "—"}
          {...entra(3)}
        >
          {aFavor
            ? "Descontaste más IGV del que cobraste: se descuenta el mes siguiente"
            : `Vence según el último dígito de tu RUC${foco && foco.saldoAnterior > 0 ? `. Ya descuenta ${solesRedondo(foco.saldoAnterior)} a favor del mes anterior` : ""}`}
        </TarjetaCifra>
        <TarjetaCifra compacta etiqueta="Pago a cuenta de renta" valor={panel.renta.monto !== null ? solesRedondo(panel.renta.monto) : "—"} {...entra(4)}>
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

      <Superficie className="anim-sube">
        <Herramientas>
          <b className="text-sm font-semibold text-tinta">Últimos 6 meses</b>
          <span className="text-[12.5px] text-taupe">{mesCorto(mesActual)} (*) va a la fecha y todavía puede cambiar. Toca un mes para verlo.</span>
          <label className="ml-auto flex items-center gap-2 whitespace-nowrap text-[12.5px] text-taupe">
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

      <p className="nota-cayla">
        El pago a SUNAT todavía no se registra aquí: llega con Cuentas y dinero, porque sale de una cuenta de CAYLA. Mientras tanto, «sin pago registrado» solo dice que el sistema no lo sabe.
      </p>
    </div>
  );
}

function FilaMes({ m, mesActual, activa, onAbrir }: { m: MesIgv; mesActual: string; activa: boolean; onAbrir: () => void }) {
  const e = TEXTO_ESTADO_MES[estadoMes(m, mesActual)];
  return (
    <tr
      data-clic
      tabIndex={0}
      aria-current={activa ? "true" : undefined}
      className={activa ? "fin-fila-activa" : undefined}
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
      <Superficie pad className="anim-sube">
        <CabeceraBloque titulo={titulo} bajada="Al cruzarlo, SUNAT te exige llevar el Libro Diario y el Mayor electrónicos." />
        <p className="fin-nota-bloque">
          Falta el valor de la UIT o el límite del régimen.{" "}
          <Link href="/configuracion?tab=impuestos" className="btn-enlace">
            Configúralos en Configuración ▸ Impuestos
          </Link>
        </p>
      </Superficie>
    );
  }
  const avance = umbral.avance ?? 0;
  const p = proyectarUmbral(umbral.ventasMeses, hoy, umbral.umbralSoles, umbral.primerMes);
  const proyectado = Math.min(1, p.proyectadoDiciembre / umbral.umbralSoles);
  const tono = tonoAvance(umbral.avance);
  const provisional = uit.provisional || parametros.umbralUit?.provisional;
  return (
    <Superficie pad className="anim-sube">
      <CabeceraBloque titulo={titulo} bajada="Al cruzarlo, SUNAT te exige llevar el Libro Diario y el Mayor electrónicos.">
        <Chip tono={tono}>{porcentaje(avance)}</Chip>
      </CabeceraBloque>
      <div className="fin-umbral-barra" data-tono={tono} role="img" aria-label={`${porcentaje(avance)} del límite; a diciembre, ${porcentaje(proyectado)}`}>
        <i className="fin-proy" style={{ width: `${Math.max(proyectado, Math.min(1, avance)) * 100}%` }} />
        <i style={{ width: `${Math.min(1, avance) * 100}%` }} />
      </div>
      <div className="fin-marcas">
        <span>S/ 0</span>
        <span>
          Vendido en 12 meses: <b>{solesRedondo(umbral.ventas12m)}</b>
        </span>
        <span>{solesRedondo(umbral.umbralSoles)}</span>
      </div>
      <p className="fin-nota-bloque">
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
    detalle: `${r.honorarios.n > 0 ? `${plural(r.honorarios.n, "recibo", "recibos")} este mes${r.honorarios.mayores ? `, ${r.honorarios.mayores} de más de S/ 1,500` : ""}. ` : ""}El contador define si CAYLA debe retener. Mientras tanto, se paga el total.`,
  });
  return (
    <Superficie pad className="anim-sube">
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
              <Link href={p.accion.href} className="btn-cayla btn-sutil btn-chico">
                {p.accion.texto}
              </Link>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
    </Superficie>
  );
}
