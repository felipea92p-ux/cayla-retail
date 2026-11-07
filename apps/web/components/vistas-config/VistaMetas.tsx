"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Ayuda } from "@/components/Ayuda";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { BotonEnlace, Boton } from "@/components/ui/campos";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Casilla, useGuardarCasilla, type Guardar } from "@/components/ConfiguracionCasilla";
import { InputFin } from "@/components/finanzas/kit";
import { useLuzDelMouse } from "@/components/vitrinas-sedes/useLuzDelMouse";
import { colorDeSede, nombreCortoSede } from "@/lib/finanzas-telar-reglas";
import { fechaCorta, solesRedondo, textoMes } from "@/lib/gastos-reglas";
import {
  DIAS_CORTOS,
  DIAS_SEMANA,
  TEXTO_ESTADO,
  estadoCampana,
  ordenarCampanas,
  parsearMonto,
  parsearPorcentaje,
  validarMetaFecha,
  validarSemanaMes,
  validarTienda,
} from "@/lib/configuracion-reglas";
import type { CampanaConfig, ConfiguracionMetas as DatosMetas, ConfiguracionTiendas as Datos, FechaMeta, TiendaConfig } from "@/lib/configuracion-reglas";
import { semanaConCambio, semanaDelMesConCambio } from "@/lib/metas-frescas-reglas";
import { NO_SE_PUDO_LEER, semanaDelMesFresca, tiendaFresca } from "@/lib/metas-frescas";
import { heredaLoNormal, mesMasAlto, mesTipico, montoCorto, semanaEfectiva, primerPasoMetas } from "@/lib/metas-tubos-reglas";

// Configuración ▸ Metas (Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/; metas por mes y por fecha, ADR-0435): ¿cuánto tiene que vender cada tienda? Una
// barra por mes (`<BarrasTiempo>`, la pieza de las barras por tiempo; «Lo normal» es su píldora) y, al tocarla, los siete días de ese mes: siete casillas en vez de cuarenta y
// dos. Cada casilla se guarda sola al salir de ella, firmada con el responsable, con las mismas funciones de siempre. Los tubos redondos se fueron el 2026-11-07: «parecen
// píldoras» (Felipe).

const conVar = (x: Record<string, string | number>) => x as CSSProperties;
const texto = (n: number | null) => (n === null ? "" : String(n));
const LO_NORMAL = "normal";
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function CampanaFila({ campana, tienda, hoy, guardar }: { campana: CampanaConfig; tienda: TiendaConfig; hoy: string; guardar: Guardar }) {
  const estado = estadoCampana(campana.desde, campana.hasta, hoy);
  const conFechas = estado !== "sin_fechas";
  const fuera = campana.sedes.length > 0 && !campana.sedes.includes(tienda.id);
  const e = TEXTO_ESTADO[estado];
  const ef = campana.efectos[tienda.id];

  async function guardarCelda(campo: "pct" | "fondo", nuevo: string) {
    const pct = parsearPorcentaje(campo === "pct" ? nuevo : ef?.meta_pct ? String(ef.meta_pct) : "");
    if (!pct.ok) {
      avisar.error(`${campana.nombre}, ${tienda.nombre}: ${pct.error}`);
      return false;
    }
    const f = parsearMonto(campo === "fondo" ? nuevo : texto(ef?.fondo ?? null));
    if (!f.ok) {
      avisar.error(`${campana.nombre}, ${tienda.nombre}: fondo — ${f.error}`);
      return false;
    }
    const detalle = campo === "pct" ? `meta ${pct.valor > 0 ? "+" : ""}${pct.valor} %` : `fondo ${f.valor === null ? "normal" : solesRedondo(f.valor)}`;
    return guardar(
      () => createClient().rpc("guardar_efecto_campana" as never, { p_etiqueta_id: campana.id, p_ubicacion_id: tienda.id, p_meta_pct: pct.valor, p_fondo: f.valor } as never),
      `guardar ${campana.nombre} en ${tienda.nombre}`,
      `${campana.nombre} en ${tienda.nombre}: ${detalle}.`,
    );
  }

  return (
    <div className={`cv-fila ${estado === "paso" ? "tenue" : ""}`}>
      <span className="cv-fila-tx">
        <b>{campana.nombre}</b>
        <span className="vs-rotulo">
          {conFechas ? `${fechaCorta(campana.desde)} – ${fechaCorta(campana.hasta)}` : "Sin fechas"}
          {campana.descuentoPct ? ` · ${campana.descuentoPct} %` : ""}
        </span>
      </span>
      {!conFechas ? (
        <span className="vs-rotulo">Ponle fechas en Insignias</span>
      ) : fuera ? (
        <span className="vs-rotulo">No rige aquí</span>
      ) : (
        <span className="cv-par">
          <Casilla valor={ef?.meta_pct ? String(ef.meta_pct) : ""} etiqueta={`Cuánto sube la meta en ${campana.nombre}, ${tienda.nombre}`} ancho="w-[3.6rem]" alGuardar={(n) => guardarCelda("pct", n)} />
          <span className="vs-rotulo">%</span>
          {/* sugerir-fijo: «Fondo» es el nombre de la casilla, no un ejemplo: no depende de nada elegido antes */}
          <Casilla valor={texto(ef?.fondo ?? null)} placeholder="Fondo" etiqueta={`Fondo de caja en ${campana.nombre}, ${tienda.nombre}`} ancho="w-[5rem]" alGuardar={(n) => guardarCelda("fondo", n)} />
        </span>
      )}
      <Chip tono={e.tono}>{e.texto}</Chip>
    </div>
  );
}

function Campanas({ datos, tienda, guardar }: { datos: Datos; tienda: TiendaConfig; guardar: Guardar }) {
  const campanas = useMemo(() => ordenarCampanas(datos.campanas, datos.hoy), [datos]);
  const rigen = campanas.filter((c) => estadoCampana(c.desde, c.hasta, datos.hoy) === "rige");
  const vigentes = campanas.filter((c) => estadoCampana(c.desde, c.hasta, datos.hoy) !== "paso");
  const pasadas = campanas.filter((c) => estadoCampana(c.desde, c.hasta, datos.hoy) === "paso");
  const [abierta, setAbierta] = useState(rigen.length > 0);
  const [verPasadas, setVerPasadas] = useState(false);
  if (!campanas.length) return null;
  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.tiendas-campanas" style={conVar({ "--e": 2 })}>
      <TituloSeccion
        ayuda="Una campaña puede subir la meta y el fondo de cada tienda. Si dos se cruzan, gana la que más sube la meta y el fondo más alto. La caja ve la meta de hoy y, al cerrar, el fondo que tiene que dejar: si deja menos, se le pide confirmar, no se le bloquea."
        accion={<Chip tono={rigen.length ? "ambar" : "neutro"}>{rigen.length ? `Hoy rige ${rigen.map((c) => c.nombre).join(" y ")}` : "Hoy no rige ninguna"}</Chip>}
      >
        Campañas
      </TituloSeccion>
      <FilasDeMas abierto={abierta} id="cv-campanas">
        <div className="cv-filas">
          {vigentes.map((c) => (
            <CampanaFila key={c.id} campana={c} tienda={tienda} hoy={datos.hoy} guardar={guardar} />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BotonEnlace href="/productos/insignias" className="btn-chico">
              Nueva campaña en Insignias
            </BotonEnlace>
            {pasadas.length > 0 && <BotonVerMas forma="enlace" abierto={verPasadas} onCambiar={setVerPasadas} texto={pasadas.length === 1 ? "Ver la que ya pasó" : `Ver las ${pasadas.length} que ya pasaron`} controla="cv-pasadas" />}
          </div>
          <FilasDeMas abierto={verPasadas} id="cv-pasadas">
            <div className="cv-filas sin-margen">
              {pasadas.map((c) => (
                <CampanaFila key={c.id} campana={c} tienda={tienda} hoy={datos.hoy} guardar={guardar} />
              ))}
            </div>
          </FilasDeMas>
        </div>
      </FilasDeMas>
      <BotonVerMas abierto={abierta} onCambiar={setAbierta} texto={vigentes.length === 1 ? "Ver la que viene" : vigentes.length ? `Ver las ${vigentes.length} que vienen` : "Ver las campañas"} controla="cv-campanas" className="cv-ver-mas" />
    </section>
  );
}

function DiaEspecial({ f, tienda, hoy, guardar }: { f: FechaMeta; tienda: string; hoy: string; guardar: Guardar }) {
  const [quitando, setQuitando] = useState(false);
  const que = `${tienda}, ${fechaCorta(f.fecha, true)}`;
  const [dia, mes] = fechaCorta(f.fecha).split(" ");

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
    <div className="cv-boleto">
      <span className="cv-cal" aria-hidden>
        <b>{dia}</b>
        <small>{mes}</small>
      </span>
      <span className="cv-fila-tx">
        <b>{f.meta === 0 ? "No abre" : (f.nota ?? "Día especial")}</b>
        <Boton peso="discreto" className="btn-chico cv-quitar" cargando={quitando} textoCargando="Quitando…" onClick={quitar} aria-label={`Quitar ${que}`}>
          Quitar
        </Boton>
      </span>
      <Casilla valor={String(f.meta)} etiqueta={`Meta de ${que}`} ancho="w-20" alGuardar={cambiarMeta} />
    </div>
  );
}

function AgregarDia({ tienda, hoy, guardar }: { tienda: TiendaConfig; hoy: string; guardar: Guardar }) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [meta, setMeta] = useState("");
  const [nota, setNota] = useState("");
  const [agregando, setAgregando] = useState(false);
  const falta = [!fecha && "la fecha", meta.trim() === "" && "la meta"].filter(Boolean) as string[];

  if (!abierto) {
    return (
      <button type="button" className="cv-boleto nuevo" onClick={() => setAbierto(true)} data-guia="config.tiendas-agregar-dia">
        <Plus aria-hidden className="h-4 w-4" />
        Agregar un día
      </button>
    );
  }

  async function agregar() {
    const v = validarMetaFecha({ fecha, meta, nota }, hoy);
    if (!v.ok) {
      avisar.error(v.error);
      return;
    }
    setAgregando(true);
    const ok = await guardar(
      () => createClient().rpc("guardar_meta_fecha" as never, { p_ubicacion_id: tienda.id, p_fecha: v.valor.fecha, p_meta: v.valor.meta, p_nota: v.valor.nota } as never),
      "guardar la meta de la fecha",
      `${tienda.nombre}, ${fechaCorta(v.valor.fecha, true)}: ${v.valor.meta === 0 ? "sin meta (no abre)" : solesRedondo(v.valor.meta)}.`,
    );
    setAgregando(false);
    if (ok) {
      setFecha("");
      setMeta("");
      setNota("");
      setAbierto(false);
    }
  }

  return (
    <div className="cv-boleto formulario">
      <InputFin type="date" aria-label="Fecha de la meta especial" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      {/* sugerir-fijo: «Meta» es el nombre de la casilla, no un ejemplo: no depende de nada elegido antes */}
      <InputFin aria-label="Meta de la fecha especial" inputMode="decimal" placeholder="Meta" value={meta} onChange={(e) => setMeta(e.target.value)} />
      {/* sugerir-fijo: «Nota (opcional)» es el nombre de la casilla, no un ejemplo: no depende de nada elegido antes */}
      <InputFin aria-label="Nota de la fecha especial" placeholder="Nota (opcional)" maxLength={140} value={nota} onChange={(e) => setNota(e.target.value)} />
      <span className="cv-par">
        <Boton peso="fantasma" className="btn-chico" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
        <Boton peso="primario" className="btn-chico" cargando={agregando} textoCargando="Agregando…" disabled={falta.length > 0} title={falta.length ? `Falta ${falta.join(" y ")}` : undefined} onClick={agregar}>
          Agregar
        </Boton>
      </span>
    </div>
  );
}

export function VistaMetas({ datos, metas, metaDeHoy }: { datos: Datos; metas: DatosMetas | null; metaDeHoy: Record<string, number | null> }) {
  const { responsable, guardando, guardar } = useGuardarCasilla();
  const raiz = useRef<HTMLDivElement>(null);
  useLuzDelMouse(raiz);
  const [sedeId, setSedeId] = useState(datos.tiendas[0]?.id ?? "");
  const tienda = datos.tiendas.find((t) => t.id === sedeId) ?? datos.tiendas[0];
  const tMetas = metas?.tiendas.find((t) => t.id === tienda?.id) ?? null;
  const meses = useMemo(() => tMetas?.meses ?? [], [tMetas]);
  const [elegido, setElegido] = useState<string>(tienda && heredaLoNormal(tienda.metas) ? LO_NORMAL : (meses[0]?.mes ?? LO_NORMAL));

  if (!tienda) return <div className="nota-cayla">No hay tiendas activas para configurar.</div>;

  const normal = tienda.metas;
  const primerPaso = primerPasoMetas(normal);
  const totalNormal = mesTipico(normal);
  const mes = meses.find((m) => m.mes === elegido) ?? null;
  const esNormal = !mes;
  const propia = mes ? mes.metas : normal;
  const hereda = !esNormal && heredaLoNormal(propia);
  const efectiva = esNormal ? normal : semanaEfectiva(propia, normal);
  const alto = mesMasAlto(meses);
  const fechas = (metas?.fechas ?? []).filter((f) => f.ubicacionId === tienda.id);
  const nombreDelMes = (iso: string) => textoMes(iso.slice(0, 7));

  async function guardarDia(i: number, nuevo: string) {
    if (!mes) {
      const fresca = await tiendaFresca(tienda!.id);
      if (!fresca) {
        avisar.error(NO_SE_PUDO_LEER);
        return false;
      }
      const v = validarTienda(semanaConCambio(fresca, i, nuevo));
      if (!v.ok) {
        avisar.error(`${tienda!.nombre}: ${v.error}`);
        return false;
      }
      const valorNuevo = v.valor.metas[i];
      return guardar(
        () => createClient().rpc("guardar_metas_tienda" as never, { p_ubicacion_id: tienda!.id, p_metas: v.valor.metas, p_fondo: v.valor.fondo } as never),
        "guardar las metas",
        `Meta del ${DIAS_SEMANA[i]!.toLowerCase()} de ${tienda!.nombre}: ${valorNuevo === null || valorNuevo === undefined ? "sin meta" : solesRedondo(valorNuevo)}. La meta del mes se recalculó.`,
      );
    }
    const fresca = await semanaDelMesFresca(tienda!.id, mes.mes);
    if (!fresca) {
      avisar.error(NO_SE_PUDO_LEER);
      return false;
    }
    const v = validarSemanaMes(semanaDelMesConCambio(fresca, i, nuevo));
    if (!v.ok) {
      avisar.error(`${tienda!.nombre}, ${nombreDelMes(mes.mes)}: ${v.error}`);
      return false;
    }
    const valorNuevo = v.valor[i];
    return guardar(
      () => createClient().rpc("guardar_metas_mes" as never, { p_ubicacion_id: tienda!.id, p_mes: mes.mes, p_metas: v.valor } as never),
      "guardar la meta del mes",
      `${DIAS_SEMANA[i]} de ${nombreDelMes(mes.mes)} en ${tienda!.nombre}: ${valorNuevo === null || valorNuevo === undefined ? "usa lo normal" : solesRedondo(valorNuevo)}. La meta del mes se recalculó.`,
    );
  }

  const hoyMeta = metaDeHoy[tienda.id] ?? null;
  const esteMes = meses[0]?.total ?? tienda.metaMes;

  return (
    <div className="vs-raiz" ref={raiz}>
      <div className="vs-firma" data-guia="config.guardado">
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </div>

      <div className="cv-cifras">
        {hoyMeta !== null ? <TarjetaCifra etiqueta="Hoy" valor={solesRedondo(hoyMeta)} /> : <TarjetaCifra etiqueta="Hoy" valor={null}>Sin meta para hoy.</TarjetaCifra>}
        {esteMes !== null ? <TarjetaCifra etiqueta="Este mes" valor={solesRedondo(esteMes)} /> : <TarjetaCifra etiqueta="Este mes" valor={null}>Sin metas cargadas.</TarjetaCifra>}
        {alto ? <TarjetaCifra etiqueta="El mes más alto" valor={<span className="capitalize">{nombreDelMes(alto.mes).split(" ")[0]}</span>} /> : <TarjetaCifra etiqueta="El mes más alto" valor={null}>Sin metas por mes.</TarjetaCifra>}
      </div>

      <section className="vs-liquido cv-bloque" data-luz data-color={colorDeSede({ nombre: tienda.nombre, tipo: "tienda" })} data-guia="config.tiendas-meses" style={conVar({ "--e": 0 })}>
        <TituloSeccion
          ayuda="Con IGV. Cada mes usa lo normal, salvo los días que le cambies: una fecha especial manda sobre el mes, y el mes sobre lo normal."
          accion={
            <span role="group" aria-label="Tienda" className="flex flex-wrap gap-2">
              {datos.tiendas.map((t) => (
                <button key={t.id} type="button" className="pildora-cayla" aria-pressed={t.id === tienda.id} onClick={() => setSedeId(t.id)}>
                  {nombreCortoSede(t.nombre)}
                </button>
              ))}
            </span>
          }
        >
          Cuánto vender
        </TituloSeccion>

        {primerPaso && <p className="cv-primer-paso">{primerPaso}</p>}
        <div className="cv-meses">
          <button type="button" className="pildora-cayla" aria-pressed={esNormal} data-guia="config.tiendas-normal" aria-label={`Lo normal: ${totalNormal === null ? "sin meta" : solesRedondo(totalNormal)} al mes, aproximado`} onClick={() => setElegido(LO_NORMAL)}>
            Lo normal · {montoCorto(totalNormal)}
          </button>
          <BarrasTiempo
            className="cv-meses-barras"
            alto={132}
            cifras="todas"
            destacada={esNormal ? null : elegido}
            respuesta={{ onElegir: setElegido }}
            etiqueta={`Meta de cada mes en ${tienda.nombre}`}
            barras={meses.map((m) => ({
              clave: m.mes,
              valor: m.total ?? 0,
              etiqueta: mayuscula(nombreDelMes(m.mes).slice(0, 3)),
              cifra: montoCorto(m.total),
              aria: `${mayuscula(nombreDelMes(m.mes))}: ${m.total === null ? "sin meta" : solesRedondo(m.total)}${heredaLoNormal(m.metas) ? ", usa lo normal" : ""}${m.mes === elegido ? ". A la vista" : ""}`,
            }))}
          />
        </div>

        <div className="cv-semana-t">
          <b>{mes ? mayuscula(nombreDelMes(mes.mes)) : "Lo normal"}</b>
          <span className="vs-rotulo">{esNormal ? "Vale todo el año, salvo el mes que tenga su propia semana." : hereda ? "Usa lo normal. Escribe solo el día que cambia." : "Tiene su propia semana."}</span>
        </div>
        <div className="cv-semana">
          <div className="cv-semana-in">
            <BarrasTiempo
              decorativa
              alto={72}
              cifras="ninguna"
              etiqueta="La semana"
              barras={DIAS_CORTOS.map((d, i) => ({
                clave: d,
                valor: efectiva[i] ?? 0,
                etiqueta: d,
                // En un mes, el día que cambia va en tinta; el que usa lo normal, en arena.
                tono: !esNormal && propia[i] !== null ? ("tinta" as const) : undefined,
              }))}
            />
            <div className="cv-dias">
              {DIAS_CORTOS.map((d, i) => (
                <Casilla
                  key={`${tienda.id}|${elegido}|${i}`}
                  valor={texto(propia[i] ?? null)}
                  etiqueta={`Meta del ${DIAS_SEMANA[i]!.toLowerCase()} de ${mes ? nombreDelMes(mes.mes) : "lo normal"} en ${tienda.nombre}`}
                  ancho="w-full"
                  placeholder={esNormal || normal[i] === null ? "—" : String(normal[i])}
                  alGuardar={(n) => guardarDia(i, n)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {metas && (
        <section className="vs-liquido cv-bloque" data-luz data-guia="config.tiendas-fechas" style={conVar({ "--e": 1 })}>
          <TituloSeccion ayuda="Un día con su propia meta, como Nochebuena o un feriado. Manda sobre el mes y la campaña. Con 0, la tienda no abre." cuenta={fechas.length || undefined}>
            Días especiales
          </TituloSeccion>
          <div className="cv-boletos">
            {fechas.map((f) => (
              <DiaEspecial key={`${f.ubicacionId}|${f.fecha}`} f={f} tienda={nombreCortoSede(tienda.nombre)} hoy={metas.hoy} guardar={guardar} />
            ))}
            <AgregarDia key={tienda.id} tienda={tienda} hoy={metas.hoy} guardar={guardar} />
          </div>
        </section>
      )}

      <Campanas datos={datos} tienda={tienda} guardar={guardar} />
    </div>
  );
}
