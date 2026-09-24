"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import {
  DIAS_CORTOS,
  TEXTO_ESTADO,
  estadoCampana,
  ordenarCampanas,
  parsearMonto,
  parsearPorcentaje,
  validarTienda,
} from "@/lib/configuracion-reglas";
import type { CampanaConfig, ConfiguracionTiendas as Datos, TiendaConfig } from "@/lib/configuracion-reglas";

// Configuración ▸ Tiendas y caja (ADR-0195 F1). Dos tablas: lo normal de cada tienda (meta por día y fondo) y lo que cambia
// cada campaña. Cada fila se guarda sola con su botón, firmada con el responsable; la base vuelve a validar todo.

const texto = (n: number | null) => (n === null ? "" : String(n));
const dinero = (n: number) => soles(n).replace(".00", "");

function FilaTienda({ tienda, alGuardar, guardando }: { tienda: TiendaConfig; alGuardar: (t: TiendaConfig, metas: string[], fondo: string) => void; guardando: boolean }) {
  const inicial = useMemo(() => ({ metas: tienda.metas.map(texto), fondo: texto(tienda.fondo) }), [tienda]);
  const [metas, setMetas] = useState<string[]>(inicial.metas);
  const [fondo, setFondo] = useState(inicial.fondo);
  const cambio = metas.some((m, i) => m !== inicial.metas[i]) || fondo !== inicial.fondo;
  return (
    <tr className="border-t border-sand">
      <td className="px-3 py-2.5 text-sm font-semibold text-tinta">
        {tienda.nombre}
        {tienda.metas.every((m) => m === null) && tienda.metaRespaldo !== null && (
          <span className="mt-0.5 block text-[11.5px] font-normal text-taupe">Hoy usa {dinero(tienda.metaRespaldo)} todos los días</span>
        )}
      </td>
      {metas.map((m, i) => (
        <td key={i} className="px-1.5 py-2.5">
          <input
            aria-label={`Meta del ${DIAS_CORTOS[i]} de ${tienda.nombre}`}
            inputMode="decimal"
            value={m}
            placeholder="—"
            onChange={(e) => setMetas((ms) => ms.map((x, j) => (j === i ? e.target.value : x)))}
            className="caja-cayla h-9 w-[4.6rem] px-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-taupe/60"
          />
        </td>
      ))}
      <td className="px-1.5 py-2.5">
        <input
          aria-label={`Fondo de caja de ${tienda.nombre}`}
          inputMode="decimal"
          value={fondo}
          placeholder="—"
          onChange={(e) => setFondo(e.target.value)}
          className="caja-cayla h-9 w-[5rem] px-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-taupe/60"
        />
      </td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">
        {tienda.metaMes !== null ? (
          <>
            <span className="font-semibold text-tinta">{dinero(tienda.metaMes)}</span>
            <span className="block text-[11.5px] text-taupe">{dinero(Math.round(tienda.metaMes / 1.18))} sin IGV</span>
          </>
        ) : (
          <span className="text-taupe">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button type="button" className="btn-cayla btn-primario btn-chico" disabled={!cambio || guardando} onClick={() => alGuardar(tienda, metas, fondo)}>
          Guardar
        </button>
      </td>
    </tr>
  );
}

type CeldaEfecto = { pct: string; fondo: string };

function FilaCampana({ campana, tiendas, hoy, alGuardar, guardando }: {
  campana: CampanaConfig;
  tiendas: TiendaConfig[];
  hoy: string;
  alGuardar: (c: CampanaConfig, celdas: Record<string, CeldaEfecto>, inicial: Record<string, CeldaEfecto>) => void;
  guardando: boolean;
}) {
  const estado = estadoCampana(campana.desde, campana.hasta, hoy);
  const conFechas = estado !== "sin_fechas";
  const inicial = useMemo(
    () => Object.fromEntries(tiendas.map((t) => {
      const e = campana.efectos[t.id];
      return [t.id, { pct: e && e.meta_pct ? String(e.meta_pct) : "", fondo: e ? texto(e.fondo) : "" }];
    })) as Record<string, CeldaEfecto>,
    [campana, tiendas],
  );
  const [celdas, setCeldas] = useState(inicial);
  const cambio = tiendas.some((t) => celdas[t.id]!.pct !== inicial[t.id]!.pct || celdas[t.id]!.fondo !== inicial[t.id]!.fondo);
  const fuera = (u: string) => campana.sedes.length > 0 && !campana.sedes.includes(u);
  const e = TEXTO_ESTADO[estado];
  return (
    <tr className={`border-t border-sand ${estado === "paso" ? "opacity-60" : ""}`}>
      <td className="px-3 py-2.5 text-sm">
        <span className="font-semibold text-tinta">{campana.nombre}</span>
        <span className="block text-[11.5px] text-taupe">
          {conFechas ? `${campana.desde!.slice(8, 10)}/${campana.desde!.slice(5, 7)} – ${campana.hasta!.slice(8, 10)}/${campana.hasta!.slice(5, 7)}` : "sin fechas"}
          {campana.descuentoPct ? ` · ${campana.descuentoPct} % de descuento` : ""}
        </span>
      </td>
      {tiendas.map((t) => (
        <td key={t.id} className="px-1.5 py-2.5">
          {!conFechas ? (
            <span className="text-[12px] text-taupe">ponle fechas</span>
          ) : fuera(t.id) ? (
            <span className="text-[12px] text-taupe">no rige aquí</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <input
                aria-label={`Cuánto sube la meta en ${campana.nombre}, ${t.nombre}`}
                inputMode="decimal"
                value={celdas[t.id]!.pct}
                placeholder="0"
                onChange={(ev) => setCeldas((c) => ({ ...c, [t.id]: { ...c[t.id]!, pct: ev.target.value } }))}
                className="caja-cayla h-9 w-[3.6rem] px-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-taupe/60"
              />
              <span className="text-xs text-taupe">%</span>
              <input
                aria-label={`Fondo de caja en ${campana.nombre}, ${t.nombre}`}
                inputMode="decimal"
                value={celdas[t.id]!.fondo}
                placeholder="—"
                onChange={(ev) => setCeldas((c) => ({ ...c, [t.id]: { ...c[t.id]!, fondo: ev.target.value } }))}
                className="caja-cayla h-9 w-[4.4rem] px-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-taupe/60"
              />
            </span>
          )}
        </td>
      ))}
      <td className="px-3 py-2.5">
        <Chip tono={e.tono}>{e.texto}</Chip>
      </td>
      <td className="px-3 py-2.5 text-right">
        {conFechas && (
          <button type="button" className="btn-cayla btn-primario btn-chico" disabled={!cambio || guardando} onClick={() => alGuardar(campana, celdas, inicial)}>
            Guardar
          </button>
        )}
      </td>
    </tr>
  );
}

export function ConfiguracionTiendas({ datos }: { datos: Datos }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const campanas = useMemo(() => ordenarCampanas(datos.campanas, datos.hoy), [datos]);
  const rigenHoy = campanas.filter((c) => estadoCampana(c.desde, c.hasta, datos.hoy) === "rige");

  async function listoParaGuardar() {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return false;
    }
    return true;
  }

  async function guardarTienda(t: TiendaConfig, metas: string[], fondo: string) {
    const v = validarTienda({ metas, fondo });
    if (!v.ok) return avisar.error(`${t.nombre}: ${v.error}`);
    if (!(await listoParaGuardar())) return;
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("guardar_metas_tienda" as never, { p_ubicacion_id: t.id, p_metas: v.valor.metas, p_fondo: v.valor.fondo } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "guardar las metas"));
    avisar.exito(`Metas de ${t.nombre} guardadas`, { detalle: "La caja las ve desde ahora." });
    router.refresh();
  }

  async function guardarCampana(c: CampanaConfig, celdas: Record<string, CeldaEfecto>, inicial: Record<string, CeldaEfecto>) {
    const cambios: { tienda: TiendaConfig; pct: number; fondo: number | null }[] = [];
    for (const t of datos.tiendas) {
      const celda = celdas[t.id]!;
      if (celda.pct === inicial[t.id]!.pct && celda.fondo === inicial[t.id]!.fondo) continue;
      const pct = parsearPorcentaje(celda.pct);
      if (!pct.ok) return avisar.error(`${c.nombre}, ${t.nombre}: ${pct.error}`);
      const f = parsearMonto(celda.fondo);
      if (!f.ok) return avisar.error(`${c.nombre}, ${t.nombre}: fondo — ${f.error}`);
      cambios.push({ tienda: t, pct: pct.valor, fondo: f.valor });
    }
    if (!cambios.length || !(await listoParaGuardar())) return;
    setGuardando(true);
    const supabase = createClient();
    for (const cambio of cambios) {
      const { error } = await firmar(
        supabase.rpc("guardar_efecto_campana" as never, { p_etiqueta_id: c.id, p_ubicacion_id: cambio.tienda.id, p_meta_pct: cambio.pct, p_fondo: cambio.fondo } as never),
        responsable.firma(),
      );
      if (error) {
        setGuardando(false);
        responsable.despues(error);
        return avisar.error(traducirError(error, `guardar ${c.nombre} en ${cambio.tienda.nombre}`));
      }
    }
    setGuardando(false);
    responsable.despues(null);
    avisar.exito(`${c.nombre} guardada`, { detalle: cambios.map((x) => x.tienda.nombre).join(", ") });
    router.refresh();
  }

  if (!datos.tiendas.length) {
    return <div className="nota-cayla">No hay tiendas activas para configurar.</div>;
  }

  return (
    <>
      <div className="anim-sube flex flex-wrap items-end justify-between gap-4" style={{ "--i": 1 } as CSSProperties}>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
        <Chip tono={rigenHoy.length ? "ambar" : "verde"}>Hoy rige: {rigenHoy.length ? rigenHoy.map((c) => c.nombre).join(" y ") : "lo normal"}</Chip>
      </div>

      <section className="card-cayla anim-sube overflow-hidden" style={{ "--i": 2 } as CSSProperties}>
        <div className="border-b border-sand px-4 py-3.5">
          <h2 className="text-sm font-semibold text-tinta">Lo normal de cada tienda</h2>
          <p className="mt-0.5 text-[13px] text-taupe">Meta de venta de cada día de la semana, con IGV (lo que ve la caja), y lo que debe quedar en el cajón al cerrar. Vacío = sin meta ese día.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse">
            <thead className="bg-sand/70 text-left text-xs text-taupe">
              <tr>
                <th className="px-3 py-2 font-normal">Tienda</th>
                {DIAS_CORTOS.map((d) => <th key={d} className="px-1.5 py-2 text-right font-normal">{d}</th>)}
                <th className="px-1.5 py-2 text-right font-normal">Fondo de caja</th>
                <th className="px-3 py-2 text-right font-normal">Meta del mes</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {datos.tiendas.map((t) => <FilaTienda key={`${t.id}-${t.metas.join(",")}-${t.fondo}`} tienda={t} alGuardar={guardarTienda} guardando={guardando} />)}
            </tbody>
          </table>
        </div>
        <p className="border-t border-sand px-4 py-2.5 text-[12.5px] text-taupe">La meta del mes no se escribe: es la suma de las metas de cada día, con las campañas incluidas.</p>
      </section>

      <section className="card-cayla anim-sube overflow-hidden" style={{ "--i": 3 } as CSSProperties}>
        <div className="border-b border-sand px-4 py-3.5">
          <h2 className="text-sm font-semibold text-tinta">Campañas: lo que cambian en la caja</h2>
          <p className="mt-0.5 text-[13px] text-taupe">
            Las campañas y sus fechas son las de Catálogo ▸ Etiquetas. Aquí se dice, por tienda, cuánto sube la meta (%) y qué fondo dejar. Vacío = lo normal.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead className="bg-sand/70 text-left text-xs text-taupe">
              <tr>
                <th className="px-3 py-2 font-normal">Campaña</th>
                {datos.tiendas.map((t) => <th key={t.id} className="px-1.5 py-2 font-normal">{t.nombre}: meta · fondo</th>)}
                <th className="px-3 py-2 font-normal">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => (
                <FilaCampana key={`${c.id}-${JSON.stringify(c.efectos)}`} campana={c} tiendas={datos.tiendas} hoy={datos.hoy} alGuardar={guardarCampana} guardando={guardando} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-sand px-4 py-2.5 text-[12.5px] text-taupe">
          Si dos campañas rigen el mismo día (Fiestas Patrias y el Día del Gato), gana la que más sube la meta y el fondo más alto: la misma regla que el descuento de una prenda.
        </p>
      </section>

      <div className="nota-cayla anim-sube" style={{ "--i": 4 } as CSSProperties}>
        La caja ve la meta de hoy y cuánto le falta; al cerrar, el fondo que tiene que dejar. Si deja menos, <b>se le pide confirmar, no se le bloquea</b>, y el cierre queda anotado para el líder.
      </div>
    </>
  );
}
