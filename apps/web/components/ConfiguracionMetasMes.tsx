"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { InputFin, PieTabla, SelectFin, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { Casilla, type Guardar } from "@/components/ConfiguracionCasilla";
import { DIAS_CORTOS, DIAS_SEMANA, validarMetaFecha, validarSemanaMes } from "@/lib/configuracion-reglas";
import type { ConfiguracionMetas, FechaMeta, MesMetas, TiendaMetas } from "@/lib/configuracion-reglas";
import { fechaCorta, solesRedondo, textoMes } from "@/lib/gastos-reglas";

// Configuración ▸ Tiendas y caja: la meta que cambia con el calendario (ADR-0435, 20261017020000). Hasta aquí la semana tipo valía los
// 12 meses; pero diciembre vende casi el doble que octubre y el 24 de diciembre, dos veces su día. Dos tarjetas con el mismo patrón de
// siempre —cada casilla se guarda sola al salir, firmada con el responsable—:
//   · «Meta mes por mes»: la semana de cada mes. Una casilla vacía usa la semana tipo (se ve en gris), así que un mes sin cargar no cambia nada.
//   · «Fechas especiales»: la meta de UN día, que gana sobre el mes y la campaña. 0 = esa tienda no abre ese día.

const texto = (n: number | null) => (n === null ? "" : String(n));
const corto = (nombre: string) => nombre.replace(/^Tienda\s+/i, "");
const nombreMes = (mes: string) => textoMes(mes.slice(0, 7));
/** «jue» de una fecha «2026-12-24» (sin zona horaria: el día escrito es el día). */
const diaDe = (iso: string) => DIAS_CORTOS[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7]!;

function FilaMes({ tienda, mes, esActual, guardar }: { tienda: TiendaMetas; mes: MesMetas; esActual: boolean; guardar: Guardar }) {
  const textos = mes.metas.map(texto);

  async function guardarCasilla(indice: number, nuevo: string) {
    const v = validarSemanaMes(textos.map((t, i) => (i === indice ? nuevo : t)));
    if (!v.ok) {
      avisar.error(`${tienda.nombre}, ${nombreMes(mes.mes)}: ${v.error}`);
      return false;
    }
    const valorNuevo = v.valor[indice];
    return guardar(
      () => createClient().rpc("guardar_metas_mes" as never, { p_ubicacion_id: tienda.id, p_mes: mes.mes, p_metas: v.valor } as never),
      "guardar la meta del mes",
      `${DIAS_SEMANA[indice]} de ${nombreMes(mes.mes)} en ${tienda.nombre}: ${valorNuevo === null || valorNuevo === undefined ? "usa la semana tipo" : solesRedondo(valorNuevo)}. La meta del mes se recalculó.`,
    );
  }

  return (
    <tr>
      <td className="fin-ancha" data-l="Mes">
        <b className="capitalize">{nombreMes(mes.mes)}</b>
        {esActual && <span className="fin-sub">este mes</span>}
      </td>
      {mes.metas.map((m, i) => (
        <td key={i} className="fin-num" data-l={DIAS_CORTOS[i]}>
          <Casilla
            valor={texto(m)}
            etiqueta={`Meta del ${DIAS_SEMANA[i]!.toLowerCase()} de ${nombreMes(mes.mes)} en ${tienda.nombre}`}
            ancho="w-16"
            placeholder={tienda.tipica[i] === null ? "—" : String(tienda.tipica[i])}
            alGuardar={(n) => guardarCasilla(i, n)}
          />
        </td>
      ))}
      <td className="fin-num" data-l="Meta del mes">
        {mes.total !== null ? (
          <>
            <b>{solesRedondo(mes.total)}</b>
            <span className="fin-sub">{solesRedondo(mes.total / 1.18)} sin IGV</span>
          </>
        ) : (
          <span className="fin-tenue">—</span>
        )}
      </td>
    </tr>
  );
}

function FilaFecha({ f, tienda, hoy, guardar }: { f: FechaMeta; tienda: string; hoy: string; guardar: Guardar }) {
  const [quitando, setQuitando] = useState(false);
  const que = `${tienda}, ${fechaCorta(f.fecha, true)}`;

  async function cambiarMeta(nuevo: string) {
    const v = validarMetaFecha({ fecha: f.fecha, meta: nuevo, nota: f.nota ?? "" }, hoy);
    if (!v.ok) {
      avisar.error(`${que}: ${v.error}`);
      return false;
    }
    return guardar(
      () => createClient().rpc("guardar_meta_fecha" as never, { p_ubicacion_id: f.ubicacionId, p_fecha: f.fecha, p_meta: v.valor.meta, p_nota: v.valor.nota } as never),
      "guardar la meta de la fecha",
      `${que}: ${v.valor.meta === 0 ? "sin meta (no abre)" : solesRedondo(v.valor.meta)}.`,
    );
  }

  async function quitar() {
    setQuitando(true);
    await guardar(
      () => createClient().rpc("guardar_meta_fecha" as never, { p_ubicacion_id: f.ubicacionId, p_fecha: f.fecha, p_meta: null } as never),
      "quitar la meta de la fecha",
      `${que}: quitada, vuelve a regir la semana de ese mes.`,
    );
    setQuitando(false);
  }

  return (
    <tr>
      <td className="fin-ancha" data-l="Fecha">
        <b>{fechaCorta(f.fecha, true)}</b>
        <span className="fin-sub">{diaDe(f.fecha)}</span>
      </td>
      <td data-l="Tienda">{tienda}</td>
      <td className="fin-num" data-l="Meta">
        <Casilla valor={String(f.meta)} etiqueta={`Meta de ${que}`} ancho="w-20" alGuardar={cambiarMeta} />
        {f.meta === 0 && <Chip tono="neutro">no abre</Chip>}
      </td>
      <td data-l="Nota">{f.nota ?? <span className="fin-tenue">—</span>}</td>
      <td className="fin-num" data-l="Quitar">
        <Boton peso="discreto" className="btn-chico" cargando={quitando} textoCargando="Quitando…" onClick={quitar}>
          Quitar
        </Boton>
      </td>
    </tr>
  );
}

function FechasEspeciales({ metas, guardar }: { metas: ConfiguracionMetas; guardar: Guardar }) {
  const [fecha, setFecha] = useState("");
  const [tiendaId, setTiendaId] = useState("");
  const [meta, setMeta] = useState("");
  const [nota, setNota] = useState("");
  const [agregando, setAgregando] = useState(false);
  const nombreDe = (id: string) => metas.tiendas.find((t) => t.id === id)?.nombre ?? "";
  const falta = [!fecha && "la fecha", !tiendaId && "la tienda", meta.trim() === "" && "la meta"].filter(Boolean) as string[];

  async function agregar() {
    const v = validarMetaFecha({ fecha, meta, nota }, metas.hoy);
    if (!v.ok || !tiendaId) {
      avisar.error(v.ok ? "Elige la tienda." : v.error);
      return;
    }
    setAgregando(true);
    const ok = await guardar(
      () => createClient().rpc("guardar_meta_fecha" as never, { p_ubicacion_id: tiendaId, p_fecha: v.valor.fecha, p_meta: v.valor.meta, p_nota: v.valor.nota } as never),
      "guardar la meta de la fecha",
      `${nombreDe(tiendaId)}, ${fechaCorta(v.valor.fecha, true)}: ${v.valor.meta === 0 ? "sin meta (no abre)" : solesRedondo(v.valor.meta)}.`,
    );
    setAgregando(false);
    if (ok) {
      setFecha("");
      setMeta("");
      setNota("");
    }
  }

  return (
    <Superficie className="anim-sube" guia="config.tiendas-fechas">
      <TituloDeTarjeta
        titulo="Fechas especiales"
        bajada="Un día con su propia meta: Nochebuena, Año Nuevo, un feriado. Gana sobre la semana del mes y sobre la campaña. Con 0, esa tienda no abre ese día."
      />
      <div className="fin-tabla-wrap">
        <table className="fin-tabla fin-tabla-apretada">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tienda</th>
              <th className="fin-num">Meta</th>
              <th>Nota</th>
              <th className="fin-num">
                <span className="sr-only">Quitar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {metas.fechas.length === 0 && (
              <tr>
                <td colSpan={5} className="fin-tenue">
                  Todavía no hay fechas especiales. Agrega la primera abajo.
                </td>
              </tr>
            )}
            {metas.fechas.map((f) => (
              <FilaFecha key={`${f.ubicacionId}|${f.fecha}`} f={f} tienda={corto(nombreDe(f.ubicacionId))} hoy={metas.hoy} guardar={guardar} />
            ))}
            <tr>
              <td data-l="Fecha">
                <InputFin type="date" aria-label="Fecha de la meta especial" min={metas.hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </td>
              <td data-l="Tienda">
                <SelectFin
                  etiqueta="Tienda de la meta especial"
                  marcador="Tienda"
                  valor={tiendaId}
                  onValor={setTiendaId}
                  opciones={metas.tiendas.map((t) => ({ valor: t.id, texto: corto(t.nombre) }))}
                />
              </td>
              <td className="fin-num" data-l="Meta">
                <input
                  aria-label="Meta de la fecha especial"
                  inputMode="decimal"
                  /* sugerir-fijo: «Meta» es el nombre de la casilla, no un ejemplo: no depende de nada elegido antes */
                  placeholder="Meta"
                  value={meta}
                  onChange={(e) => setMeta(e.target.value)}
                  className="fin-control fin-num inline-block w-20"
                />
              </td>
              <td data-l="Nota">
                {/* sugerir-fijo: «Nota (opcional)» es el nombre del campo, no un ejemplo: no depende de nada elegido antes */}
                <InputFin aria-label="Nota de la fecha especial" placeholder="Nota (opcional)" maxLength={140} value={nota} onChange={(e) => setNota(e.target.value)} />
              </td>
              <td className="fin-num" data-l="Agregar">
                <Boton peso="fantasma" className="btn-chico" cargando={agregando} textoCargando="Agregando…" disabled={falta.length > 0} onClick={agregar}>
                  + Agregar
                </Boton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PieTabla>
        <span>{falta.length > 0 ? `Para agregar falta: ${falta.join(", ")}.` : "Listo para agregar. Se guarda con el responsable de arriba y queda en la historia."}</span>
      </PieTabla>
    </Superficie>
  );
}

export function ConfiguracionMetasMes({ metas, guardar }: { metas: ConfiguracionMetas; guardar: Guardar }) {
  return (
    <>
      <Superficie className="anim-sube" guia="config.tiendas-meses">
        <TituloDeTarjeta
          titulo="Meta mes por mes"
          bajada="La semana tipo vale todo el año; aquí cada mes puede tener la suya (diciembre vende casi el doble que octubre). Una casilla vacía usa la semana tipo, que se ve en gris."
        />
        {metas.tiendas.map((t) => (
          <div key={t.id} className="fin-tabla-wrap">
            <table className="fin-tabla fin-tabla-apretada">
              <thead>
                <tr>
                  <th>{t.nombre}</th>
                  {DIAS_CORTOS.map((d) => (
                    <th key={d} className="fin-num">
                      {d}
                    </th>
                  ))}
                  <th className="fin-num">Meta del mes</th>
                </tr>
              </thead>
              <tbody>
                {t.meses.map((m, i) => (
                  <FilaMes key={m.mes} tienda={t} mes={m} esActual={i === 0} guardar={guardar} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <PieTabla>
          <span>La meta del mes es la suma de los días, con las fechas especiales y las campañas. Un mes que ya pasó no se cambia.</span>
        </PieTabla>
      </Superficie>

      <FechasEspeciales metas={metas} guardar={guardar} />
    </>
  );
}
