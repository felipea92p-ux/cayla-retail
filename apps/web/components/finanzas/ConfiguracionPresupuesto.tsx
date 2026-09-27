"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieTabla, SelectFin, Superficie } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { mesDe, solesRedondo } from "@/lib/gastos-reglas";
import { mesAnterior, mesNombre, mesTitulo } from "@/lib/resultados-reglas";
import {
  cambiosDePropuesta,
  claveCelda,
  leerPropuesta,
  lotePropuesta,
  mesesParaPresupuestar,
  nombreCortoPpto,
  parsearTope,
  textoOrigen,
  textoTope,
  type ConfigPpto,
  type OrigenPropuesta,
  type PropuestaFila,
  type UnidadConfigPpto,
} from "@/lib/presupuesto-reglas";

// Configuración ▸ Presupuesto (ADR-0195, capa «para decidir»), dibujada como el spike (docs/maquetas/finanzas-2026-09/,
// `cfgPresupuesto`): una tabla por unidad y rubro para el mes elegido donde CADA CASILLA SE GUARDA SOLA al salir de ella si
// cambió, firmada con el responsable (como Tiendas y caja). La meta de ventas NO se escribe aquí: es la suma de las metas
// del día (F1), y se muestra para llegar a ella. «Copiar de…» y «Sugerir…» PROPONEN (la base no guarda nada) y lo propuesto
// se ve en una hoja; recién al confirmar se guarda de una vez.

type Guardar = (hacer: () => PromiseLike<{ error: unknown; data?: unknown }>, que: string, listo: (data: unknown) => string) => Promise<boolean>;

/** Una casilla que se guarda al salir (blur) si su texto cambió. Si el guardado falla, vuelve a lo de antes. */
function CasillaTope({ valor, etiqueta, alGuardar }: { valor: string; etiqueta: string; alGuardar: (nuevo: string) => Promise<boolean> }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
  // Si la base trae otro valor (otro guardado, una propuesta aplicada, otro mes), la casilla lo toma.
  if (valor !== antes) {
    setAntes(valor);
    setT(valor);
  }
  return (
    <input
      aria-label={etiqueta}
      inputMode="decimal"
      value={t}
      placeholder="—"
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setT(valor);
      }}
      onBlur={async () => {
        if (t.trim() === valor.trim()) return;
        const ok = await alGuardar(t);
        if (!ok) setT(valor);
      }}
      className="fin-control fin-num fin-num-input"
    />
  );
}

const nombreColumna = (u: UnidadConfigPpto) => (u.unidad === "tienda" ? nombreCortoPpto(u.nombre) : u.nombre);

export function ConfiguracionPresupuesto({ datos, hoy }: { datos: ConfigPpto; hoy: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [propuesta, setPropuesta] = useState<{ origen: OrigenPropuesta; filas: PropuestaFila[]; desde: string; hasta: string } | null>(null);
  const [proponiendo, setProponiendo] = useState<OrigenPropuesta | null>(null);
  const mes = datos.mes;

  const guardar: Guardar = async (hacer, que, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error, data } = (await firmar(hacer() as never, responsable.firma())) as { error: unknown; data?: unknown };
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    avisar.exito(listo(data));
    router.refresh();
    return true;
  };

  async function guardarCasilla(u: UnidadConfigPpto, cuenta: string, rubro: string, nuevo: string) {
    const v = parsearTope(nuevo);
    if (!v.ok) {
      avisar.error(`${rubro}, ${u.nombre}: ${v.error}`);
      return false;
    }
    return guardar(
      () => createClient().rpc("guardar_presupuesto" as never, { p_mes: `${mes}-01`, p_ubicacion_id: u.id, p_cuenta: cuenta, p_monto: v.valor } as never),
      "guardar el tope",
      () => `${rubro} de ${u.nombre} en ${mesNombre(mes)}: ${v.valor === null ? "sin tope" : `tope de ${solesRedondo(v.valor)}`}.`,
    );
  }

  async function proponer(origen: OrigenPropuesta) {
    setProponiendo(origen);
    const { data, error } = await createClient().rpc("fn_presupuesto_propuesta" as never, { p_mes: `${mes}-01`, p_origen: origen } as never);
    setProponiendo(null);
    if (error) {
      avisar.error(traducirError(error as never, "preparar la propuesta"));
      return;
    }
    const filas = ((data ?? []) as Record<string, unknown>[]);
    setPropuesta({
      origen,
      filas: filas.map(leerPropuesta),
      desde: String(filas[0]?.desde ?? ""),
      hasta: String(filas[0]?.hasta ?? ""),
    });
  }

  const ir = (m: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("mes", m);
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  if (!datos.unidades.length || !datos.lineas.length) {
    return <div className="nota-cayla">No hay unidades ni rubros de gasto para presupuestar.</div>;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">
          Cada casilla se guarda sola al salir de ella, a nombre de quien figure como responsable. Cada cambio queda en la historia.
        </p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <Superficie className="anim-sube">
        <div className="fin-herramientas justify-between">
          <div className="fin-herramientas-titulo min-w-0">
            <b>{mesTitulo(mes)}</b>
            <p>
              Topes de gasto por rubro (vacío = sin tope). La meta de ventas no se escribe aquí: sale de las metas del día de «Tiendas y
              caja». Se ve en{" "}
              <Link href={`/finanzas/reportes/presupuesto?mes=${mes}`} className="btn-enlace">
                Reportes ▸ Presupuesto
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectFin
              etiqueta="Mes del presupuesto"
              className="fin-mes-chico"
              valor={mes}
              onValor={ir}
              opciones={mesesParaPresupuestar(hoy).map((m) => ({ valor: m, texto: `${mesTitulo(m)}${m === mesDe(hoy) ? " · este mes" : ""}` }))}
            />
            <button
              type="button"
              className="btn-cayla btn-secundario btn-chico"
              onClick={() => proponer("mes_anterior")}
              disabled={!!proponiendo || datos.anterior === 0}
              title={datos.anterior === 0 ? `${mesTitulo(mesAnterior(mes))} no tiene topes para copiar.` : undefined}
            >
              {proponiendo === "mes_anterior" ? "Preparando…" : textoOrigen("mes_anterior", mes)}
            </button>
            <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => proponer("promedio_3_meses")} disabled={!!proponiendo}>
              {proponiendo === "promedio_3_meses" ? "Preparando…" : textoOrigen("promedio_3_meses", mes)}
            </button>
          </div>
        </div>
        <div className="fin-tabla-wrap">
          <table className="fin-tabla fin-tabla-apretada fin-ppto-edit">
            <thead>
              <tr>
                <th>Rubro</th>
                {datos.unidades.map((u) => (
                  <th key={u.id ?? "empresa"} className="fin-num">
                    {nombreColumna(u)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="fin-grupo">
                <td className="fin-ancha" data-l="Rubro">
                  Meta de ventas del mes <span className="fin-grupo-nota">· suma de las metas del día, sin IGV</span>
                </td>
                {datos.unidades.map((u) => (
                  <td key={u.id ?? "empresa"} className="fin-num" data-l={nombreColumna(u)}>
                    {u.unidad !== "tienda" ? (
                      <span className="fin-tenue">—</span>
                    ) : (
                      <Link href="/configuracion?tab=tiendas" className="btn-enlace fin-meta-enlace" title="Se cambia en Tiendas y caja">
                        {u.metaVentas === null ? "sin meta" : solesRedondo(u.metaVentas)}
                      </Link>
                    )}
                  </td>
                ))}
              </tr>
              {datos.lineas.map((l) => (
                <tr key={l.cuenta}>
                  <td className="fin-ancha" data-l="Rubro" title={l.ejemplos || undefined}>
                    {l.nombre} <span className="fin-tenue">(tope)</span>
                  </td>
                  {datos.unidades.map((u) => (
                    <td key={u.id ?? "empresa"} className="fin-num" data-l={nombreColumna(u)}>
                      <CasillaTope
                        valor={textoTope(datos.montos[claveCelda(u.id, l.cuenta)])}
                        etiqueta={`Tope de ${l.nombre} de ${u.nombre} en ${mesNombre(mes)}`}
                        alGuardar={(n) => guardarCasilla(u, l.cuenta, l.nombre, n)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PieTabla>
          <span>La planilla no lleva tope aquí: la decide Dynamic. Los topes son sin IGV, como el Estado de resultados.</span>
        </PieTabla>
      </Superficie>

      {propuesta && (
        <HojaPropuesta
          propuesta={propuesta}
          datos={datos}
          guardando={guardando}
          responsable={<ComboResponsable control={responsable} deshabilitado={guardando} />}
          onCerrar={() => setPropuesta(null)}
          onAplicar={async () => {
            const lote = lotePropuesta(propuesta.filas);
            const ok = await guardar(
              () =>
                createClient().rpc(
                  "guardar_presupuesto_lote" as never,
                  { p_mes: `${mes}-01`, p_filas: lote, p_origen: propuesta.origen } as never,
                ),
              "aplicar la propuesta",
              (n) => `Listo: ${Number(n ?? lote.length)} ${Number(n ?? lote.length) === 1 ? "tope cambió" : "topes cambiaron"} en ${mesNombre(mes)}.`,
            );
            if (ok) setPropuesta(null);
          }}
        />
      )}
    </>
  );
}

/** Lo propuesto, antes de guardarlo: cada casilla que cambia con su antes y su después. */
function HojaPropuesta({
  propuesta,
  datos,
  guardando,
  responsable,
  onCerrar,
  onAplicar,
}: {
  propuesta: { origen: OrigenPropuesta; filas: PropuestaFila[]; desde: string; hasta: string };
  datos: ConfigPpto;
  guardando: boolean;
  responsable: React.ReactNode;
  onCerrar: () => void;
  onAplicar: () => void;
}) {
  const cambios = cambiosDePropuesta(propuesta.filas);
  const unidad = (id: string | null) => datos.unidades.find((u) => u.id === id)?.nombre ?? (id ? "Otra ubicación" : "De la empresa");
  const rubro = (cuenta: string) => datos.lineas.find((l) => l.cuenta === cuenta)?.nombre ?? `Cuenta ${cuenta}`;
  const deDonde =
    propuesta.origen === "mes_anterior"
      ? `Los topes de ${mesNombre(mesAnterior(datos.mes))}, tal cual.`
      : propuesta.desde
        ? `Lo gastado de ${mesNombre(propuesta.desde.slice(0, 7))} a ${mesNombre(propuesta.hasta.slice(0, 7))} (sin IGV), dividido entre 3 y redondeado hacia arriba a la decena.`
        : "Lo gastado en los 3 últimos meses completos, dividido entre 3.";
  return (
    <Modal variante="hoja" titulo={textoOrigen(propuesta.origen, datos.mes)} subtitulo={deDonde} onClose={onCerrar} ancho="max-w-[600px]">
      {cambios.length ? (
        <>
          <div className="fin-tabla-wrap">
            <table className="fin-tabla fin-tabla-hoja">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Rubro</th>
                  <th className="fin-num">Hoy</th>
                  <th className="fin-num">Propuesto</th>
                </tr>
              </thead>
              <tbody>
                {cambios.map((c) => (
                  <tr key={claveCelda(c.ubicacionId, c.cuenta)}>
                    <td data-l="Unidad">{unidad(c.ubicacionId)}</td>
                    <td data-l="Rubro">{rubro(c.cuenta)}</td>
                    <td className="fin-num" data-l="Hoy">
                      {c.actual === null ? <span className="fin-tenue">sin tope</span> : solesRedondo(c.actual)}
                    </td>
                    <td className="fin-num" data-l="Propuesto">
                      <b>{solesRedondo(c.propuesto)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] text-taupe">
            Nada se guardó todavía. Lo que la propuesta no trae se queda como está, y después puedes cambiar cualquier casilla.
          </p>
          <div className="mt-4">{responsable}</div>
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-taupe">
          {propuesta.filas.length
            ? "Los topes de este mes ya son los que se proponen: no hay nada que cambiar."
            : propuesta.origen === "mes_anterior"
              ? `${mesTitulo(mesAnterior(datos.mes))} no tiene topes para copiar.`
              : "No hubo gastos en esos meses: no hay de dónde sugerir."}
        </p>
      )}
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          {cambios.length ? "Cancelar" : "Cerrar"}
        </button>
        {cambios.length > 0 && (
          <button type="button" className="btn-cayla btn-primario" onClick={onAplicar} disabled={guardando}>
            {guardando ? "Guardando…" : `Aplicar ${cambios.length} ${cambios.length === 1 ? "cambio" : "cambios"}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
