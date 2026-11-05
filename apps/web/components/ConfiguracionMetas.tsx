"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { BotonVerMas } from "@/components/ui/VerMas";
import { PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { fechaCorta, solesRedondo } from "@/lib/gastos-reglas";
import { DIAS_CORTOS, DIAS_SEMANA, TEXTO_ESTADO, estadoCampana, ordenarCampanas, parsearMonto, parsearPorcentaje, validarTienda } from "@/lib/configuracion-reglas";
import type { CampanaConfig, ConfiguracionMetas as DatosMetas, ConfiguracionTiendas as Datos, TiendaConfig } from "@/lib/configuracion-reglas";
import { BotonEnlace } from "@/components/ui/campos";
import { Casilla, FilaResponsable, useGuardarCasilla, type Guardar } from "@/components/ConfiguracionCasilla";
import { ConfiguracionMetasMes } from "@/components/ConfiguracionMetasMes";
import { semanaConCambio } from "@/lib/metas-frescas-reglas";
import { NO_SE_PUDO_LEER, tiendaFresca } from "@/lib/metas-frescas";

// Configuración ▸ Metas (ADR-0195 F1; metas por mes y por fecha, ADR-0435): cuánto se espera vender y qué se deja en el cajón. Nació dentro de
// «Tiendas y caja», que juntaba 7 temas en 4,3 pantallas; Felipe la partió el 2026-11-04: aquí queda solo lo que responde «¿cuánto tiene que
// vender cada tienda?», y lo demás pasó a «Empresa y tiendas» (`vitrinas-sedes/`), también el fondo de caja y la hora de cierre. CADA CASILLA SE GUARDA SOLA al salir de ella si cambió,
// firmada con el responsable. Sin botones «Guardar»: la base vuelve a validar todo.

const texto = (n: number | null) => (n === null ? "" : String(n));
const corto = (nombre: string) => nombre.replace(/^Tienda\s+/i, "");

function FilaTienda({ tienda, guardar }: { tienda: TiendaConfig; guardar: Guardar }) {
  const metas = tienda.metas.map(texto);

  // `guardar_metas_tienda` reemplaza la semana y el fondo: se manda lo último de la base con solo este día cambiado, para no pisar lo de otra pestaña. El fondo se edita en Empresa y tiendas.
  async function guardarCasilla(indice: number, nuevo: string) {
    const fresca = await tiendaFresca(tienda.id);
    if (!fresca) {
      avisar.error(NO_SE_PUDO_LEER);
      return false;
    }
    const b = semanaConCambio(fresca, indice, nuevo);
    const v = validarTienda(b);
    if (!v.ok) {
      avisar.error(`${tienda.nombre}: ${v.error}`);
      return false;
    }
    const que = `Meta del ${DIAS_SEMANA[indice]!.toLowerCase()} de ${tienda.nombre}`;
    const valorNuevo = v.valor.metas[indice];
    return guardar(
      () => createClient().rpc("guardar_metas_tienda" as never, { p_ubicacion_id: tienda.id, p_metas: v.valor.metas, p_fondo: v.valor.fondo } as never),
      "guardar las metas",
      `${que}: ${valorNuevo === null || valorNuevo === undefined ? "sin meta" : solesRedondo(valorNuevo)}. La meta del mes se recalculó.`,
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
                <span className="text-sm text-taupe">%</span>
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

/** Las campañas: las que rigen, vienen o aún no tienen fechas, a la vista; las que ya pasaron, plegadas. Abiertas siguen siendo las de antes: lo que
 *  se puede cambiar no cambió, solo dejaron de ocupar la pantalla. */
function Campanas({ datos, guardar }: { datos: Datos; guardar: Guardar }) {
  const [verPasadas, setVerPasadas] = useState(false);
  const campanas = useMemo(() => ordenarCampanas(datos.campanas, datos.hoy), [datos]);
  const vigentes = campanas.filter((c) => estadoCampana(c.desde, c.hasta, datos.hoy) !== "paso");
  const pasadas = campanas.filter((c) => estadoCampana(c.desde, c.hasta, datos.hoy) === "paso");
  const fila = (c: CampanaConfig) => <FilaCampana key={c.id} campana={c} tiendas={datos.tiendas} hoy={datos.hoy} guardar={guardar} />;

  return (
    <Superficie className="anim-sube" guia="config.tiendas-campanas">
      <TituloDeTarjeta titulo="Campañas: lo que cambian en la caja" bajada="Las campañas y sus fechas son las de Catálogo ▸ Insignias. Aquí se dice, por tienda, cuánto sube la meta y qué fondo dejar. Vacío = lo normal.">
        <BotonEnlace href="/productos/insignias">+ Nueva campaña (en Catálogo ▸ Insignias)</BotonEnlace>
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
            {vigentes.map(fila)}
            {vigentes.length === 0 && !verPasadas && (
              <tr>
                <td colSpan={4 + datos.tiendas.length} className="fin-tenue">
                  No hay campañas por venir. Se crean en Catálogo ▸ Insignias.
                </td>
              </tr>
            )}
            {verPasadas && pasadas.map(fila)}
          </tbody>
        </table>
      </div>
      {pasadas.length > 0 && (
        <BotonVerMas abierto={verPasadas} onCambiar={setVerPasadas} texto={pasadas.length === 1 ? "Ver la que ya pasó" : `Ver las ${pasadas.length} que ya pasaron`} />
      )}
      <PieTabla>
        <span>Si dos campañas se cruzan, gana la que más sube la meta y el fondo más alto.</span>
      </PieTabla>
    </Superficie>
  );
}

export function ConfiguracionMetas({ datos, metas }: { datos: Datos; metas?: DatosMetas | null }) {
  const { responsable, guardando, guardar } = useGuardarCasilla();
  const rigenHoy = useMemo(() => datos.campanas.filter((c) => estadoCampana(c.desde, c.hasta, datos.hoy) === "rige"), [datos]);

  if (!datos.tiendas.length) {
    return <div className="nota-cayla">No hay tiendas activas para configurar.</div>;
  }

  return (
    <>
      <FilaResponsable responsable={responsable} guardando={guardando} guia="config.guardado" />

      <Superficie className="anim-sube" guia="config.tiendas-normal">
        <TituloDeTarjeta titulo="Lo normal de cada tienda" bajada="Meta de cada día, con IGV.">
          <Chip tono={rigenHoy.length ? "ambar" : "verde"}>Hoy rige: {rigenHoy.length ? rigenHoy.map((c) => c.nombre).join(" y ") : "lo normal"}</Chip>
        </TituloDeTarjeta>
        <div className="fin-tabla-wrap cfg-planilla">
          <table className="fin-tabla fin-tabla-apretada">
            <thead>
              <tr>
                <th>Tienda</th>
                {DIAS_CORTOS.map((d) => (
                  <th key={d} className="fin-num">
                    {d}
                  </th>
                ))}
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
          <span>La meta del mes no se escribe: es la suma de los días, con las campañas incluidas. Vacío = sin meta ese día. Un mes con su propia meta o una fecha especial (abajo) mandan sobre esta semana.</span>
        </PieTabla>
      </Superficie>

      {metas && metas.tiendas.length > 0 && <ConfiguracionMetasMes metas={metas} guardar={guardar} />}

      <Campanas datos={datos} guardar={guardar} />

      <div className="nota-cayla" data-guia="config.tiendas-nota">
        Una sola lista de fechas: la de las campañas. La caja ve la meta de hoy y cuánto le falta; al cerrar, el fondo que tiene que dejar. Si deja menos, <b>se le pide confirmar, no se le bloquea</b>, y el cierre queda anotado para el líder.{" "}
        <Link href="/caja" className="btn-enlace">
          Ver cómo se ve en Caja
        </Link>
      </div>
    </>
  );
}
