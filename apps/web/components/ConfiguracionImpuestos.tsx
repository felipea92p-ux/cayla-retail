"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CabeceraBloque, CampoFin, InputFin, PieTabla, SelectFin, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fechaCorta, mesesRecientes, solesRedondo, textoMes } from "@/lib/gastos-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import {
  REGIMENES,
  TEXTO_REGIMEN,
  aniosDeRegimen,
  delAnio,
  diaDelRegistro,
  parsearParametro,
  valorEnCasilla,
  vigenteEnAnio,
  type NombreParametro,
  type ParametroFila,
  type Regimen,
} from "@/lib/impuestos-reglas";
import { Boton } from "@/components/ui/campos";

// Configuración ▸ Impuestos (ADR-0195 F8), dibujada como el spike (docs/maquetas/finanzas-2026-09/, `cfgImpuestos`): la
// tasa de IGV con sus vigencias, la UIT de cada año y —lo que el spike dejaba para cuando el contador confirme— el
// régimen, el límite de ventas y el pago a cuenta de cada año. Como Tiendas y caja, CADA CASILLA SE GUARDA SOLA al salir de
// ella si cambió, firmada con el responsable. En la base solo se agregan filas: una corrección es una fila nueva.
//
// El tope diario de la planilla de movilidad (ADR-0362, fase 6 · actividad 6, decisión 68) vive aquí, con vigencias como la tasa de IGV:
// lo fija el contador y, mientras no haya, ninguna planilla se marca «no deducible».

type Guardar = (nombre: NombreParametro, vigenteDesde: string, valor: number | null, texto: string | null, listo: string) => Promise<boolean>;

/**
 * Una casilla que se guarda al salir si su texto cambió; si el guardado falla, vuelve a lo de antes. Mientras guarda no se edita
 * (/chaos 2026-10-14): con la red lenta, dos cambios seguidos llegaban en desorden y quedaba el primero aunque se escribió el segundo.
 */
function Casilla({ valor, etiqueta, ancho, alGuardar, placeholder = "—" }: { valor: string; etiqueta: string; ancho: string; alGuardar: (nuevo: string) => Promise<boolean>; placeholder?: string }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
  const [guardando, setGuardando] = useState(false);
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
      readOnly={guardando}
      aria-busy={guardando || undefined}
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape" && !guardando) setT(valor);
      }}
      onBlur={async () => {
        if (guardando || t.trim() === valor.trim()) return;
        setGuardando(true);
        const ok = await alGuardar(t);
        setGuardando(false);
        if (!ok) setT(valor);
      }}
      className={`fin-control fin-num inline-block ${ancho}`}
    />
  );
}

/** Lo que va debajo de cada vigencia: «por confirmar» (con su atajo) o quién la puso. */
function Quien({ p, onConfirmar }: { p: ParametroFila; onConfirmar: () => void }) {
  if (p.provisional)
    return (
      <small>
        por confirmar con el contador ·{" "}
        <button type="button" className="btn-enlace text-[11.5px]" onClick={onConfirmar}>
          ya lo confirmó
        </button>
      </small>
    );
  if (!p.registradoPor) return p.nota ? <small>{p.nota}</small> : null;
  const dia = diaDelRegistro(p.registradoEn);
  return (
    <small>
      {p.correcciones > 0 ? "corregido" : "puesto"} por {p.registradoPor}
      {dia ? ` · ${dia}` : ""}
    </small>
  );
}

export function ConfiguracionImpuestos({ parametros, anioActual }: { parametros: ParametroFila[]; anioActual: number }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState<VigenciaNueva | null>(null);
  const [aniosUitExtra, setAniosUitExtra] = useState<number[]>([]);
  const [aniosRegimenExtra, setAniosRegimenExtra] = useState<number[]>([]);

  const guardar: Guardar = async (nombre, vigenteDesde, valor, texto, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("guardar_parametro_tributario" as never, { p_nombre: nombre, p_vigente_desde: vigenteDesde, p_valor: valor, p_texto: texto } as never) as never,
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, "guardar el parámetro"));
      return false;
    }
    avisar.exito(listo);
    router.refresh();
    return true;
  };

  const guardarCasilla = (nombre: Exclude<NombreParametro, "regimen">, vigenteDesde: string, que: string) => async (tipeado: string) => {
    const v = parsearParametro(nombre, tipeado);
    if (!v.ok) {
      avisar.error(`${que}: ${v.error}`);
      return false;
    }
    const legible =
      nombre === "igv" || nombre === "renta_pago_cuenta"
        ? `${Number((v.valor * 100).toFixed(2))} %`
        : nombre === "uit"
          ? solesRedondo(v.valor)
          : nombre === "tope_planilla_movilidad"
            ? `S/\u00a0${v.valor.toFixed(2)} por persona y día`
            : nombre === "saldo_favor_igv"
              ? `S/\u00a0${v.valor.toFixed(2)} a favor`
              : nombre === "ventas_previas_erp"
                ? `S/\u00a0${v.valor.toFixed(2)} de ajuste`
                : `${v.valor} UIT`;
    return guardar(nombre, vigenteDesde, v.valor, null, `${que}: ${legible}.`);
  };
  const confirmar = (p: ParametroFila, que: string) => () => void guardar(p.nombre, p.vigenteDesde, p.valor, p.texto, `${que}: confirmado.`);

  const tasas = parametros.filter((p) => p.nombre === "igv").sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
  const topes = parametros.filter((p) => p.nombre === "tope_planilla_movilidad").sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
  const saldos = parametros.filter((p) => p.nombre === "saldo_favor_igv").sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
  // El ajuste de ventas del año rige por año exacto: se listan los años que ya tienen algo y el año en curso (aunque no se haya cargado).
  const aniosPrevias = [...new Set([...parametros.filter((p) => p.nombre === "ventas_previas_erp").map((p) => Number(p.vigenteDesde.slice(0, 4))), anioActual])].sort((a, b) => b - a);
  const uits = parametros.filter((p) => p.nombre === "uit");
  const aniosUit = [...new Set([...uits.map((u) => Number(u.vigenteDesde.slice(0, 4))), ...aniosUitExtra])].sort((a, b) => b - a);
  const anios = aniosDeRegimen(parametros, anioActual, aniosRegimenExtra);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">Cada casilla se guarda sola al salir de ella, a nombre de quien figure como responsable. Nada se borra: una corrección también queda en la historia.</p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <section className="fin-dos-col">
        <Superficie pad className="anim-sube" guia="config.impuestos-igv">
          <CabeceraBloque titulo="Tasa de IGV" bajada="Solo se agregan filas: el pasado no se reescribe." />
          <ul className="fin-vigencias">
            {tasas.map((t) => (
              <li key={t.vigenteDesde}>
                <span>
                  Desde {fechaCorta(t.vigenteDesde, true)}
                  <Quien p={t} onConfirmar={confirmar(t, "Tasa de IGV")} />
                </span>
                <span className="fin-con-unidad">
                  <Casilla valor={valorEnCasilla(t)} etiqueta={`Tasa de IGV desde el ${fechaCorta(t.vigenteDesde, true)}`} ancho="w-16" alGuardar={guardarCasilla("igv", t.vigenteDesde, `IGV desde el ${fechaCorta(t.vigenteDesde, true)}`)} />%
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-cayla btn-sutil btn-chico mt-3" onClick={() => setNueva("igv")} aria-haspopup="dialog" data-guia="config.nueva-tasa">
            + Nueva tasa desde una fecha
          </button>
        </Superficie>

        <Superficie pad className="anim-sube" guia="config.impuestos-uit">
          <CabeceraBloque titulo="Valor de la UIT" bajada="Para el límite de ventas del régimen y la renta." />
          <ul className="fin-vigencias">
            {aniosUit.map((anio) => {
              const u = delAnio(parametros, "uit", anio);
              return (
                <li key={anio}>
                  <span>
                    {anio}
                    {u ? <Quien p={u} onConfirmar={confirmar(u, `UIT ${anio}`)} /> : <small>nueva: escribe el valor</small>}
                  </span>
                  <span className="fin-con-unidad">
                    S/
                    <Casilla valor={u ? valorEnCasilla(u) : ""} etiqueta={`UIT de ${anio}`} ancho="w-24" alGuardar={guardarCasilla("uit", `${anio}-01-01`, `UIT ${anio}`)} />
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn-cayla btn-sutil btn-chico mt-3" onClick={() => setAniosUitExtra((a) => [...a, Math.max(anioActual, ...aniosUit) + 1])}>
            + UIT de un año nuevo
          </button>
        </Superficie>

        <Superficie pad className="anim-sube" guia="config.impuestos-tope">
          <CabeceraBloque titulo="Tope diario de la planilla de movilidad" bajada="Por persona y por día. Lo que pase se deja registrar y queda «no deducible»." />
          {topes.length === 0 ? (
            <p className="fin-tenue text-[13px]">
              Sin tope: lo fija el contador (SUNAT lo limita al 4 % de la remuneración mínima vital). Mientras no haya, ningún taxi ni cargador se marca.
            </p>
          ) : (
            <ul className="fin-vigencias">
              {topes.map((t) => (
                <li key={t.vigenteDesde}>
                  <span>
                    Desde {fechaCorta(t.vigenteDesde, true)}
                    <Quien p={t} onConfirmar={confirmar(t, "Tope de la planilla")} />
                  </span>
                  <span className="fin-con-unidad">
                    S/
                    <Casilla
                      valor={valorEnCasilla(t)}
                      etiqueta={`Tope de la planilla desde el ${fechaCorta(t.vigenteDesde, true)}, en soles`}
                      ancho="w-20"
                      alGuardar={guardarCasilla("tope_planilla_movilidad", t.vigenteDesde, `Tope de la planilla desde el ${fechaCorta(t.vigenteDesde, true)}`)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-cayla btn-sutil btn-chico mt-3" onClick={() => setNueva("tope_planilla_movilidad")} aria-haspopup="dialog" data-guia="config.nuevo-tope">
            + Tope desde una fecha
          </button>
        </Superficie>

        <Superficie pad className="anim-sube" guia="config.impuestos-saldo">
          <CabeceraBloque
            titulo="Saldo a favor de IGV al empezar"
            bajada="El crédito fiscal con que CAYLA arrancó, de la última declaración. El IGV de cada mes parte de aquí en vez de cero."
          />
          {saldos.length === 0 ? (
            <p className="fin-tenue text-[13px]">
              Todavía no hay uno: tu contador lo ve en la última declaración («saldo a favor del periodo anterior»). Mientras no esté, el IGV de Impuestos y de la proyección se calcula desde cero y puede salir de más.
            </p>
          ) : (
            <ul className="fin-vigencias">
              {saldos.map((t) => (
                <li key={t.vigenteDesde}>
                  <span>
                    Al empezar {textoMes(t.vigenteDesde.slice(0, 7))}
                    <Quien p={t} onConfirmar={confirmar(t, "Saldo a favor de IGV")} />
                  </span>
                  <span className="fin-con-unidad">
                    S/
                    <Casilla
                      valor={valorEnCasilla(t)}
                      etiqueta={`Saldo a favor de IGV al empezar ${textoMes(t.vigenteDesde.slice(0, 7))}, en soles`}
                      ancho="w-28"
                      alGuardar={guardarCasilla("saldo_favor_igv", t.vigenteDesde, `Saldo a favor de IGV al empezar ${textoMes(t.vigenteDesde.slice(0, 7))}`)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-cayla btn-sutil btn-chico mt-3" onClick={() => setNueva("saldo_favor_igv")} aria-haspopup="dialog" data-guia="config.nuevo-saldo">
            + Saldo de un mes
          </button>
        </Superficie>

        <Superficie pad className="anim-sube" guia="config.impuestos-previas">
          <CabeceraBloque
            titulo="Ajuste de ventas del año"
            bajada="Opcional. El aviso de ventas del año cuenta lo registrado en el sistema; si tu contador te da una cifra distinta, escribe aquí cuánto sumar, sin IGV."
          />
          <ul className="fin-vigencias">
            {aniosPrevias.map((anio) => {
              const p = delAnio(parametros, "ventas_previas_erp", anio);
              return (
                <li key={anio}>
                  <span>
                    {anio}
                    {p && !p.provisional ? (
                      <Quien p={p} onConfirmar={confirmar(p, `Ajuste de ventas ${anio}`)} />
                    ) : (
                      <small>sin ajuste: cuenta solo lo registrado en el sistema</small>
                    )}
                  </span>
                  <span className="fin-con-unidad">
                    S/
                    <Casilla
                      valor={p && !p.provisional ? valorEnCasilla(p) : ""}
                      placeholder="0.00"
                      etiqueta={`Ajuste de ventas de ${anio}, en soles sin IGV`}
                      ancho="w-28"
                      alGuardar={guardarCasilla("ventas_previas_erp", `${anio}-01-01`, `Ajuste de ventas ${anio}`)}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="fin-tenue mt-3 text-[13px]">
            Si ese monto ya está registrado en el sistema, déjalo en 0: se contaría dos veces. Cada año va aparte: el de uno no pasa al siguiente.
          </p>
        </Superficie>
      </section>

      <Superficie className="anim-sube" guia="config.impuestos-regimen">
        <TituloDeTarjeta titulo="Régimen de renta, año por año" bajada="Rige desde el 1 de enero. Vacío = sigue lo del año anterior.">
          <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => setAniosRegimenExtra((a) => [...a, Math.max(...anios) + 1])}>
            + Año nuevo
          </button>
        </TituloDeTarjeta>
        <div className="fin-tabla-wrap">
          <table className="fin-tabla fin-tabla-apretada" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th>Año</th>
                <th>Régimen</th>
                <th className="fin-num">Límite (UIT)</th>
                <th className="fin-num">Aviso (UIT)</th>
                <th className="fin-num">Límite en soles</th>
                <th className="fin-num">Pago a cuenta</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {anios.map((anio) => (
                <FilaAnio key={anio} anio={anio} parametros={parametros} guardar={guardar} guardarCasilla={guardarCasilla} />
              ))}
            </tbody>
          </table>
        </div>
        <PieTabla>
          <span>Pasado el límite, SUNAT pide Diario y Mayor completos; el pago a cuenta sale de la venta neta de cada mes. Los valores de arranque (Régimen MYPE, 300 UIT, 1 %) son provisionales: los confirma el contador. El aviso salta antes del límite, para hablar con el contador a tiempo.</span>
        </PieTabla>
      </Superficie>

      <div className="nota-cayla">La retención del recibo por honorarios la define el contador. Cuando la confirme, se configura aquí.</div>

      {nueva && <NuevaVigencia nombre={nueva} onCerrar={() => setNueva(null)} guardar={guardar} guardando={guardando} responsable={responsable} />}
    </>
  );
}

function FilaAnio({
  anio,
  parametros,
  guardar,
  guardarCasilla,
}: {
  anio: number;
  parametros: ParametroFila[];
  guardar: Guardar;
  guardarCasilla: (nombre: Exclude<NombreParametro, "regimen">, vigenteDesde: string, que: string) => (t: string) => Promise<boolean>;
}) {
  const desde = `${anio}-01-01`;
  const regimen = delAnio(parametros, "regimen", anio);
  const umbral = delAnio(parametros, "umbral_uit", anio);
  const renta = delAnio(parametros, "renta_pago_cuenta", anio);
  const aviso = delAnio(parametros, "aviso_umbral_uit", anio);
  const avisoVigente = vigenteEnAnio(parametros, "aviso_umbral_uit", anio);
  const regimenVigente = vigenteEnAnio(parametros, "regimen", anio);
  const umbralVigente = vigenteEnAnio(parametros, "umbral_uit", anio);
  const rentaVigente = vigenteEnAnio(parametros, "renta_pago_cuenta", anio);
  const uitVigente = vigenteEnAnio(parametros, "uit", anio);
  const propios = [regimen, umbral, renta, aviso].filter((p): p is ParametroFila => !!p);
  const enSoles = uitVigente?.valor && umbralVigente?.valor ? uitVigente.valor * umbralVigente.valor : null;
  const avisoEnSoles = uitVigente?.valor && avisoVigente?.valor ? uitVigente.valor * avisoVigente.valor : null;
  const estado = !propios.length
    ? { tono: "neutro" as const, texto: regimenVigente || umbralVigente ? "sigue el año anterior" : "sin configurar" }
    : propios.some((p) => p.provisional)
      ? { tono: "ambar" as const, texto: "por confirmar" }
      : { tono: "verde" as const, texto: "confirmado" };

  return (
    <tr>
      <td className="fin-ancha" data-l="Año">
        <b>{anio}</b>
      </td>
      <td data-l="Régimen">
        {/* Sin régimen propio para ese año, el marcador dice cuál rige («Como antes: …»), como decía la opción vacía. */}
        <SelectFin
          etiqueta={`Régimen de renta de ${anio}`}
          className="w-fit min-w-[15rem] fin-compacto"
          valor={regimen?.texto ?? ""}
          onValor={(v) => void guardar("regimen", desde, null, v as Regimen, `Régimen de ${anio}: ${TEXTO_REGIMEN[v as Regimen]}.`)}
          marcador={regimenVigente ? `Como antes: ${TEXTO_REGIMEN[regimenVigente.texto as Regimen] ?? regimenVigente.texto}` : "Elige…"}
          opciones={REGIMENES.map((r) => ({ valor: r, texto: TEXTO_REGIMEN[r] }))}
        />
      </td>
      <td className="fin-num" data-l="Límite (UIT)">
        <Casilla
          valor={umbral ? valorEnCasilla(umbral) : ""}
          placeholder={umbralVigente ? valorEnCasilla(umbralVigente) : "—"}
          etiqueta={`Límite de ventas de ${anio}, en UIT`}
          ancho="w-20"
          alGuardar={guardarCasilla("umbral_uit", desde, `Límite de ${anio}`)}
        />
      </td>
      <td className="fin-num" data-l="Aviso (UIT)">
        <Casilla
          valor={aviso ? valorEnCasilla(aviso) : ""}
          placeholder={avisoVigente ? valorEnCasilla(avisoVigente) : "—"}
          etiqueta={`Aviso anticipado de ${anio}, en UIT de ventas del año`}
          ancho="w-20"
          alGuardar={guardarCasilla("aviso_umbral_uit", desde, `Aviso de ${anio}`)}
        />
        {avisoEnSoles !== null && <span className="fin-sub">{solesRedondo(avisoEnSoles)}</span>}
      </td>
      <td className="fin-num" data-l="En soles">
        {enSoles !== null ? solesRedondo(enSoles) : <span className="fin-tenue">—</span>}
        {uitVigente && <span className="fin-sub">UIT {uitVigente.vigenteDesde.slice(0, 4)}</span>}
      </td>
      <td className="fin-num" data-l="Pago a cuenta">
        <span className="fin-con-unidad">
          <Casilla
            valor={renta ? valorEnCasilla(renta) : ""}
            placeholder={rentaVigente ? valorEnCasilla(rentaVigente) : "—"}
            etiqueta={`Pago a cuenta de renta de ${anio}, en %`}
            ancho="w-16"
            alGuardar={guardarCasilla("renta_pago_cuenta", desde, `Pago a cuenta de ${anio}`)}
          />
          %
        </span>
      </td>
      <td data-l="Estado">
        <Chip tono={estado.tono}>{estado.texto}</Chip>
      </td>
    </tr>
  );
}

type VigenciaNueva = "igv" | "tope_planilla_movilidad" | "saldo_favor_igv";

const HOJA: Record<VigenciaNueva, { titulo: string; subtitulo: string; etiqueta: string; ayuda: string; ejemplo: string; pendiente: string; listo: (desde: string, t: string, valor: number) => string }> = {
  igv: {
    titulo: "Nueva tasa de IGV",
    subtitulo: "Desde esa fecha, los gastos con factura calculan su IGV con esta tasa. Lo registrado antes no cambia.",
    etiqueta: "Tasa (%)",
    ayuda: "El IGV con el IPM: hoy 18.",
    ejemplo: "18", // sugerir-fijo: la tasa de IGV vigente es la misma para todo, no depende de nada elegido en la hoja
    pendiente: "Escribe la tasa en %, por ejemplo 18.",
    listo: (desde, t) => `Tasa de IGV desde el ${fechaCorta(desde, true)}: ${t.trim()} %.`,
  },
  tope_planilla_movilidad: {
    titulo: "Nuevo tope de la planilla de movilidad",
    subtitulo:
      "Desde esa fecha, lo que pase este monto por persona y por día queda «no deducible», también en las planillas ya anotadas de esos días.",
    etiqueta: "Tope por persona y día (S/)",
    ayuda: "SUNAT: el 4 % de la remuneración mínima vital. Confírmalo con el contador.",
    ejemplo: "45.20", // sugerir-fijo: el formato de un monto en soles, no depende de nada elegido en la hoja
    pendiente: "Escribe el tope en soles, por ejemplo 45.20.",
    listo: (desde, t) => `Tope de la planilla desde el ${fechaCorta(desde, true)}: S/\u00a0${Number(t.replace(",", ".")).toFixed(2)} por persona y día.`,
  },
  saldo_favor_igv: {
    titulo: "Saldo a favor de IGV",
    subtitulo:
      "Lo que CAYLA traía a favor al empezar ese mes. Ese mes el IGV parte de este monto (reemplaza lo que venía calculando) y lo de antes no cambia. Si hay uno ya declarado en ese mes, este lo corrige.",
    etiqueta: "Saldo a favor (S/)",
    ayuda: "De la última declaración: «saldo a favor del periodo anterior». Pon 0 si no traía.",
    ejemplo: "0.00", // sugerir-fijo: el formato de un monto en soles, no depende de nada elegido en la hoja
    pendiente: "Escribe el saldo en soles (0 si no traía).",
    listo: (desde, _t, valor) => `Saldo a favor de IGV al empezar ${textoMes(desde.slice(0, 7))}: S/\u00a0${valor.toFixed(2)}.`,
  },
};

function NuevaVigencia({
  nombre,
  onCerrar,
  guardar,
  guardando,
  responsable,
}: {
  nombre: VigenciaNueva;
  onCerrar: () => void;
  guardar: Guardar;
  guardando: boolean;
  responsable: ReturnType<typeof useResponsable>;
}) {
  const [desdeTipeado, setDesde] = useState("");
  const [valor, setValor] = useState("");
  const h = HOJA[nombre];
  const v = parsearParametro(nombre, valor);
  // El saldo de IGV rige desde el día 1 de un mes: se elige el MES y la fecha que se guarda es su día 1.
  const esMes = nombre === "saldo_favor_igv";
  const desde = esMes && /^\d{4}-(0[1-9]|1[0-2])$/.test(desdeTipeado) ? `${desdeTipeado}-01` : esMes ? "" : desdeTipeado;
  const opcionesMes = esMes ? mesesRecientes(hoyLima(), 36).map((m) => ({ valor: m, texto: textoMes(m) })) : [];
  const fechaLista = /^\d{4}-\d{2}-\d{2}$/.test(desde);
  const listo = fechaLista && v.ok;
  // Guía de foco (ADR-0284): sale de lo mismo que habilita «Agregar».
  const guia = useGuiaCampos([
    { id: "desde", nombre: esMes ? "Mes" : "Desde", requerido: true, hecho: fechaLista, pendiente: esMes ? "Elige el mes en que CAYLA traía ese saldo." : "Elige desde qué fecha rige." },
    { id: "valor", nombre: h.etiqueta, requerido: true, hecho: v.ok, pendiente: valor && !v.ok ? v.error : h.pendiente },
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién hace el cambio." },
  ]);
  return (
    <Modal variante="hoja" titulo={h.titulo} subtitulo={h.subtitulo} onClose={onCerrar}>
      <div className="fin-dos-campos" data-guia="config.nueva-tasa-campos">
        <CampoGuiado id="desde" guia={guia}>
          <CampoFin etiqueta={esMes ? "Al empezar el mes" : "Desde"} htmlFor="vigencia-desde">
            {esMes ? (
              <SelectFin id="vigencia-desde" valor={desdeTipeado} onValor={setDesde} opciones={opcionesMes} marcador="Elige el mes…" />
            ) : (
              <InputFin id="vigencia-desde" type="date" value={desdeTipeado} onChange={(e) => setDesde(e.target.value)} />
            )}
          </CampoFin>
        </CampoGuiado>
        <CampoGuiado id="valor" guia={guia}>
          <CampoFin etiqueta={h.etiqueta} htmlFor="vigencia-valor" ayuda={valor && !v.ok ? v.error : h.ayuda} tono={valor && !v.ok ? "aviso" : undefined}>
            <InputFin id="vigencia-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={h.ejemplo} />
          </CampoFin>
        </CampoGuiado>
      </div>
      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>
      <PieGuia guia={guia} listo="Todo listo para agregar." />
      <div className="fin-botones" data-guia="config.nueva-tasa-botones">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
        <Boton peso="primario" cargando={guardando}
          type="button"
          disabled={!listo || guardando || !responsable.listo}
          onClick={async () => {
            if (!v.ok) return;
            if (await guardar(nombre, desde, v.valor, null, h.listo(desde, valor, v.valor))) onCerrar();
          }}
        >
          Agregar
        </Boton>
      </div>
    </Modal>
  );
}
