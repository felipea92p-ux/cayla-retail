"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { Boton, Desplegable } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Casilla, useGuardarCasilla, type Guardar } from "@/components/ConfiguracionCasilla";
import { AgregarCuentaModal } from "@/components/finanzas/AgregarCuentaModal";
import { EditarCuentaModal } from "@/components/finanzas/EditarCuentaModal";
import { TarifaMaquinaModal } from "@/components/finanzas/TarifaMaquinaModal";
import { GotaDinero, TRAZO_DE_CUENTA, TRAZO_DE_MEDIO } from "@/components/vistas-config/IconosDinero";
import { useLuzDelMouse } from "@/components/vitrinas-sedes/useLuzDelMouse";
import { colorDeSede, nombreCortoSede } from "@/lib/finanzas-telar-reglas";
import { validarParametrosFinanzas, type ParametrosFinanzasConCorte } from "@/lib/configuracion-reglas";
import { NO_SE_PUDO_LEER, parametrosFinanzasFrescos } from "@/lib/metas-frescas";
import {
  TEXTO_MEDIO_COBRO,
  TEXTO_TIPO_CUENTA,
  mediosDeMaquina,
  nombreCorto,
  textoDondeCobra,
  textoRecibe,
  tiposParaMedio,
  type CuentaDinero,
  type FilaMedio,
  type MaquinaPos,
  type MedioCobro,
} from "@/lib/cuentas-dinero-reglas";
import { primerPasoCobros, cobrosDeSede, curvaHilo, destinosDeSede, detalleDeDestino, gruposDeCuentas, maquinaSinTarifa, saldoDeCuenta, sedesDeCobro, tarifaDeMaquina, textoDeLoPlegado } from "@/lib/dinero-config-reglas";
import type { CuentaOtraEmpresa } from "@/lib/cuenta-claure-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { consecuenciaCorte, corteParaBase, fechaDelCorte, opcionesCorte, SIN_CORTE } from "@/lib/finanzas-arranque-reglas";
import { BANCOS_CON_CUENTA, TEXTO_BANCO, type CuentaPlanilla } from "@/lib/planilla-salidas-reglas";

// Configuración ▸ Dinero (Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/): junta «Cuentas y cobros» y «Caja y avisos». ¿A dónde va la plata? Un hilo une cada
// cobro de una sede con su cuenta, en vez de una tabla de veinte combos. Las cuentas se leen por su dibujo, sin «Tipo» ni «Cuenta contable» (esa se ve al editar), y los cajones se
// pliegan porque nacen solos. Cada cambio se guarda solo, firmado con el responsable, con las mismas funciones de siempre; cambiar a qué cuenta entra un cobro rige desde hoy.

/** El combo de una cuenta: se guarda al elegir y, si la base dice que no, vuelve a lo de antes. */
function ComboCuenta({ etiqueta, actual, cuentas, deshabilitado, alCambiar }: { etiqueta: string; actual: string; cuentas: readonly CuentaDinero[]; deshabilitado: boolean; alCambiar: (cuentaId: string) => Promise<boolean> }) {
  const [valor, setValor] = useState(actual);
  const [antes, setAntes] = useState(actual);
  if (actual !== antes) {
    setAntes(actual);
    setValor(actual);
  }
  return (
    <Desplegable
      forma="campo"
      className="cv-combo"
      etiquetaAccesible={etiqueta}
      valor={valor}
      deshabilitado={deshabilitado}
      onValor={async (nuevo) => {
        setValor(nuevo);
        if (!(await alCambiar(nuevo))) setValor(actual);
      }}
      opciones={[{ valor: "", texto: "Sin cuenta" }, ...cuentas.map((c) => ({ valor: c.id, texto: nombreCorto(c.nombre) }))]}
    />
  );
}

/** Los hilos: se miden con offset* y no con getBoundingClientRect porque los nodos entran animados; lo transformado no cuenta. */
function useHilos(enlaces: readonly { medio: MedioCobro; cuentaId: string }[]) {
  const flujo = useRef<HTMLDivElement>(null);
  const [hilos, setHilos] = useState<{ medio: MedioCobro; d: string }[]>([]);

  const medir = useCallback(() => {
    const f = flujo.current;
    if (!f) return;
    const siguientes = enlaces.flatMap((e) => {
      const a = f.querySelector<HTMLElement>(`[data-medio="${e.medio}"]`);
      const b = e.cuentaId ? f.querySelector<HTMLElement>(`[data-destino="${e.cuentaId}"]`) : null;
      // Sin cuenta no hay hilo; y en el celular la columna de destinos no se dibuja (offsetParent nulo).
      if (!a || !b || !b.offsetParent) return [];
      return [{ medio: e.medio, d: curvaHilo(a.offsetLeft + a.offsetWidth, a.offsetTop + a.offsetHeight / 2, b.offsetLeft, b.offsetTop + b.offsetHeight / 2) }];
    });
    setHilos((antes) => (JSON.stringify(antes) === JSON.stringify(siguientes) ? antes : siguientes));
  }, [enlaces]);

  useLayoutEffect(medir, [medir]);
  useEffect(() => {
    const f = flujo.current;
    if (!f || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(medir);
    o.observe(f);
    return () => o.disconnect();
  }, [medir]);

  return { flujo, hilos };
}

function Cobros({ medios, activas, guardar, guardando }: { medios: readonly FilaMedio[]; activas: readonly CuentaDinero[]; guardar: Guardar; guardando: boolean }) {
  const sedes = useMemo(() => sedesDeCobro(medios), [medios]);
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const sede = sedes.find((s) => s.id === sedeId) ?? sedes[0];
  const cobros = useMemo(() => (sede ? cobrosDeSede(medios, sede.id) : []), [medios, sede]);
  const destinos = useMemo(() => destinosDeSede(cobros, activas), [cobros, activas]);
  const { flujo, hilos } = useHilos(cobros);
  const primerPaso = useMemo(() => (sede ? primerPasoCobros(medios, sede.id) : null), [medios, sede]);
  const [encima, setEncima] = useState<MedioCobro | null>(null);

  if (!sede) {
    return (
      <section className="vs-liquido cv-bloque" data-luz data-guia="config.cuentas-cobros">
        <Vacio tamano="chico" icono={<Store />} titulo="No hay sedes activas" />
      </section>
    );
  }

  const cambiar = (medio: MedioCobro, cuentaId: string) => {
    const destino = activas.find((c) => c.id === cuentaId)?.nombre ?? "ninguna cuenta";
    return guardar(
      () => createClient().rpc("guardar_medio_de_cobro" as never, { p_ubicacion_id: sede.id, p_medio: medio, p_cuenta_id: cuentaId || null } as never),
      sede.soloPaga ? `cambiar de qué cuenta paga ${sede.nombre}` : "cambiar a qué cuenta entra el cobro",
      sede.soloPaga ? `Los pagos por transferencia de ${sede.nombre}: desde hoy salen de ${destino}.` : `${TEXTO_MEDIO_COBRO[medio]} de ${sede.nombre}: desde hoy entra a ${destino}.`,
    );
  };

  return (
    <section className="vs-liquido cv-bloque" data-luz data-color={colorDeSede({ nombre: sede.nombre, tipo: sede.soloPaga ? "taller" : "tienda" })} data-guia="config.cuentas-cobros" style={{ "--e": 0 } as React.CSSProperties}>
      <TituloSeccion
        ayuda="Si lo cambias, desde hoy Finanzas lo cuenta ahí; lo pasado no se mueve. El efectivo siempre cae al cajón de la tienda, y la tarjeta y el QR entran a la cuenta «por depositar» de su máquina. El Taller no cobra a clientes: solo guarda de qué cuenta paga."
        accion={
          <span className="cv-par flex-wrap">
            {sedes.map((s) => (
              <button key={s.id} type="button" className="pildora-cayla" aria-pressed={s.id === sede.id} onClick={() => setSedeId(s.id)}>
                {nombreCortoSede(s.nombre)}
              </button>
            ))}
          </span>
        }
      >
        A dónde entra cada cobro
      </TituloSeccion>
      {primerPaso && <p className="cv-primer-paso">{primerPaso}</p>}
      <div className="cv-flujo" ref={flujo} key={sede.id}>
        <svg className="cv-hilos" aria-hidden>
          {hilos.map((h, k) => (
            <path key={h.medio} className={`cv-hilo ${encima === h.medio ? "encendido" : ""}`} style={{ "--k": k } as React.CSSProperties} pathLength={1} d={h.d} />
          ))}
        </svg>
        <div className="cv-columna">
          {cobros.map((c, i) => (
            <div key={c.medio} className={`cv-nodo ${c.cuentaId ? "" : "falta"}`} data-medio={c.medio} style={{ "--i": i } as React.CSSProperties} onMouseEnter={() => setEncima(c.medio)} onMouseLeave={() => setEncima(null)} onFocusCapture={() => setEncima(c.medio)} onBlurCapture={() => setEncima(null)}>
              <GotaDinero trazo={TRAZO_DE_MEDIO[c.medio]} i={i} conColor />
              <span className="cv-nodo-tx">
                <b>{sede.soloPaga ? "Paga desde" : TEXTO_MEDIO_COBRO[c.medio]}</b>
                <ComboCuenta
                  etiqueta={sede.soloPaga ? `De qué cuenta paga ${sede.nombre} por transferencia` : `A qué cuenta entra ${TEXTO_MEDIO_COBRO[c.medio]} de ${sede.nombre}`}
                  actual={c.cuentaId}
                  cuentas={activas.filter((x) => tiposParaMedio(c.medio).includes(x.tipo))}
                  deshabilitado={guardando}
                  alCambiar={(id) => cambiar(c.medio, id)}
                />
              </span>
            </div>
          ))}
        </div>
        <div className="cv-columna destinos">
          {destinos.map((d, i) => (
            <div key={d.id} className="cv-nodo destino" data-destino={d.id} style={{ "--i": i } as React.CSSProperties}>
              <GotaDinero trazo={TRAZO_DE_CUENTA[d.tipo]} i={i} />
              <span className="cv-nodo-tx">
                <b>{nombreCorto(d.nombre)}</b>
                <small>{detalleDeDestino(d)}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FilaCuenta({ cuenta, medios, guardando, i, alEditar }: { cuenta: CuentaDinero; medios: readonly FilaMedio[]; guardando: boolean; i: number; alEditar: () => void }) {
  const detalle = [textoRecibe(cuenta, medios), cuenta.numero].filter(Boolean).join(" · ") || TEXTO_TIPO_CUENTA[cuenta.tipo];
  return (
    <div className={`vs-dato ${cuenta.archivada ? "apagado" : ""}`} style={{ "--i": i } as React.CSSProperties}>
      <GotaDinero trazo={TRAZO_DE_CUENTA[cuenta.tipo]} i={i} />
      <span className="vs-textos">
        <span className="cv-nombre">{cuenta.nombre}</span>
        <span className="vs-rotulo">{detalle}</span>
      </span>
      <span className={`cv-saldo ${cuenta.saldo !== null && cuenta.saldo < 0 ? "debe" : ""}`}>{saldoDeCuenta(cuenta.saldo)}</span>
      <LapizEditar que={cuenta.nombre} disabled={guardando} onClick={alEditar} />
    </div>
  );
}

/** Una cuenta de otra empresa (ADR-0638): se ve para saber que existe, sin saldo y sin lápiz. No se edita ni se archiva, y nadie la elige. */
function FilaCuentaAjena({ cuenta, i }: { cuenta: CuentaOtraEmpresa; i: number }) {
  return (
    <div className="vs-dato" style={{ "--i": i } as React.CSSProperties}>
      <GotaDinero trazo={TRAZO_DE_CUENTA.banco} i={i} />
      <span className="vs-textos">
        <span className="cv-nombre">{cuenta.nombre}</span>
        <span className="vs-rotulo">Lo que llega aquí no es de CAYLA</span>
        <Chip tono="pizarra" className="mt-1 self-start">{`De ${cuenta.empresa} · no suma`}</Chip>
      </span>
    </div>
  );
}

function Cuentas({ cuentas, cuentasAjenas, medios, guardando, alAgregar, alEditar }: { cuentas: readonly CuentaDinero[]; cuentasAjenas: readonly CuentaOtraEmpresa[]; medios: readonly FilaMedio[]; guardando: boolean; alAgregar: () => void; alEditar: (c: CuentaDinero) => void }) {
  const { aLaVista, deLasSedes, archivadas } = useMemo(() => gruposDeCuentas(cuentas), [cuentas]);
  const [abierto, setAbierto] = useState(false);
  const hayPlegado = deLasSedes.length + archivadas.length > 0;
  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.cuentas-lista" style={{ "--e": 1 } as React.CSSProperties}>
      <TituloSeccion
        ayuda="Cada lugar donde hay plata. Un saldo nunca se escribe: se suma de los movimientos. Una cuenta sin movimientos se elimina y una con movimientos se archiva, desde el lápiz."
        cuenta={aLaVista.length || undefined}
        accion={
          <Boton type="button" peso="primario" onClick={alAgregar}>
            + Agregar cuenta
          </Boton>
        }
      >
        Las cuentas
      </TituloSeccion>
      <div className="cv-tarjetas">
        {aLaVista.map((c, i) => (
          <FilaCuenta key={c.id} cuenta={c} medios={medios} guardando={guardando} i={i} alEditar={() => alEditar(c)} />
        ))}
        {cuentasAjenas.map((c, i) => (
          <FilaCuentaAjena key={c.id} cuenta={c} i={aLaVista.length + i} />
        ))}
      </div>
      {hayPlegado && (
        <>
          <FilasDeMas abierto={abierto} id="cv-cajones">
            {deLasSedes.length > 0 && (
              <>
                <TituloGrupo cuenta={deLasSedes.length}>Cajones y cajas de las sedes</TituloGrupo>
                <div className="cv-tarjetas sin-margen">
                  {deLasSedes.map((c, i) => (
                    <FilaCuenta key={c.id} cuenta={c} medios={medios} guardando={guardando} i={i} alEditar={() => alEditar(c)} />
                  ))}
                </div>
              </>
            )}
            {archivadas.length > 0 && (
              <>
                <TituloGrupo cuenta={archivadas.length}>Archivadas</TituloGrupo>
                <div className="cv-tarjetas sin-margen">
                  {archivadas.map((c, i) => (
                    <FilaCuenta key={c.id} cuenta={c} medios={medios} guardando={guardando} i={i} alEditar={() => alEditar(c)} />
                  ))}
                </div>
              </>
            )}
          </FilasDeMas>
          <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={textoDeLoPlegado(deLasSedes.length, archivadas.length)} controla="cv-cajones" className="cv-ver-mas" />
        </>
      )}
    </section>
  );
}

function FilaMaquina({ maquina, i, guardando, alTarifa }: { maquina: MaquinaPos; i: number; guardando: boolean; alTarifa: () => void }) {
  const medios = mediosDeMaquina(maquina);
  const editable = !maquina.archivada && medios.length > 0;
  const sinTarifa = editable && maquinaSinTarifa(maquina);
  return (
    <div className={`vs-dato ${maquina.archivada ? "apagado" : ""}`} style={{ "--i": i } as React.CSSProperties}>
      <GotaDinero trazo="maquina" i={i} />
      <span className="vs-textos">
        <span className="cv-nombre">
          {maquina.nombre}
          {maquina.archivada ? " · archivada" : ""}
        </span>
        <span className="vs-rotulo">{textoDondeCobra(maquina)}</span>
        {medios.length > 0 && <span className="vs-rotulo">{tarifaDeMaquina(maquina)}</span>}
      </span>
      {editable && (
        <span data-guia="config.maquina-tarifa">
          {sinTarifa ? (
            <button type="button" className="vs-accion poner" disabled={guardando} onClick={alTarifa} aria-label={`Poner la tarifa de ${maquina.nombre}`}>
              Poner tarifa
            </button>
          ) : (
            <LapizEditar que={`la tarifa de ${maquina.nombre}`} disabled={guardando} onClick={alTarifa} />
          )}
        </span>
      )}
    </div>
  );
}

function MaquinasYPlanilla({ maquinas, planilla, activas, guardar, guardando, alTarifa }: { maquinas: readonly MaquinaPos[] | null; planilla: readonly CuentaPlanilla[] | null; activas: readonly CuentaDinero[]; guardar: Guardar; guardando: boolean; alTarifa: (m: MaquinaPos) => void }) {
  if (!maquinas && !planilla) return null;
  const bancos = activas.filter((c) => c.tipo === "banco");
  return (
    <section className="vs-liquido cv-bloque" data-luz style={{ "--e": 2 } as React.CSSProperties}>
      <TituloSeccion ayuda="Con qué máquina se cobra tarjeta y QR en cada tienda y cuánto se lleva: la tarifa solo estima la comisión, la real sale de cada depósito. Y de qué cuenta de CAYLA se pagan los sueldos (la planilla) según el banco de cada persona; quien no tiene banco en Dynamic sale aparte. Cambiar esto no mueve lo ya registrado.">
        Máquinas de cobro y sueldos
      </TituloSeccion>
      {maquinas && (
        <div className="cv-tarjetas una" data-guia="config.maquinas">
          {maquinas.length === 0 ? (
            <Vacio tamano="chico" icono={<CreditCard />} titulo="No hay máquinas de cobro" />
          ) : (
            maquinas.map((m, i) => <FilaMaquina key={m.id} maquina={m} i={i} guardando={guardando} alTarifa={() => alTarifa(m)} />)
          )}
        </div>
      )}
      {planilla && (
        <div className="cv-subgrupo" data-guia="config.planilla-cuentas">
          <TituloGrupo>De dónde se pagan los sueldos</TituloGrupo>
          <div className="cv-tarjetas una sin-margen">
            {BANCOS_CON_CUENTA.map((banco, i) => (
              <div key={banco} className="cv-fila cv-tope" style={{ "--i": i } as React.CSSProperties}>
                <span className="cv-frase">Equipo con cuenta {TEXTO_BANCO[banco]}</span>
                <ComboCuenta
                  etiqueta={`De qué cuenta se paga al equipo con cuenta ${TEXTO_BANCO[banco]}`}
                  actual={planilla.find((p) => p.banco === banco)?.cuentaId ?? ""}
                  cuentas={bancos}
                  deshabilitado={guardando}
                  alCambiar={(cuentaId) =>
                    guardar(
                      () => createClient().rpc("guardar_cuenta_planilla" as never, { p_banco: banco, p_cuenta_id: cuentaId || null } as never),
                      "cambiar de qué cuenta se pagan los sueldos",
                      cuentaId ? `Los sueldos del equipo con cuenta ${TEXTO_BANCO[banco]} salen de ${bancos.find((c) => c.id === cuentaId)?.nombre ?? "esa cuenta"}.` : `Los sueldos del equipo con cuenta ${TEXTO_BANCO[banco]} ya no propone cuenta.`,
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type CampoAviso = "minimoCaja" | "avisoGastoPct" | "avisoVenceDias";

function CuandoAvisa({ parametros, guardar, guardando, responsableListo }: { parametros: ParametrosFinanzasConCorte; guardar: Guardar; guardando: boolean; responsableListo: boolean }) {
  const router = useRouter();
  const corteVigente = parametros.inicioFinanzas ?? SIN_CORTE;
  const [corteBase, setCorteBase] = useState(corteVigente);
  const [corte, setCorte] = useState(corteVigente);
  const opciones = useMemo(() => opcionesCorte(hoyLima(), parametros.inicioFinanzas ?? null), [parametros.inicioFinanzas]);
  if (corteVigente !== corteBase) {
    setCorteBase(corteVigente);
    setCorte(corteVigente);
  }

  async function guardarAviso(campo: CampoAviso, nuevo: string) {
    // La función reemplaza los tres números: los otros dos salen de lo último que hay en la base, no de lo que quedó en esta pantalla (otra pestaña, o dos casillas seguidas).
    const fresco = await parametrosFinanzasFrescos();
    if (!fresco) {
      avisar.error(NO_SE_PUDO_LEER);
      return false;
    }
    const v = validarParametrosFinanzas({ minimoCaja: String(fresco.minimoCaja), avisoGastoPct: String(fresco.avisoGastoPct), avisoVenceDias: String(fresco.avisoVenceDias), [campo]: nuevo });
    if (!v.ok) {
      avisar.error(v.error);
      return false;
    }
    return guardar(
      () => createClient().rpc("guardar_parametros_finanzas" as never, { p_minimo_caja: v.valor.minimoCaja, p_aviso_gasto_pct: v.valor.avisoGastoPct, p_aviso_vence_dias: v.valor.avisoVenceDias } as never),
      "guardar la configuración",
      campo === "minimoCaja"
        ? `Mínimo de caja: S/ ${Math.round(v.valor.minimoCaja).toLocaleString("es-PE")}.`
        : campo === "avisoGastoPct"
          ? `Un gasto avisa si supera su promedio en ${v.valor.avisoGastoPct} %.`
          : `Los vencimientos se avisan con ${v.valor.avisoVenceDias} días.`,
    );
  }

  async function guardarCorte() {
    const fecha = corteParaBase(corte);
    const ok = await guardar(
      () => createClient().rpc("guardar_inicio_finanzas" as never, { p_fecha: fecha } as never),
      "guardar desde cuándo cuenta Finanzas",
      fecha ? `Finanzas cuenta desde el ${fechaDelCorte(fecha)}.` : "Finanzas vuelve a contar todo lo registrado.",
    );
    if (!ok) setCorte(corteBase);
    else router.refresh();
  }

  return (
    <section className="vs-liquido cv-bloque" data-luz style={{ "--e": 3 } as React.CSSProperties}>
      <TituloSeccion ayuda="Cuándo el sistema te llama la atención. La caja es la de toda CAYLA, entre todas las cuentas, sin la tarjeta de crédito ni la parte de CLAURE: si la proyección de alguna semana baja de ahí, el Resumen y el Flujo de caja avisan. Un gasto se compara con los últimos 6 meses del mismo proveedor y tienda.">
        Cuándo te avisa
      </TituloSeccion>
      <div className="cv-vigia">
        <div className="vs-dato" data-guia="config.caja-caja" style={{ "--i": 0 } as React.CSSProperties}>
          <GotaDinero trazo="caja" />
          <span className="vs-textos cv-frase">Avisa si la caja baja de</span>
          <span className="cv-unidad">S/</span>
          <Casilla valor={String(parametros.minimoCaja)} etiqueta="Mínimo de caja, en soles" ancho="w-24" alGuardar={(n) => guardarAviso("minimoCaja", n)} />
        </div>
        <div className="contents" data-guia="config.caja-avisos">
          <div className="vs-dato" style={{ "--i": 1 } as React.CSSProperties}>
            <GotaDinero trazo="gasto" i={1} />
            <span className="vs-textos cv-frase">Avisa si un gasto sube más de</span>
            <Casilla valor={String(parametros.avisoGastoPct)} etiqueta="Cuánto puede subir un gasto sobre su promedio, en porcentaje" ancho="w-16" alGuardar={(n) => guardarAviso("avisoGastoPct", n)} />
            <span className="cv-unidad">%</span>
          </div>
          <div className="vs-dato" style={{ "--i": 2 } as React.CSSProperties}>
            <GotaDinero trazo="calendario" i={2} />
            <span className="vs-textos cv-frase">Avisa lo que vence antes de</span>
            <Casilla valor={String(parametros.avisoVenceDias)} etiqueta="Con cuántos días se avisa un vencimiento" ancho="w-16" alGuardar={(n) => guardarAviso("avisoVenceDias", n)} />
            <span className="cv-unidad">días</span>
          </div>
        </div>
        {parametros.corteDisponible && (
          <div className="vs-dato" data-guia="config.caja-corte" style={{ "--i": 3 } as React.CSSProperties}>
            <GotaDinero trazo="reloj" i={3} />
            <span className="vs-textos">
              <span className="vs-rotulo">Los reportes cuentan desde</span>
              <Desplegable forma="campo" className="cv-combo" etiquetaAccesible="Desde cuándo cuenta Finanzas" valor={corte} onValor={setCorte} opciones={opciones} deshabilitado={guardando} />
              {corte !== corteBase && <span className="vs-rotulo cv-consecuencia">{consecuenciaCorte(corteParaBase(corte))}</span>}
            </span>
            {corte !== corteBase && (
              <Boton peso="primario" cargando={guardando} type="button" onClick={guardarCorte} disabled={guardando || !responsableListo}>
                Guardar
              </Boton>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function VistaDinero({
  cuentas,
  cuentasAjenas,
  medios,
  maquinas,
  planilla,
  parametros,
  hoy,
}: {
  cuentas: readonly CuentaDinero[];
  /** Las cuentas de otra empresa (ADR-0638): solo se muestran. */
  cuentasAjenas: readonly CuentaOtraEmpresa[];
  medios: readonly FilaMedio[];
  /** Nulo = la base todavía no conoce las máquinas: no se dibujan. */
  maquinas: readonly MaquinaPos[] | null;
  /** Nulo = la base todavía no sabe de la planilla: no se dibuja. */
  planilla: readonly CuentaPlanilla[] | null;
  parametros: ParametrosFinanzasConCorte | null;
  hoy: string;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useLuzDelMouse(raiz);
  const { responsable, guardando, guardar } = useGuardarCasilla();
  const [agregar, setAgregar] = useState(false);
  const [editar, setEditar] = useState<CuentaDinero | null>(null);
  const [tarifaDe, setTarifaDe] = useState<MaquinaPos | null>(null);
  const activas = useMemo(() => cuentas.filter((c) => !c.archivada), [cuentas]);

  return (
    <div className="vs-raiz" ref={raiz}>
      <div className="vs-firma" data-guia="config.guardado">
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </div>
      <Cobros medios={medios} activas={activas} guardar={guardar} guardando={guardando} />
      <div className="cv-dos">
        <Cuentas cuentas={cuentas} cuentasAjenas={cuentasAjenas} medios={medios} guardando={guardando} alAgregar={() => setAgregar(true)} alEditar={setEditar} />
        <MaquinasYPlanilla maquinas={maquinas} planilla={planilla} activas={activas} guardar={guardar} guardando={guardando} alTarifa={setTarifaDe} />
      </div>
      {parametros ? (
        <CuandoAvisa parametros={parametros} guardar={guardar} guardando={guardando} responsableListo={responsable.listo} />
      ) : (
        <Aviso tono="error" titulo="No se pudo leer cuándo te avisa">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      )}
      {agregar && <AgregarCuentaModal hoy={hoy} onCerrar={() => setAgregar(false)} />}
      {editar && <EditarCuentaModal cuenta={editar} hoy={hoy} onCerrar={() => setEditar(null)} />}
      {tarifaDe && <TarifaMaquinaModal maquina={tarifaDe} onCerrar={() => setTarifaDe(null)} />}
    </div>
  );
}
