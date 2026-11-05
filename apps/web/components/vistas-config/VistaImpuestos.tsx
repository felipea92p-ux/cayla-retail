"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton, Desplegable } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Casilla, CasillaManual } from "@/components/ConfiguracionCasilla";
import { GotaDinero, type TrazoDinero } from "@/components/vistas-config/IconosDinero";
import { NuevaVigenciaModal, type GuardarParametro, type VigenciaNueva } from "@/components/vistas-config/NuevaVigenciaModal";
import { useLuzDelMouse } from "@/components/vitrinas-sedes/useLuzDelMouse";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fechaCorta, solesRedondo, textoMes } from "@/lib/gastos-reglas";
import { REGIMENES, TEXTO_REGIMEN, aniosDeRegimen, delAnio, diaDelRegistro, parsearParametro, porcentaje, valorEnCasilla, vigenteEnAnio, type NombreEscalaRenta, type NombreParametro, type PanelImpuestos, type ParametroFila, type Regimen } from "@/lib/impuestos-reglas";
import { RENTA_PREVIA, clavePendiente, escalaDeRenta, limiteParaDibujar, pendientesDelContador, valorDeFila, valorLegible } from "@/lib/impuestos-config-reglas";

// Configuración ▸ Impuestos (ADR-0195 F8; Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/): primero lo que falta confirmar con el contador, después el límite
// del año con lo vendido, las tres tasas y, plegado, lo de arranque. Las casillas se guardan solas al salir, firmadas con el responsable; las del año llevan su «Guardar» (Felipe
// 2026-10-31). En la base solo se agregan filas: una corrección es una fila nueva. El tope de la planilla de movilidad (ADR-0362) lo fija el contador: sin él, nada se marca.

type NombreCasilla = Exclude<NombreParametro, "regimen" | NombreEscalaRenta>;
type GuardarCasilla = (nombre: NombreCasilla, vigenteDesde: string, que: string) => (tipeado: string) => Promise<boolean>;

const conVar = (x: Record<string, string | number>) => x as CSSProperties;

/** Quién puso el valor: al pasar el mouse. La historia completa está en Actividad. */
function quienLoPuso(p: ParametroFila | null): string | undefined {
  if (!p?.registradoPor) return p?.nota ?? undefined;
  const dia = diaDelRegistro(p.registradoEn);
  return `${p.correcciones > 0 ? "Corregido" : "Puesto"} por ${p.registradoPor}${dia ? ` · ${dia}` : ""}`;
}

function PorConfirmar({ parametros, guardar }: { parametros: ParametroFila[]; guardar: GuardarParametro }) {
  // La lista se fija al entrar, para que lo recién confirmado se quede con su marca y no se vaya de la pantalla mientras se está mirando.
  const [lista] = useState(() => pendientesDelContador(parametros));
  const [enCurso, setEnCurso] = useState<string | null>(null);
  if (!lista.length) return null;
  const sigue = new Set(parametros.filter((p) => p.provisional).map(clavePendiente));
  const faltan = lista.filter((p) => sigue.has(p.clave)).length;
  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.impuestos-confirmar" style={conVar({ "--e": 0 })}>
      <TituloSeccion
        ayuda="Son los valores con los que arrancó el sistema. Pregúntale a tu contador: si está bien, «Ya lo confirmó»; si no, cámbialo abajo. Hasta entonces, las cuentas se hacen igual con estos valores."
        dato={`${lista.length - faltan} de ${lista.length}`}
      >
        {faltan ? `Falta confirmar ${faltan} con el contador` : "El contador ya lo confirmó todo"}
      </TituloSeccion>
      <div className="cv-tarjetas">
        {lista.map((p, i) => (
          <div key={p.clave} className="cv-fila cv-tope" style={conVar({ "--i": i })}>
            <span className="vs-textos">
              <span className="vs-rotulo">{p.que}</span>
              <span className="cv-nombre">{valorDeFila(parametros.find((x) => clavePendiente(x) === p.clave) ?? p.parametro)}</span>
            </span>
            {sigue.has(p.clave) ? (
              <Boton
                peso="fantasma"
                type="button"
                cargando={enCurso === p.clave}
                disabled={enCurso !== null}
                onClick={async () => {
                  setEnCurso(p.clave);
                  await guardar(p.parametro.nombre, p.parametro.vigenteDesde, p.parametro.valor, p.parametro.texto, `${p.que}: confirmado.`);
                  setEnCurso(null);
                }}
              >
                Ya lo confirmó
              </Boton>
            ) : (
              <Chip tono="verde">Confirmado</Chip>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

type CampoAnio = "regimen" | "umbral" | "aviso" | "renta";
const CAMPOS_ANIO: readonly CampoAnio[] = ["regimen", "umbral", "aviso", "renta"];
const PARAMETRO_DE: Record<Exclude<CampoAnio, "regimen">, NombreCasilla> = { umbral: "umbral_uit", aviso: "aviso_umbral_uit", renta: "renta_pago_cuenta" };
const NOMBRE_DE: Record<CampoAnio, string> = { regimen: "Régimen", umbral: "Límite", aviso: "Aviso", renta: "Pago a cuenta" };

function ElAnio({ anio, parametros, umbral, guardar }: { anio: number; parametros: ParametroFila[]; umbral: PanelImpuestos["umbral"] | null; guardar: GuardarParametro }) {
  const router = useRouter();
  const desde = `${anio}-01-01`;
  const filas = {
    regimen: delAnio(parametros, "regimen", anio),
    umbral: delAnio(parametros, "umbral_uit", anio),
    renta: delAnio(parametros, "renta_pago_cuenta", anio),
    aviso: delAnio(parametros, "aviso_umbral_uit", anio),
  };
  const avisoVigente = vigenteEnAnio(parametros, "aviso_umbral_uit", anio);
  const regimenVigente = vigenteEnAnio(parametros, "regimen", anio);
  const umbralVigente = vigenteEnAnio(parametros, "umbral_uit", anio);
  const rentaVigente = vigenteEnAnio(parametros, "renta_pago_cuenta", anio);
  const uitVigente = vigenteEnAnio(parametros, "uit", anio);
  const propios = CAMPOS_ANIO.map((c) => filas[c]).filter((p): p is ParametroFila => !!p);

  // Lo guardado y el borrador: nada se escribe en la base hasta apretar «Guardar» (Felipe 2026-10-31). Si lo guardado cambia (se guardó, o se refrescó la pantalla), el borrador
  // vuelve a lo que dice la base.
  const guardado: Record<CampoAnio, string> = {
    regimen: filas.regimen?.texto ?? "",
    umbral: filas.umbral ? valorEnCasilla(filas.umbral) : "",
    aviso: filas.aviso ? valorEnCasilla(filas.aviso) : "",
    renta: filas.renta ? valorEnCasilla(filas.renta) : "",
  };
  const [borrador, setBorrador] = useState(guardado);
  const [guardandoAnio, setGuardandoAnio] = useState(false);
  const huella = CAMPOS_ANIO.map((c) => guardado[c]).join("|");
  const [huellaVista, setHuellaVista] = useState(huella);
  if (huella !== huellaVista) {
    setHuellaVista(huella);
    setBorrador(guardado);
  }

  const cambiados = CAMPOS_ANIO.filter((c) => borrador[c].trim() !== guardado[c].trim());
  // Lo que arrancó provisional se confirma con el mismo valor: la base solo lo deja de marcar al volver a escribirlo.
  const aGuardar = CAMPOS_ANIO.filter((c) => cambiados.includes(c) || filas[c]?.provisional);
  const limite = limiteParaDibujar(umbral, anio);
  const enSoles = uitVigente?.valor && umbralVigente?.valor ? uitVigente.valor * umbralVigente.valor : null;
  const avisoEnSoles = uitVigente?.valor && avisoVigente?.valor ? uitVigente.valor * avisoVigente.valor : null;
  const estado = cambiados.length
    ? { tono: "ambar" as const, texto: "Sin guardar" }
    : !propios.length
      ? { tono: "neutro" as const, texto: regimenVigente || umbralVigente ? "Sigue el año anterior" : "Sin configurar" }
      : propios.some((p) => p.provisional)
        ? { tono: "ambar" as const, texto: "Por confirmar" }
        : { tono: "verde" as const, texto: "Confirmado" };

  async function guardarAnio() {
    if (guardandoAnio || !aGuardar.length) return;
    // Primero se valida todo: un error de tipeo no deja el año a medio guardar.
    const listos: { nombre: NombreParametro; valor: number | null; texto: string | null }[] = [];
    for (const c of aGuardar) {
      if (c === "regimen") {
        if (!borrador.regimen) {
          avisar.error(`${NOMBRE_DE.regimen} de ${anio}: elige un régimen.`);
          return;
        }
        listos.push({ nombre: "regimen", valor: null, texto: borrador.regimen });
        continue;
      }
      const v = parsearParametro(PARAMETRO_DE[c], borrador[c]);
      if (!v.ok) {
        avisar.error(`${NOMBRE_DE[c]} de ${anio}: ${v.error}`);
        return;
      }
      listos.push({ nombre: PARAMETRO_DE[c], valor: v.valor, texto: null });
    }
    setGuardandoAnio(true);
    let hechos = 0;
    for (const l of listos) {
      if (!(await guardar(l.nombre, desde, l.valor, l.texto, null))) break;
      hechos++;
    }
    setGuardandoAnio(false);
    if (hechos) router.refresh();
    if (hechos === listos.length) avisar.exito(cambiados.length ? `Impuestos de ${anio}: guardado.` : `Impuestos de ${anio}: confirmado.`);
  }

  const poner = (c: CampoAnio) => (nuevo: string) => setBorrador((b) => ({ ...b, [c]: nuevo }));

  return (
    <>
      <div className="cv-reg">
        <div>
          <span className="vs-rotulo">Régimen {anio}: cómo tributa CAYLA</span>
          {/* Sin régimen propio para ese año, el marcador dice cuál rige («Como antes: …»). */}
          <Desplegable
            forma="campo"
            className="cv-combo"
            etiquetaAccesible={`Régimen de renta de ${anio}`}
            valor={borrador.regimen as Regimen}
            onValor={(v) => poner("regimen")(v)}
            marcador={regimenVigente ? `Como antes: ${TEXTO_REGIMEN[regimenVigente.texto as Regimen] ?? regimenVigente.texto}` : "Elige…"}
            opciones={REGIMENES.map((r) => ({ valor: r, texto: TEXTO_REGIMEN[r] }))}
          />
        </div>
        {limite && (
          <>
            <div>
              <span className="vs-rotulo">Vendido este año</span>
              <b>{solesRedondo(limite.vendido)}</b>
            </div>
            <div>
              <span className="vs-rotulo">{limite.quedan > 0 ? "Te quedan" : "Pasaste el límite"}</span>
              <b className={limite.tono === "rojo" ? "text-rojo" : limite.tono === "ambar" ? "cv-falta-txt" : undefined}>{solesRedondo(limite.quedan)}</b>
            </div>
          </>
        )}
      </div>
      {limite && (
        <div className="cv-limite">
          <BarraAvance pct={limite.pct} alto="gruesa" tono={limite.tono} marca={limite.avisoPct} etiqueta={`Vendido: ${porcentaje(limite.pct / 100, 0)} del límite del año`} />
          <div className="cv-escala" aria-hidden>
            {limite.avisoPct !== null && avisoVigente?.valor && (
              <span className="aviso" style={conVar({ "--x": `${limite.avisoPct}%` })}>
                Te avisa · {avisoVigente.valor} UIT
              </span>
            )}
            <span className="tope">Límite · {umbralVigente?.valor ?? "—"} UIT</span>
          </div>
        </div>
      )}
      <div className="cv-tarjetas cv-tres-casillas">
        <div className="cv-fila cv-tope" style={conVar({ "--i": 0 })}>
          <span className="vs-textos">
            <span className="cv-frase">Límite</span>
            <span className="vs-rotulo">{enSoles !== null ? `${solesRedondo(enSoles)} en ventas del año` : "Ventas del año"}</span>
          </span>
          <CasillaManual valor={borrador.umbral} guardado={guardado.umbral} onValor={poner("umbral")} onEnter={guardarAnio} bloqueada={guardandoAnio} placeholder={umbralVigente ? valorEnCasilla(umbralVigente) : "—"} etiqueta={`Límite de ventas de ${anio}, en UIT`} ancho="w-20" />
          <span className="cv-unidad">UIT</span>
        </div>
        <div className="cv-fila cv-tope" style={conVar({ "--i": 1 })}>
          <span className="vs-textos">
            <span className="cv-frase">Aviso</span>
            <span className="vs-rotulo">{avisoEnSoles !== null ? `${solesRedondo(avisoEnSoles)}: te avisa antes del límite` : "Te avisa antes del límite"}</span>
          </span>
          <CasillaManual valor={borrador.aviso} guardado={guardado.aviso} onValor={poner("aviso")} onEnter={guardarAnio} bloqueada={guardandoAnio} placeholder={avisoVigente ? valorEnCasilla(avisoVigente) : "—"} etiqueta={`Aviso anticipado de ${anio}, en UIT de ventas del año`} ancho="w-20" />
          <span className="cv-unidad">UIT</span>
        </div>
        <div className="cv-fila cv-tope" style={conVar({ "--i": 2 })}>
          <span className="vs-textos">
            <span className="cv-frase">Pago a cuenta</span>
            <span className="vs-rotulo">Adelanto de renta sobre lo vendido cada mes</span>
          </span>
          <CasillaManual valor={borrador.renta} guardado={guardado.renta} onValor={poner("renta")} onEnter={guardarAnio} bloqueada={guardandoAnio} placeholder={rentaVigente ? valorEnCasilla(rentaVigente) : "—"} etiqueta={`Pago a cuenta de renta de ${anio}, en %`} ancho="w-20" />
          <span className="cv-unidad">%</span>
        </div>
      </div>
      <div className="cv-pie-bloque">
        <Chip tono={estado.tono}>{estado.texto}</Chip>
        <Boton
          peso={cambiados.length ? "primario" : "fantasma"}
          type="button"
          cargando={guardandoAnio}
          disabled={!aGuardar.length}
          onClick={() => void guardarAnio()}
          title={cambiados.length ? "Guarda los cambios de este año" : aGuardar.length ? "Confirma con el valor que ya tiene: deja de decir «Por confirmar»" : "No hay nada que guardar"}
        >
          {cambiados.length || !aGuardar.length ? "Guardar" : "Confirmar"}
        </Boton>
      </div>
    </>
  );
}

function LimiteDelAnio({ parametros, anioActual, umbral, guardar }: { parametros: ParametroFila[]; anioActual: number; umbral: PanelImpuestos["umbral"] | null; guardar: GuardarParametro }) {
  const [extra, setExtra] = useState<number[]>([]);
  const [anio, setAnio] = useState(anioActual);
  const anios = aniosDeRegimen(parametros, anioActual, extra);
  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.impuestos-regimen" style={conVar({ "--e": 1 })}>
      <TituloSeccion
        ayuda="El régimen rige desde el 1 de enero; vacío sigue lo del año anterior. Pasado el límite, SUNAT pide Diario y Mayor completos; el aviso salta antes, para hablar con el contador a tiempo. El pago a cuenta sale de la venta neta de cada mes. «Vendido» es sin IGV, lo registrado en el sistema de enero a hoy. La retención del recibo por honorarios la define el contador: cuando la confirme, se configura aquí."
        accion={
          <span className="cv-par flex-wrap">
            {anios.map((a) => (
              <button key={a} type="button" className="pildora-cayla" aria-pressed={a === anio} onClick={() => setAnio(a)}>
                {a}
              </button>
            ))}
            <button
              type="button"
              className="btn-cayla btn-sutil"
              onClick={() => {
                const nuevo = Math.max(...anios) + 1;
                setExtra((x) => [...x, nuevo]);
                setAnio(nuevo);
              }}
            >
              + Año nuevo
            </button>
          </span>
        }
      >
        El límite de ventas del año
      </TituloSeccion>
      <ElAnio key={anio} anio={anio} parametros={parametros} umbral={umbral} guardar={guardar} />
    </section>
  );
}

/** Una vigencia con su casilla: la gota dice qué es; lo que se lee, desde cuándo. */
function Vigencia({ p, trazo, etiqueta, i, antes, despues, children }: { p: ParametroFila | null; trazo: TrazoDinero; etiqueta: ReactNode; i: number; antes?: string; despues?: string; children: ReactNode }) {
  return (
    <div className="cv-fila cv-vig" title={quienLoPuso(p)} style={conVar({ "--i": i })}>
      <GotaDinero trazo={trazo} i={i} />
      <span className="vs-textos">
        <span className="cv-frase">{etiqueta}</span>
        {p?.provisional && <span className="vs-rotulo cv-falta-txt">Por confirmar</span>}
      </span>
      {antes && <span className="cv-unidad">{antes}</span>}
      {children}
      {despues && <span className="cv-unidad">{despues}</span>}
    </div>
  );
}

function ordenado(parametros: readonly ParametroFila[], nombre: NombreParametro) {
  return parametros.filter((p) => p.nombre === nombre).sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
}

function Tasas({ parametros, anioActual, casilla, abrir }: { parametros: ParametroFila[]; anioActual: number; casilla: GuardarCasilla; abrir: (n: VigenciaNueva) => void }) {
  const [aniosUitExtra, setAniosUitExtra] = useState<number[]>([]);
  const tasas = ordenado(parametros, "igv");
  const topes = ordenado(parametros, "tope_planilla_movilidad");
  const aniosUit = [...new Set([...ordenado(parametros, "uit").map((u) => Number(u.vigenteDesde.slice(0, 4))), ...aniosUitExtra])].sort((a, b) => b - a);
  return (
    <div className="cv-tres">
      <section className="vs-liquido cv-bloque" data-luz data-guia="config.impuestos-igv" style={conVar({ "--e": 2 })}>
        <TituloSeccion ayuda="La tasa con la que se calcula el IGV de los gastos con factura. Solo se agregan filas: el pasado no se reescribe.">IGV</TituloSeccion>
        <p className="vs-rotulo cv-consecuencia">El impuesto que va en cada factura</p>
        <div className="cv-filas">
          {tasas.map((t, i) => (
            <Vigencia key={t.vigenteDesde} p={t} trazo="porcentaje" etiqueta={`Desde ${fechaCorta(t.vigenteDesde, true)}`} i={i} despues="%">
              <Casilla valor={valorEnCasilla(t)} etiqueta={`Tasa de IGV desde el ${fechaCorta(t.vigenteDesde, true)}`} ancho="w-16" alGuardar={casilla("igv", t.vigenteDesde, `IGV desde el ${fechaCorta(t.vigenteDesde, true)}`)} />
            </Vigencia>
          ))}
        </div>
        <button type="button" className="btn-cayla btn-sutil mt-3" onClick={() => abrir("igv")} aria-haspopup="dialog" data-guia="config.nueva-tasa">
          + Nueva tasa
        </button>
      </section>

      <section className="vs-liquido cv-bloque" data-luz data-guia="config.impuestos-uit" style={conVar({ "--e": 3 })}>
        <TituloSeccion ayuda="La medida de SUNAT: marca el límite de ventas del régimen y la renta. Cada año tiene la suya.">UIT</TituloSeccion>
        <p className="vs-rotulo cv-consecuencia">La medida de SUNAT para los límites</p>
        <div className="cv-filas">
          {aniosUit.map((anio, i) => {
            const u = delAnio(parametros, "uit", anio);
            return (
              <Vigencia key={anio} p={u} trazo="regla" etiqueta={anio} i={i} antes="S/">
                <Casilla valor={u ? valorEnCasilla(u) : ""} etiqueta={`UIT de ${anio}`} ancho="w-24" alGuardar={casilla("uit", `${anio}-01-01`, `UIT ${anio}`)} />
              </Vigencia>
            );
          })}
        </div>
        <button type="button" className="btn-cayla btn-sutil mt-3" onClick={() => setAniosUitExtra((a) => [...a, Math.max(anioActual, ...aniosUit) + 1])}>
          + UIT de un año nuevo
        </button>
      </section>

      <section className="vs-liquido cv-bloque" data-luz data-guia="config.impuestos-tope" style={conVar({ "--e": 4 })}>
        <TituloSeccion ayuda="Cuánto se acepta por persona y por día en taxis y cargadores sin comprobante. Lo fija el contador: lo que pase se deja registrar y queda «no deducible». Mientras no haya tope, no se marca nada.">Movilidad</TituloSeccion>
        <p className="vs-rotulo cv-consecuencia">Tope diario de taxis y cargadores sin comprobante</p>
        <div className="cv-filas">
          {topes.length === 0 ? (
            <Vigencia p={null} trazo="movilidad" etiqueta={<span className="cv-falta-txt">Falta el tope por día</span>} i={0}>
              <span />
            </Vigencia>
          ) : (
            topes.map((t, i) => (
              <Vigencia key={t.vigenteDesde} p={t} trazo="movilidad" etiqueta={`Desde ${fechaCorta(t.vigenteDesde, true)}`} i={i} antes="S/">
                <Casilla valor={valorEnCasilla(t)} etiqueta={`Tope de la planilla desde el ${fechaCorta(t.vigenteDesde, true)}, en soles`} ancho="w-20" alGuardar={casilla("tope_planilla_movilidad", t.vigenteDesde, `Tope de la planilla desde el ${fechaCorta(t.vigenteDesde, true)}`)} />
              </Vigencia>
            ))
          )}
        </div>
        <button type="button" className="btn-cayla btn-sutil mt-3" onClick={() => abrir("tope_planilla_movilidad")} aria-haspopup="dialog" data-guia="config.nuevo-tope">
          {topes.length ? "+ Tope desde una fecha" : "+ Poner el tope"}
        </button>
      </section>
    </div>
  );
}

function ParaArrancar({ parametros, anioActual, casilla, abrir }: { parametros: ParametroFila[]; anioActual: number; casilla: GuardarCasilla; abrir: (n: VigenciaNueva) => void }) {
  const [abierto, setAbierto] = useState(false);
  const saldos = ordenado(parametros, "saldo_favor_igv");
  // El ajuste y lo de antes del sistema rigen por año exacto: se listan los años que ya tienen algo y el año en curso, aunque no se haya cargado.
  const aniosPrevias = [...new Set([...parametros.filter((p) => p.nombre === "ventas_previas_erp").map((p) => Number(p.vigenteDesde.slice(0, 4))), anioActual])].sort((a, b) => b - a);
  const aniosRenta = [...new Set([...parametros.filter((p) => RENTA_PREVIA.some((r) => r.nombre === p.nombre)).map((p) => Number(p.vigenteDesde.slice(0, 4))), anioActual])].sort((a, b) => b - a);
  const escala = escalaDeRenta(parametros, anioActual);
  return (
    <section className="vs-liquido cv-bloque" data-luz style={conVar({ "--e": 5 })}>
      <TituloSeccion
        ayuda="Se llena una vez, con la última declaración y lo que te dé el contador."
        accion={saldos.length === 0 ? <Chip tono="ambar">Falta el saldo a favor</Chip> : undefined}
      >
        Para arrancar
      </TituloSeccion>
      <p className="vs-rotulo cv-consecuencia">Se llena una vez, con la última declaración</p>
      <FilasDeMas abierto={abierto} id="cv-arranque">
        <div className="cv-subgrupo" data-guia="config.impuestos-saldo">
          <TituloGrupo nota="de la última declaración">Saldo a favor de IGV</TituloGrupo>
          {saldos.length === 0 ? (
            <Vacio tamano="chico" icono={<Receipt />}>
              Tu contador lo ve en la última declaración. Sin él, el IGV puede salir de más.
            </Vacio>
          ) : (
            <div className="cv-tarjetas sin-margen">
              {saldos.map((t, i) => (
                <div key={t.vigenteDesde} className="cv-fila cv-tope cv-corta" title={quienLoPuso(t)} style={conVar({ "--i": i })}>
                  <span className="cv-frase">Al empezar {textoMes(t.vigenteDesde.slice(0, 7))}</span>
                  <span className="cv-unidad">S/</span>
                  <Casilla valor={valorEnCasilla(t)} etiqueta={`Saldo a favor de IGV al empezar ${textoMes(t.vigenteDesde.slice(0, 7))}, en soles`} ancho="w-28" alGuardar={casilla("saldo_favor_igv", t.vigenteDesde, `Saldo a favor de IGV al empezar ${textoMes(t.vigenteDesde.slice(0, 7))}`)} />
                </div>
              ))}
            </div>
          )}
          <button type="button" className="btn-cayla btn-sutil mt-3" onClick={() => abrir("saldo_favor_igv")} aria-haspopup="dialog" data-guia="config.nuevo-saldo">
            + Saldo de un mes
          </button>
        </div>

        <div className="cv-subgrupo" data-guia="config.impuestos-previas">
          <TituloGrupo nota="opcional, sin IGV">Ajuste de ventas del año</TituloGrupo>
          <div className="cv-tarjetas sin-margen">
            {aniosPrevias.map((anio, i) => {
              const p = delAnio(parametros, "ventas_previas_erp", anio);
              return (
                <div key={anio} className="cv-fila cv-tope cv-corta" title={quienLoPuso(p)} style={conVar({ "--i": i })}>
                  <span className="cv-frase">{anio}</span>
                  <span className="cv-unidad">S/</span>
                  <Casilla valor={p && !p.provisional ? valorEnCasilla(p) : ""} placeholder="0.00" etiqueta={`Ajuste de ventas de ${anio}, en soles sin IGV`} ancho="w-28" alGuardar={casilla("ventas_previas_erp", `${anio}-01-01`, `Ajuste de ventas ${anio}`)} />
                </div>
              );
            })}
          </div>
          <p className="vs-rotulo cv-consecuencia">Solo lo que el sistema no tiene: lo que ya está registrado se contaría dos veces.</p>
        </div>

        <div className="cv-subgrupo" data-guia="config.impuestos-renta-previa">
          <TituloGrupo nota="de enero hasta que Finanzas empezó a contar">La renta de antes del sistema</TituloGrupo>
          {aniosRenta.map((anio) => (
            <div key={anio} className="cv-tarjetas sin-margen mt-2">
              {RENTA_PREVIA.map((r, i) => {
                const p = delAnio(parametros, r.nombre, anio);
                return (
                  <div key={r.nombre} className="cv-fila cv-tope" title={quienLoPuso(p)} style={conVar({ "--i": i })}>
                    <span className="vs-textos">
                      <span className="cv-frase">
                        {r.nombreVisible} {anio}
                      </span>
                      <span className="vs-rotulo">{r.ayuda}</span>
                    </span>
                    <span className="cv-unidad">S/</span>
                    <Casilla valor={p ? valorEnCasilla(p) : ""} placeholder="0.00" etiqueta={`${r.nombreVisible} de ${anio} antes del sistema, en soles`} ancho="w-28" alGuardar={casilla(r.nombre, `${anio}-01-01`, `${r.nombreVisible} ${anio}`)} />
                  </div>
                );
              })}
            </div>
          ))}
          <p className="vs-rotulo cv-consecuencia">{escala ?? "La escala de la renta todavía no está en la base."} Si un mes ya está en Finanzas, no lo sumes aquí.</p>
        </div>
      </FilasDeMas>
      <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto="Ver lo de arranque" controla="cv-arranque" className="cv-ver-mas" data-guia="config.impuestos-arranque" />
    </section>
  );
}

export function VistaImpuestos({ parametros, anioActual, umbral }: { parametros: ParametroFila[]; anioActual: number; umbral: PanelImpuestos["umbral"] | null }) {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  useLuzDelMouse(raiz);
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState<VigenciaNueva | null>(null);

  // `listo: null` guarda sin aviso ni refresco: lo usa el año, que guarda varios valores de una vez y avisa una sola vez al final.
  const guardar: GuardarParametro = async (nombre, vigenteDesde, valor, texto, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("guardar_parametro_tributario" as never, { p_nombre: nombre, p_vigente_desde: vigenteDesde, p_valor: valor, p_texto: texto } as never) as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, "guardar el parámetro"));
      return false;
    }
    if (listo !== null) {
      avisar.exito(listo);
      router.refresh();
    }
    return true;
  };

  const casilla: GuardarCasilla = (nombre, vigenteDesde, que) => async (tipeado) => {
    const v = parsearParametro(nombre, tipeado);
    if (!v.ok) {
      avisar.error(`${que}: ${v.error}`);
      return false;
    }
    return guardar(nombre, vigenteDesde, v.valor, null, `${que}: ${valorLegible(nombre, v.valor)}.`);
  };

  return (
    <div className="vs-raiz" ref={raiz}>
      <div className="vs-firma" data-guia="config.guardado">
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </div>
      <PorConfirmar parametros={parametros} guardar={guardar} />
      <LimiteDelAnio parametros={parametros} anioActual={anioActual} umbral={umbral} guardar={guardar} />
      <Tasas parametros={parametros} anioActual={anioActual} casilla={casilla} abrir={setNueva} />
      <ParaArrancar parametros={parametros} anioActual={anioActual} casilla={casilla} abrir={setNueva} />
      {nueva && <NuevaVigenciaModal nombre={nueva} onCerrar={() => setNueva(null)} guardar={guardar} guardando={guardando} responsable={responsable} />}
    </div>
  );
}
