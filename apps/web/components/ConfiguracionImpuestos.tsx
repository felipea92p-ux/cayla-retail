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
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fechaCorta, solesRedondo } from "@/lib/gastos-reglas";
import {
  REGIMENES,
  TEXTO_REGIMEN,
  aniosDeRegimen,
  delAnio,
  parsearParametro,
  valorEnCasilla,
  vigenteEnAnio,
  type NombreParametro,
  type ParametroFila,
  type Regimen,
} from "@/lib/impuestos-reglas";

// Configuración ▸ Impuestos (ADR-0195 F8), dibujada como el spike (docs/maquetas/finanzas-2026-09/, `cfgImpuestos`): la
// tasa de IGV con sus vigencias, la UIT de cada año y —lo que el spike dejaba para cuando el contador confirme— el
// régimen, el límite de ventas y el pago a cuenta de cada año. Como Tiendas y caja, CADA CASILLA SE GUARDA SOLA al salir de
// ella si cambió, firmada con el responsable. En la base solo se agregan filas: una corrección es una fila nueva.

type Guardar = (nombre: NombreParametro, vigenteDesde: string, valor: number | null, texto: string | null, listo: string) => Promise<boolean>;

/** Una casilla que se guarda al salir si su texto cambió; si el guardado falla, vuelve a lo de antes. */
function Casilla({ valor, etiqueta, ancho, alGuardar, placeholder = "—" }: { valor: string; etiqueta: string; ancho: string; alGuardar: (nuevo: string) => Promise<boolean>; placeholder?: string }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
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
  return (
    <small>
      {p.correcciones > 0 ? "corregido" : "puesto"} por {p.registradoPor}
      {p.registradoEn ? ` · ${fechaCorta(p.registradoEn.slice(0, 10), true)}` : ""}
    </small>
  );
}

export function ConfiguracionImpuestos({ parametros, anioActual }: { parametros: ParametroFila[]; anioActual: number }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [nuevaTasa, setNuevaTasa] = useState(false);
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
    const legible = nombre === "igv" || nombre === "renta_pago_cuenta" ? `${Number((v.valor * 100).toFixed(2))} %` : nombre === "uit" ? solesRedondo(v.valor) : `${v.valor} UIT`;
    return guardar(nombre, vigenteDesde, v.valor, null, `${que}: ${legible}.`);
  };
  const confirmar = (p: ParametroFila, que: string) => () => void guardar(p.nombre, p.vigenteDesde, p.valor, p.texto, `${que}: confirmado.`);

  const tasas = parametros.filter((p) => p.nombre === "igv").sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
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
        <Superficie pad className="anim-sube">
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
          <button type="button" className="btn-cayla btn-sutil btn-chico mt-3" onClick={() => setNuevaTasa(true)}>
            + Nueva tasa desde una fecha
          </button>
        </Superficie>

        <Superficie pad className="anim-sube">
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
      </section>

      <Superficie className="anim-sube">
        <TituloDeTarjeta titulo="Régimen de renta, año por año" bajada="Rige desde el 1 de enero. Vacío = sigue lo del año anterior.">
          <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => setAniosRegimenExtra((a) => [...a, Math.max(...anios) + 1])}>
            + Año nuevo
          </button>
        </TituloDeTarjeta>
        <div className="fin-tabla-wrap">
          <table className="fin-tabla fin-tabla-apretada" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Año</th>
                <th>Régimen</th>
                <th className="fin-num">Límite (UIT)</th>
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
          <span>Pasado el límite, SUNAT pide Diario y Mayor completos; el pago a cuenta sale de la venta neta de cada mes. Los valores de arranque (Régimen MYPE, 300 UIT, 1 %) son provisionales: los confirma el contador.</span>
        </PieTabla>
      </Superficie>

      <div className="nota-cayla">La retención del recibo por honorarios la define el contador. Cuando la confirme, se configura aquí.</div>

      {nuevaTasa && <NuevaTasa onCerrar={() => setNuevaTasa(false)} guardar={guardar} guardando={guardando} responsable={responsable} />}
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
  const regimenVigente = vigenteEnAnio(parametros, "regimen", anio);
  const umbralVigente = vigenteEnAnio(parametros, "umbral_uit", anio);
  const rentaVigente = vigenteEnAnio(parametros, "renta_pago_cuenta", anio);
  const uitVigente = vigenteEnAnio(parametros, "uit", anio);
  const propios = [regimen, umbral, renta].filter((p): p is ParametroFila => !!p);
  const enSoles = uitVigente?.valor && umbralVigente?.valor ? uitVigente.valor * umbralVigente.valor : null;
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

function NuevaTasa({ onCerrar, guardar, guardando, responsable }: { onCerrar: () => void; guardar: Guardar; guardando: boolean; responsable: ReturnType<typeof useResponsable> }) {
  const [desde, setDesde] = useState("");
  const [tasa, setTasa] = useState("");
  const v = parsearParametro("igv", tasa);
  const listo = /^\d{4}-\d{2}-\d{2}$/.test(desde) && v.ok;
  return (
    <Modal variante="hoja" titulo="Nueva tasa de IGV" subtitulo="Desde esa fecha, los gastos con factura calculan su IGV con esta tasa. Lo registrado antes no cambia." onClose={onCerrar} ancho="max-w-[480px]">
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Desde" htmlFor="tasa-desde">
          <InputFin id="tasa-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </CampoFin>
        <CampoFin etiqueta="Tasa (%)" htmlFor="tasa-valor" ayuda={tasa && !v.ok ? v.error : "El IGV con el IPM: hoy 18."} tono={tasa && !v.ok ? "aviso" : undefined}>
          <InputFin id="tasa-valor" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="18" />
        </CampoFin>
      </div>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-cayla btn-primario"
          disabled={!listo || guardando || !responsable.listo}
          onClick={async () => {
            if (!v.ok) return;
            if (await guardar("igv", desde, v.valor, null, `Tasa de IGV desde el ${fechaCorta(desde, true)}: ${tasa.trim()} %.`)) onCerrar();
          }}
        >
          {guardando ? "Guardando…" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}
