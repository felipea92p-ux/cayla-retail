"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fechaCorta, solesRedondo } from "@/lib/gastos-reglas";
import { DIAS_CORTOS, DIAS_SEMANA, TEXTO_ESTADO, estadoCampana, ordenarCampanas, parsearMonto, parsearPorcentaje, validarTienda } from "@/lib/configuracion-reglas";
import type { CampanaConfig, ConfiguracionTiendas as Datos, TiendaConfig } from "@/lib/configuracion-reglas";

// Configuración ▸ Tiendas y caja (ADR-0195 F1), dibujada como el spike (docs/maquetas/finanzas-2026-09/, `cfgTiendas`):
// dos tablas —lo normal de cada tienda (meta por día y fondo) y lo que cambia cada campaña— donde CADA CASILLA SE GUARDA
// SOLA al salir de ella si cambió, firmada con el responsable. Sin botones «Guardar»: la base vuelve a validar todo.

const texto = (n: number | null) => (n === null ? "" : String(n));
const corto = (nombre: string) => nombre.replace(/^Tienda\s+/i, "");

type Guardar = (hacer: () => PromiseLike<{ error: unknown }>, que: string, listo: string) => Promise<boolean>;

/** Una casilla numérica que se guarda al salir (blur) si su texto cambió. Si el guardado falla, vuelve a lo de antes. */
function Casilla({ valor, etiqueta, ancho, alGuardar, placeholder = "—" }: { valor: string; etiqueta: string; ancho: string; alGuardar: (nuevo: string) => Promise<boolean>; placeholder?: string }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
  // Si la base trae otro valor (otro guardado, un refresco), la casilla lo toma.
  if (valor !== antes) {
    setAntes(valor);
    setT(valor);
  }
  return (
    <input
      aria-label={etiqueta}
      inputMode="decimal"
      value={t}
      placeholder={placeholder}
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
      className={`fin-control fin-num inline-block ${ancho}`}
    />
  );
}

function FilaTienda({ tienda, guardar }: { tienda: TiendaConfig; guardar: Guardar }) {
  const metas = tienda.metas.map(texto);
  const fondo = texto(tienda.fondo);

  async function guardarCasilla(indice: number | "fondo", nuevo: string) {
    const b = { metas: indice === "fondo" ? metas : metas.map((m, i) => (i === indice ? nuevo : m)), fondo: indice === "fondo" ? nuevo : fondo };
    const v = validarTienda(b);
    if (!v.ok) {
      avisar.error(`${tienda.nombre}: ${v.error}`);
      return false;
    }
    const que = indice === "fondo" ? `Fondo de ${tienda.nombre}` : `Meta del ${DIAS_SEMANA[indice]!.toLowerCase()} de ${tienda.nombre}`;
    const valorNuevo = indice === "fondo" ? v.valor.fondo : v.valor.metas[indice];
    return guardar(
      () => createClient().rpc("guardar_metas_tienda" as never, { p_ubicacion_id: tienda.id, p_metas: v.valor.metas, p_fondo: v.valor.fondo } as never),
      "guardar las metas",
      `${que}: ${valorNuevo === null || valorNuevo === undefined ? "sin meta" : solesRedondo(valorNuevo)}.${indice === "fondo" ? "" : " La meta del mes se recalculó."}`,
    );
  }

  return (
    <tr>
      <td className="fin-ancha" data-l="Tienda">
        <b>{tienda.nombre}</b>
        {tienda.metas.every((m) => m === null) && tienda.metaRespaldo !== null && <span className="fin-sub">Hoy usa {solesRedondo(tienda.metaRespaldo)} todos los días</span>}
      </td>
      {metas.map((m, i) => (
        <td key={i} className="fin-num" data-l={DIAS_CORTOS[i]}>
          <Casilla valor={m} etiqueta={`Meta del ${DIAS_SEMANA[i]!.toLowerCase()} de ${tienda.nombre}`} ancho="w-16" alGuardar={(n) => guardarCasilla(i, n)} />
        </td>
      ))}
      <td className="fin-num" data-l="Fondo de caja">
        <Casilla valor={fondo} etiqueta={`Fondo de caja de ${tienda.nombre}`} ancho="w-[5.2rem]" alGuardar={(n) => guardarCasilla("fondo", n)} />
      </td>
      <td className="fin-num" data-l="Meta del mes">
        {tienda.metaMes !== null ? (
          <>
            <b>{solesRedondo(tienda.metaMes)}</b>
            <span className="fin-sub">{solesRedondo(tienda.metaMes / 1.18)} sin IGV</span>
          </>
        ) : (
          <span className="fin-tenue">—</span>
        )}
      </td>
    </tr>
  );
}

function FilaCampana({ campana, tiendas, hoy, guardar }: { campana: CampanaConfig; tiendas: TiendaConfig[]; hoy: string; guardar: Guardar }) {
  const estado = estadoCampana(campana.desde, campana.hasta, hoy);
  const conFechas = estado !== "sin_fechas";
  const fuera = (u: string) => campana.sedes.length > 0 && !campana.sedes.includes(u);
  const e = TEXTO_ESTADO[estado];

  async function guardarCelda(t: TiendaConfig, campo: "pct" | "fondo", nuevo: string) {
    const actual = campana.efectos[t.id];
    const pct = parsearPorcentaje(campo === "pct" ? nuevo : actual?.meta_pct ? String(actual.meta_pct) : "");
    if (!pct.ok) {
      avisar.error(`${campana.nombre}, ${t.nombre}: ${pct.error}`);
      return false;
    }
    const f = parsearMonto(campo === "fondo" ? nuevo : texto(actual?.fondo ?? null));
    if (!f.ok) {
      avisar.error(`${campana.nombre}, ${t.nombre}: fondo — ${f.error}`);
      return false;
    }
    const detalle = campo === "pct" ? `meta ${pct.valor > 0 ? "+" : ""}${pct.valor} %` : `fondo ${f.valor === null ? "normal" : solesRedondo(f.valor)}`;
    return guardar(
      () => createClient().rpc("guardar_efecto_campana" as never, { p_etiqueta_id: campana.id, p_ubicacion_id: t.id, p_meta_pct: pct.valor, p_fondo: f.valor } as never),
      `guardar ${campana.nombre} en ${t.nombre}`,
      `${campana.nombre} en ${t.nombre}: ${detalle}.`,
    );
  }

  return (
    <tr className={estado === "paso" ? "fin-suave" : undefined}>
      <td className="fin-ancha" data-l="Campaña">
        <b>{campana.nombre}</b>
      </td>
      <td data-l="Fechas">{conFechas ? `${fechaCorta(campana.desde)} – ${fechaCorta(campana.hasta)}` : <span className="fin-tenue">sin fechas</span>}</td>
      <td className="fin-num" data-l="Descuento">
        {campana.descuentoPct ? `${campana.descuentoPct} %` : <span className="fin-tenue">—</span>}
      </td>
      {tiendas.map((t) => {
        const ef = campana.efectos[t.id];
        return (
          <td key={t.id} className="fin-num" data-l={`${corto(t.nombre)}: meta · fondo`}>
            {!conFechas ? (
              <span className="fin-tenue">ponle fechas</span>
            ) : fuera(t.id) ? (
              <span className="fin-tenue">no rige aquí</span>
            ) : (
              <span className="fin-par-inp">
                <Casilla valor={ef?.meta_pct ? String(ef.meta_pct) : ""} etiqueta={`Cuánto sube la meta en ${campana.nombre}, ${t.nombre}`} ancho="w-[3.6rem]" alGuardar={(n) => guardarCelda(t, "pct", n)} />
                <span className="text-xs text-taupe">%</span>
                <Casilla valor={texto(ef?.fondo ?? null)} etiqueta={`Fondo de caja en ${campana.nombre}, ${t.nombre}`} ancho="w-[4.4rem]" alGuardar={(n) => guardarCelda(t, "fondo", n)} />
              </span>
            )}
          </td>
        );
      })}
      <td data-l="Estado">
        <Chip tono={e.tono}>{e.texto}</Chip>
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

  const guardar: Guardar = async (hacer, que, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(hacer() as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    avisar.exito(listo);
    router.refresh();
    return true;
  };

  if (!datos.tiendas.length) {
    return <div className="nota-cayla">No hay tiendas activas para configurar.</div>;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">Cada casilla se guarda sola al salir de ella, a nombre de quien figure como responsable. Cada cambio queda en la historia.</p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <Superficie className="anim-sube">
        <TituloDeTarjeta titulo="Lo normal de cada tienda" bajada="Meta de venta de cada día de la semana (con IGV, lo que ve la caja) y lo que debe quedar en el cajón al cerrar.">
          <Chip tono={rigenHoy.length ? "ambar" : "verde"}>Hoy rige: {rigenHoy.length ? rigenHoy.map((c) => c.nombre).join(" y ") : "lo normal"}</Chip>
        </TituloDeTarjeta>
        <div className="fin-tabla-wrap">
          <table className="fin-tabla fin-tabla-apretada">
            <thead>
              <tr>
                <th>Tienda</th>
                {DIAS_CORTOS.map((d) => (
                  <th key={d} className="fin-num">
                    {d}
                  </th>
                ))}
                <th className="fin-num">Fondo de caja</th>
                <th className="fin-num">Meta del mes</th>
              </tr>
            </thead>
            <tbody>
              {datos.tiendas.map((t) => (
                <FilaTienda key={t.id} tienda={t} guardar={guardar} />
              ))}
            </tbody>
          </table>
        </div>
        <PieTabla>
          <span>La meta del mes no se escribe: es la suma de los días, con las campañas incluidas. Vacío = sin meta ese día.</span>
        </PieTabla>
      </Superficie>

      <Superficie className="anim-sube">
        <TituloDeTarjeta titulo="Campañas: lo que cambian en la caja" bajada="Las campañas y sus fechas son las de Catálogo ▸ Etiquetas. Aquí se dice, por tienda, cuánto sube la meta y qué fondo dejar. Vacío = lo normal.">
          <Link href="/productos/atributos?tipo=etiquetas" className="btn-cayla btn-secundario btn-chico">
            + Nueva campaña (en Catálogo ▸ Etiquetas)
          </Link>
        </TituloDeTarjeta>
        <div className="fin-tabla-wrap">
          <table className="fin-tabla fin-tabla-apretada">
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Fechas</th>
                <th className="fin-num">Descuento</th>
                {datos.tiendas.map((t) => (
                  <th key={t.id} className="fin-num">
                    {corto(t.nombre)}: meta · fondo
                  </th>
                ))}
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => (
                <FilaCampana key={c.id} campana={c} tiendas={datos.tiendas} hoy={datos.hoy} guardar={guardar} />
              ))}
            </tbody>
          </table>
        </div>
        <PieTabla>
          <span>Si dos campañas se cruzan (Fiestas Patrias y el Día del Gato), gana la que más sube la meta y el fondo más alto: la misma regla que el descuento de una prenda.</span>
        </PieTabla>
      </Superficie>

      <div className="nota-cayla">
        Una sola lista de fechas: la de las campañas. La caja ve la meta de hoy y cuánto le falta; al cerrar, el fondo que tiene que dejar. Si deja menos, <b>se le pide confirmar, no se le bloquea</b>, y el cierre queda anotado para el líder.{" "}
        <Link href="/caja" className="btn-enlace">
          Ver cómo se ve en Caja
        </Link>
      </div>
    </>
  );
}
