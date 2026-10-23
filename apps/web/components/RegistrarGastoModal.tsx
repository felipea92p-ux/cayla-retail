"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar, enfocar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { CampoFin, InputFin, RadiosFin, SalidaFin, SelectFin } from "@/components/finanzas/kit";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { Aviso } from "@/components/ui/Aviso";
import { CampoCuentaFin, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { cuentaDeSalida, medioDeCuenta, mediosDeBanco } from "@/lib/cuenta-sellada-reglas";
import { choqueConElFijo, claveDeFijo, fijosQueSeParecen, mesDelFijo, textoFechaDeFijo } from "@/lib/fijos-del-mes-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaLima } from "@/lib/fechas-lima";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { UMBRAL_BANCARIZACION, avisoBancarizacion } from "@/lib/no-deducible-reglas";
import { ProveedorElegido } from "@/components/ProveedorElegido";
import { FichaDePagoTarjeta } from "@/components/gasto-fijo/FichaDePagoTarjeta";
import { AvisoNoDeducible } from "@/components/AvisoNoDeducible";
import {
  TEXTO_COMPROBANTE,
  TEXTO_MEDIO,
  TIPOS_COMPROBANTE,
  borradorDesdeFijo,
  textoCuandoLlega,
  type ProveedorGasto,
  igvDeFactura,
  mediosPara,
  parsearMonto,
  partirSerieNumero,
  solesRedondo,
  sumarProveedorDeGasto,
  textoMes,
  textoVidaUtil,
  validarActivo,
  validarGasto,
  type BorradorGasto,
  type CategoriaGasto,
  type EgresoPorClasificar,
  type GastoFijoMes,
  type TipoActivo,
  type TipoComprobante,
  type UbicacionGastos,
} from "@/lib/gastos-reglas";
import { MAX_DESCRIPCION_GASTO, MAX_NOMBRE_ACTIVO } from "@/lib/finanzas-topes";
import { Boton } from "@/components/ui/campos";

// Registrar un gasto o un activo fijo (ADR-0195 F2). Una sola ventana para los casos de la vida real:
//  · sin comprobante (mototaxi, bolsas): cómo se pagó; si fue efectivo, sale del cajón abierto de esa tienda;
//  · con factura, boleta o recibo por honorarios: el proveedor, la serie y el número; al contado o a crédito (Por pagar);
//  · clasificar un egreso que la tienda ya registró en Caja: el monto y la tienda vienen fijos.
//  · F2b: un gasto que nace de un gasto fijo (viene lleno), o un ACTIVO (un mueble, una laptop): el mismo comprobante y
//    pago, pero dice qué tipo de activo es y su vida útil, y la base lo deprecia.
// La pantalla solo arma y explica; la base vuelve a validar todo (`registrar_gasto`, `registrar_activo`).
// «¿No está? Súmalo» pregunta antes «¿no será un proveedor que ya tienes?» (`sumarProveedorDeGasto`, 2026-09-25): «Sí» lo
// elige aquí mismo; «No, es otro» deja sumar; sumar sin contestar no suma. Si es el mismo RUC o el mismo nombre, se elige
// el que ya está: es lo que haría la base (`registrar_proveedor_de_gasto`), dicho antes y sin viaje.
// Un gasto suelto que se parece a un gasto fijo pendiente (misma tienda, categoría y mes) pregunta «¿es ese fijo?» antes de registrar
// (`fijosQueSeParecen`, tarea #1 de /pantalla, 2026-10-22): «Sí» lo registra con su `gasto_fijo_id` y lo cierra; «No» sigue aparte.
// Registrar sin contestar no registra. Solo con los fijos que le pasa Gastos (de todas las tiendas, del mes que se mira y del de hoy): Caja
// no los pasa y no pregunta. Un gasto que cierra un fijo tiene que ser de ESE mes: la base cuenta un gasto por fijo y por mes de la fecha.

export type { ProveedorGasto };

// El campo del formulario al que lleva el foco un choque con el fijo (`choqueConElFijo`).
const IDS_DE_CAMPO = { categoria: "gasto-categoria", fecha: "gasto-fecha" } as const;

export function RegistrarGastoModal({
  categorias,
  ubicaciones,
  proveedores: proveedoresIniciales,
  cajasAbiertas,
  esLider,
  ubicacionInicial,
  egreso,
  fijo,
  clase = "gasto",
  tiposActivo = [],
  fijosDelMes = [],
  hoy,
  onCerrar,
}: {
  categorias: CategoriaGasto[];
  ubicaciones: UbicacionGastos[];
  proveedores: ProveedorGasto[];
  cajasAbiertas: { id: string; ubicacionId: string }[];
  esLider: boolean;
  ubicacionInicial: string;
  /** Si viene, se está clasificando este egreso de caja como gasto (o como activo). */
  egreso?: EgresoPorClasificar;
  /** F2b: el gasto fijo del que nace este gasto (viene lleno con lo de siempre). */
  fijo?: GastoFijoMes;
  /** F2b: «activo» registra un activo fijo en vez de un gasto. */
  clase?: "gasto" | "activo";
  tiposActivo?: TipoActivo[];
  /** Los fijos (de varios meses y de todas las tiendas, cada fila con su fecha esperada): con ellos, un gasto suelto pregunta si es uno de los que faltan. Sin ellos, no pregunta. */
  fijosDelMes?: GastoFijoMes[];
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  // El gasto lleva la marca atada a lo que se manda (`useIntento`, ADR-0398): si la respuesta se pierde, la hoja se congela hasta
  // reenviar lo mismo o preguntar si se guardó. Caja abre esta hoja desde «Registrar gasto» ▸ formulario completo.
  const intento = useIntento("registrar_gasto");
  const [guardandoActivo, setGuardandoActivo] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [nuevoProveedor, setNuevoProveedor] = useState<{ nombre: string; ruc: string } | null>(null);
  const [descartados, setDescartados] = useState<ReadonlySet<string>>(() => new Set());
  const alSumar = nuevoProveedor ? sumarProveedorDeGasto(nuevoProveedor, proveedores, descartados) : null;
  // El activo (solo Finanzas) sigue con una marca por apertura: `registrar_activo` todavía no compara el contenido en la base.
  // Va con el /chaos de Finanzas (deuda declarada en `lib/intento-reglas.test.ts`, TOKEN_FIJO_TODAVIA).
  const [tokenActivo] = useState(() => crypto.randomUUID());
  const [documento, setDocumento] = useState("");
  // Los fijos (`claveDeFijo`: el fijo y su mes) a los que ya se contestó «No, es otro gasto»: no se vuelve a preguntar por ellos.
  const [fijosDescartados, setFijosDescartados] = useState<ReadonlySet<string>>(() => new Set());
  const esActivo = clase === "activo";
  const guardando = esActivo ? guardandoActivo : intento.enviando;
  // Vida útil = la del tipo de bien (spike: un solo campo «10 años · muebles»); el contador confirma la de cada tipo.
  const [activo, setActivo] = useState({ tipo: "" });
  const [b, setB] = useState<BorradorGasto>(() => ({
    ubicacion: egreso?.ubicacionId ?? (esActivo && ubicacionInicial === "empresa" ? (ubicaciones[0]?.id ?? "") : ubicacionInicial),
    categoria: "",
    descripcion: egreso?.nota ?? "",
    fecha: egreso ? (diaLima(egreso.creadoEn) ?? "") : hoy,
    monto: egreso ? String(egreso.monto) : "",
    // Lo más común (la luz, el alquiler, el contador) llega con factura; lo que sale del cajón, casi nunca.
    comprobante: egreso ? "sin_comprobante" : "factura",
    proveedorId: "",
    serie: "",
    numero: "",
    condicion: "contado",
    vence: "",
    medio: egreso ? "efectivo" : "",
    cajaId: "",
    egresoId: egreso?.id ?? "",
    referencia: "",
    ...(fijo ? borradorDesdeFijo(fijo, hoy) : {}),
  }));
  // Si cambia lo que decía «es ese fijo» (la categoría, la tienda o la fecha), el enlace ya no vale: se vuelve a preguntar. Un gasto que
  // nace de un fijo (`fijo`) conserva el suyo.
  const poner = <K extends keyof BorradorGasto>(k: K, v: BorradorGasto[K]) =>
    setB((x) => ({ ...x, [k]: v, ...(!fijo && (k === "categoria" || k === "ubicacion" || k === "fecha") ? { gastoFijoId: undefined } : {}) }));

  const conComprobante = b.comprobante !== "sin_comprobante";
  const aCredito = conComprobante && b.condicion === "credito";
  const cajaDeLaTienda = cajasAbiertas.find((c) => c.ubicacionId === b.ubicacion) ?? null;
  const monto = parsearMonto(b.monto);
  // ¿Este gasto suelto es uno de los fijos que faltan? Solo se pregunta en un gasto nuevo (no al clasificar un egreso, ni un activo, ni uno que ya viene de un fijo).
  const sePareceA =
    !fijo && !egreso && !esActivo
      ? fijosQueSeParecen(fijosDelMes, { ubicacion: b.ubicacion, categoria: b.categoria, fecha: b.fecha, monto: monto.ok ? monto.valor : null, proveedorId: b.proveedorId }, fijosDescartados)
      : [];
  // El fijo elegido tiene que seguir pendiente y ser del mes de la fecha; si la pantalla se releyó y ya está registrado, el enlace deja de viajar.
  const fijoElegido = !fijo && b.gastoFijoId ? (fijosDelMes.find((f) => f.id === b.gastoFijoId && f.estado !== "registrado" && mesDelFijo(f) === b.fecha.slice(0, 7)) ?? null) : null;
  const fijosPorPreguntar = fijoElegido ? [] : sePareceA;
  // El fijo que este gasto va a cerrar (el que abrió la hoja o el que se eligió): es el único `gasto_fijo_id` que se manda.
  const fijoDelGasto = fijo ?? fijoElegido;
  const igv = b.comprobante === "factura" && monto.ok ? igvDeFactura(monto.valor) : 0;
  const categoria = categorias.find((c) => c.codigo === b.categoria) ?? null;
  const tipoActivo = tiposActivo.find((t) => t.codigo === activo.tipo) ?? null;
  const opcionesUbicacion = useMemo(
    () => [...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre })), ...(esLider && !esActivo ? [{ valor: "empresa", texto: "De la empresa (no es de una tienda)" }] : [])],
    [ubicaciones, esLider, esActivo],
  );
  const comprobantes = esActivo ? TIPOS_COMPROBANTE.filter((t) => t !== "recibo_por_honorarios") : TIPOS_COMPROBANTE;

  // «Salió de» (ADR-0195 F3b, como el spike): se elige la CUENTA —el cajón, la caja fuerte, lo que tiene el líder, un banco o
  // la tarjeta de crédito— y el medio sale de ella; con un banco se dice cómo (transferencia, Yape, Plin). Del cajón, la base
  // crea su egreso en la misma operación. Sin cuentas (la base no respondió), queda el combo de medios de antes.
  const ubicacionCuentas = b.ubicacion && b.ubicacion !== "empresa" ? b.ubicacion : null;
  const cuentasPago = useCuentasParaElegir("pago", ubicacionCuentas, !egreso);
  // Un gasto de una tienda solo sale del cajón de ESA tienda (la base lo exige); los «de la empresa», de cualquiera.
  const cuentasGasto = useMemo(
    () => cuentasPago.cuentas.filter((c) => c.tipo !== "cajon" || b.ubicacion === "empresa" || c.ubicacionId === b.ubicacion),
    [cuentasPago.cuentas, b.ubicacion],
  );
  const conCuentas = cuentasPago.listo && cuentasGasto.length > 0;
  const [medioBanco, setMedioBanco] = useState<"transferencia" | "yape" | "plin" | "deposito">(() =>
    b.medio === "yape" || b.medio === "plin" || b.medio === "deposito" ? b.medio : "transferencia",
  );
  const cuentaSalida = cuentaDeSalida(cuentasGasto, "pago", b.cuentaId, b.medio || undefined);
  const salida = cuentasGasto.find((c) => c.id === cuentaSalida) ?? null;
  const bancoConMedio = salida?.tipo === "banco" ? (mediosDeBanco(conComprobante).includes(medioBanco) ? medioBanco : "transferencia") : null;
  const medioSalida = salida ? (medioDeCuenta(salida.tipo) ?? bancoConMedio ?? "transferencia") : "";
  // ADR-0362 (fase 6 · actividad 6, decisiones 56 y 70): un comprobante de S/ 2 000 o más pagado en efectivo queda «no deducible». Se
  // deja registrar; la hoja lo avisa. Sin comprobante o a crédito (se paga después, desde Por pagar) no hay nada que avisar aquí.
  const pagaAhora = conComprobante && !aCredito && monto.ok;
  const avisoNoDeducible = pagaAhora
    ? avisoBancarizacion(monto.valor, [
        { monto: monto.valor, medio: egreso ? "efectivo" : conCuentas ? medioSalida : b.medio, tipoCuenta: egreso ? "cajon" : (salida?.tipo ?? null) },
      ])
    : null;

  function elegirComprobante(t: TipoComprobante) {
    setB((x) => {
      const medios = mediosPara(t);
      const medio = x.medio && medios.includes(x.medio) ? x.medio : "";
      return { ...x, comprobante: t, medio: x.egresoId ? "efectivo" : medio, condicion: x.egresoId || t === "sin_comprobante" ? "contado" : x.condicion };
    });
  }

  function elegirProveedor(id: string) {
    poner("proveedorId", id);
    setNuevoProveedor(null);
  }

  async function sumarProveedor() {
    if (!nuevoProveedor || !alSumar) return;
    if (alSumar.paso === "es") {
      elegirProveedor(alSumar.proveedor.id);
      return avisar.exito(`Quedó elegido ${alSumar.proveedor.nombre}`, { detalle: "Ya estaba en el directorio: no se creó otro." });
    }
    if (alSumar.paso === "incompleto") return avisar.error("Escribe el nombre del proveedor.", { enfocar: "nuevo-prov-nombre" });
    if (alSumar.paso === "preguntar") {
      return avisar.error(
        alSumar.parecidos.length === 1
          ? `Antes de sumar, dinos si «${nuevoProveedor.nombre.trim()}» es el mismo proveedor que «${alSumar.parecidos[0].proveedor.nombre}».`
          : `Antes de sumar, dinos si «${nuevoProveedor.nombre.trim()}» es alguno de los proveedores de arriba.`,
        { enfocar: "gasto-proveedor-parecido" },
      );
    }
    const { data, error } = await createClient().rpc("registrar_proveedor_de_gasto" as never, { p_nombre: nuevoProveedor.nombre, p_ruc: nuevoProveedor.ruc || null } as never);
    if (error) return avisar.error(traducirError(error, "sumar el proveedor"));
    const id = String(data);
    if (!proveedores.some((p) => p.id === id)) setProveedores((ps) => [...ps, { id, nombre: nuevoProveedor.nombre.trim(), ruc: nuevoProveedor.ruc || null }].sort((x, y) => x.nombre.localeCompare(y.nombre)));
    elegirProveedor(id);
  }

  async function guardar() {
    const conCaja = conCuentas && !egreso && !aCredito
      ? {
          ...b,
          medio: medioSalida as BorradorGasto["medio"],
          cuentaId: cuentaSalida ?? undefined,
          // Del cajón: su caja abierta (si no está en la lista, la base la busca por la cuenta).
          cajaId: salida?.tipo === "cajon" ? (cajasAbiertas.find((c) => c.ubicacionId === salida.ubicacionId)?.id ?? "") : "",
        }
      : { ...b, cuentaId: undefined, cajaId: b.medio === "efectivo" && !b.egresoId ? (cajaDeLaTienda?.id ?? "") : "" };
    const v = esActivo
      ? validarActivo({ ...conCaja, tipo: activo.tipo, nombre: b.descripcion, serie: "", vidaUtilMeses: String(tipoActivo?.vidaUtilMeses ?? "") }, hoy)
      : validarGasto({ ...conCaja, gastoFijoId: fijoDelGasto?.id }, hoy);
    if (!v.ok) return avisar.error(v.error);
    // Lo que cierra un fijo tiene que ser de ese fijo (su categoría y su mes): si no, lo cerraría equivocado y nadie lo vería como pendiente.
    // Con la hoja abierta desde un fijo la categoría ya va fija; esto cubre cualquier otro camino por el que llegue distinta.
    const choque = fijoDelGasto ? choqueConElFijo(fijoDelGasto, { categoria: b.categoria, fecha: b.fecha }) : null;
    if (choque) return avisar.error(choque.mensaje, { enfocar: IDS_DE_CAMPO[choque.campo] });
    // Registrar sin contestar si es uno de los fijos que faltan es justo lo que duplica un gasto: no se registra.
    if (fijosPorPreguntar.length > 0) return avisar.error("Antes de registrar, dinos si es uno de los gastos fijos de arriba.", { enfocar: "gasto-fijo-parecido" });
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    if (esActivo) {
      setGuardandoActivo(true);
      const { error } = await firmar(createClient().rpc("registrar_activo" as never, { ...v.valor, p_token: tokenActivo } as never), responsable.firma());
      setGuardandoActivo(false);
      responsable.despues(error);
      if (error) return avisar.error(traducirError(error, "registrar el activo"));
      return registrado();
    }
    const r = await intento.enviar(huellaDe(v.valor), (token, senal) =>
      firmar(createClient().rpc("registrar_gasto" as never, { ...v.valor, p_token: token } as never), responsable.firma()).abortSignal(senal),
    );
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") {
      // Un fijo que ya tenía su gasto (otra persona lo registró): se vuelve a leer la pantalla para que salga «registrado» y la hoja suelte el enlace.
      if (fijoDelGasto && r.error?.code === "23505") router.refresh();
      return avisar.error(traducirError(r.error, "registrar el gasto"));
    }
    registrado();
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return registrado();
    if (res.tipo === "no_llego") {
      avisar.aviso("El gasto no se registró", { detalle: "No quedó nada guardado. Revisa los datos y vuelve a registrarlo." });
      return;
    }
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  function registrado() {
    const que = esActivo ? "Activo" : "Gasto";
    avisar.exito(egreso ? `Egreso clasificado como ${que.toLowerCase()}` : `${que} registrado`, {
      detalle: aCredito
        ? `Quedó en Por pagar hasta el ${b.vence.split("-").reverse().join("/")}.`
        : !egreso && (conCuentas ? salida?.tipo === "cajon" : b.medio === "efectivo")
          ? "Salió del cajón: la caja ya lo descuenta."
          : !egreso && conCuentas && salida
            ? `Salió de ${salida.nombre}.`
          : esActivo
            ? "Se deprecia desde el próximo mes."
            : undefined,
    });
    // El refresco va DESPUÉS de retirar la guardia de «¿Salir sin guardar?» (`retirarYa`): juntos, Next podía volver a montar
    // la pantalla de atrás o recargarla entera (Caja limpia su URL con `replaceState`, 2026-10-08).
    const guardiaFuera = avisoSalida.retirarYa();
    onCerrar();
    void guardiaFuera.then(() => router.refresh());
  }

  // «¿Salir sin guardar?» (2026-09-28). Escape, el velo, la ✕ o «Cancelar» cerraban la hoja y lo tipeado (monto, serie,
  // proveedor) se perdía sin aviso. Todos pasan por `pedirAccion` (Escape, el velo y la ✕ por `antesDeCerrar`, no por `onClose`: `lib/hojas-salida-sin-guardar.test.ts`); guardar bien cierra directo. La foto de apertura ya
  // trae lo que llega precargado (un egreso por clasificar, un gasto fijo): solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ b, documento, activo, nuevoProveedor });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(
    fotoActual !== fotoAlAbrir,
    `Llenaste parte de este ${esActivo ? "activo" : "gasto"} y todavía no se registró. Si cierras ahora, se pierde lo que llenaste.`
  );

  const titulo = egreso ? (esActivo ? "Es un activo fijo" : "Es un gasto") : esActivo ? "Registrar activo fijo" : fijo ? `Registrar ${fijo.descripcion.toLowerCase()}` : "Registrar gasto";
  const bajada = egreso
    ? `${egreso.ubicacionNombre} · ${soles(egreso.monto)} que salieron del cajón · «${egreso.motivo}${egreso.nota ? ` — ${egreso.nota}` : ""}»`
    : esActivo
      ? "Algo que sirve varios años: muebles, equipos, remodelación, máquinas del Taller."
      : fijo
        ? `Gasto fijo de ${fijo.ubicacionNombre}: llega ${textoCuandoLlega(fijo.momento, fijo.diaDelMes)}${fijo.montoVariable ? ". Escribe el monto del recibo." : "."}`
        : "Lo que se paga para que el negocio funcione. La planilla no va aquí: viene de Dynamic.";

  const bloqueComprobante = (
    <div data-guia="fin-gastos.form-comprobante">
        <CampoFin etiqueta="¿Tiene comprobante de un proveedor?">
          <RadiosFin nombre="gasto-comprobante" etiqueta="Comprobante" valor={b.comprobante} onValor={elegirComprobante} opciones={comprobantes.map((t) => ({ valor: t, texto: TEXTO_COMPROBANTE[t] }))} />
        </CampoFin>

        {conComprobante && (
          <div data-sin-cascada>
            <div className="fin-dos-campos">
              <CampoFin
                etiqueta="Proveedor"
                htmlFor="gasto-proveedor"
                ayuda={
                  nuevoProveedor ? undefined : (
                    <button
                      type="button"
                      className="btn-enlace text-[11.5px]"
                      onClick={() => {
                        setNuevoProveedor({ nombre: "", ruc: "" });
                        setDescartados(new Set());
                      }}
                    >
                      ¿No está? Súmalo
                    </button>
                  )
                }
              >
                <SelectFin
                  id="gasto-proveedor"
                  valor={b.proveedorId}
                  onValor={(v) => poner("proveedorId", v)}
                  marcador="Elige…"
                  opciones={proveedores.map((p) => ({ valor: p.id, texto: `${p.nombre}${p.ruc ? ` · ${p.ruc}` : ""}` }))}
                />
              </CampoFin>
              <CampoFin etiqueta="Serie y número" htmlFor="gasto-documento" tono={documento && !b.numero ? "aviso" : undefined} ayuda={documento && !b.numero ? "Como está en el comprobante: serie, guion y número (F001-00140)." : undefined}>
                <InputFin
                  id="gasto-documento"
                  placeholder="F001-00140"
                  value={documento}
                  onChange={(e) => {
                    const texto = e.target.value.toUpperCase();
                    setDocumento(texto);
                    const partes = partirSerieNumero(texto);
                    setB((x) => ({ ...x, serie: partes.serie, numero: partes.numero }));
                  }}
                />
              </CampoFin>
            </div>
            <ProveedorElegido proveedor={proveedores.find((p) => p.id === b.proveedorId)} />
            {nuevoProveedor && (
              <div className="nota-cayla mb-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                  <CampoFin etiqueta="Nombre del proveedor" htmlFor="nuevo-prov-nombre" className="!mb-0">
                    <InputFin id="nuevo-prov-nombre" value={nuevoProveedor.nombre} onChange={(e) => setNuevoProveedor((n) => n && { ...n, nombre: e.target.value })} placeholder="Hidrandina" />
                  </CampoFin>
                  <CampoFin etiqueta="RUC (opcional)" htmlFor="nuevo-prov-ruc" className="!mb-0">
                    <InputFin id="nuevo-prov-ruc" inputMode="numeric" value={nuevoProveedor.ruc} onChange={(e) => setNuevoProveedor((n) => n && { ...n, ruc: e.target.value.replace(/\D/g, "").slice(0, 11) })} />
                  </CampoFin>
                </div>
                {alSumar?.paso === "es" && (
                  <div className="mt-3">
                    <PreguntaParecido
                      id="gasto-proveedor-parecido"
                      titulo={alSumar.por === "ruc" ? `El RUC ${alSumar.proveedor.ruc} ya es de «${alSumar.proveedor.nombre}»` : `«${alSumar.proveedor.nombre}» ya está en la lista`}
                      bajada="Es el mismo proveedor: elígelo y el gasto queda en su ficha. No se crea otro."
                      opciones={[{ id: alSumar.proveedor.id, nombre: alSumar.proveedor.nombre, detalle: alSumar.proveedor.ruc ? `RUC ${alSumar.proveedor.ruc}` : "sin RUC" }]}
                      si={(o) => ({ texto: `Usar ${o.nombre}`, onClick: () => elegirProveedor(o.id) })}
                    />
                  </div>
                )}
                {alSumar?.paso === "preguntar" && (
                  <div className="mt-3">
                    <PreguntaParecido
                      id="gasto-proveedor-parecido"
                      titulo="¿No será un proveedor que ya tienes?"
                      bajada="Si es el mismo, elígelo: sus facturas y lo que se le debe tienen que quedar en una sola ficha."
                      opciones={alSumar.parecidos.map(({ proveedor }) => ({ id: proveedor.id, nombre: proveedor.nombre, detalle: proveedor.ruc ? `RUC ${proveedor.ruc}` : "sin RUC" }))}
                      si={(o) => ({ texto: `Sí, es ${o.nombre}`, onClick: () => elegirProveedor(o.id) })}
                      no={{
                        texto: `No, «${nuevoProveedor.nombre.trim()}» es otro proveedor`,
                        onClick: () => setDescartados((prev) => new Set([...prev, ...alSumar.parecidos.map((p) => p.proveedor.id)])),
                      }}
                    />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => setNuevoProveedor(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={sumarProveedor}>
                    Sumar proveedor
                  </button>
                  <span className="text-[12px]">Queda en el directorio; sus cuentas se completan en Compras ▸ Proveedores.</span>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );

  return (
    <Modal variante="hoja" titulo={titulo} subtitulo={bajada} onClose={onCerrar} antesDeCerrar={avisoSalida.pedirAccion} tamano="mediana" bloqueado={guardando || intento.incierto}>
      {/* Los campos se congelan mientras no se sabe si el gasto se guardó (la cascada de la hoja sigue igual: globals.css). */}
      <fieldset disabled={intento.incierto} className="campos-congelables min-w-0">
        {/* Un gasto que viene de un fijo muestra a quién y cómo se le paga (ADR-0452): quien lo paga no depende de quien lo cargó. */}
        {fijo && !esActivo && <FichaDePagoTarjeta gastoFijoId={fijo.id} hoy={hoy} />}
        {/* Orden del spike: un gasto empieza por su comprobante; un activo, por qué es, dónde está y cuánto dura. */}
        {!esActivo && bloqueComprobante}
        <div className="grid gap-x-3 sm:grid-cols-[1fr_10.5rem]" data-guia="fin-gastos.form-que">
          {esActivo ? (
            <CampoFin etiqueta="Qué es" htmlFor="gasto-descripcion">
              <InputFin id="gasto-descripcion" value={b.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder="Estante de exhibición en L" maxLength={MAX_NOMBRE_ACTIVO} />
            </CampoFin>
          ) : (
            <CampoFin etiqueta="Qué se pagó" htmlFor="gasto-descripcion">
              <InputFin id="gasto-descripcion" value={b.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder="Luz de septiembre" maxLength={MAX_DESCRIPCION_GASTO} />
            </CampoFin>
          )}
          <CampoFin etiqueta={conComprobante ? "Fecha del comprobante" : "Fecha"} htmlFor="gasto-fecha">
            <InputFin id="gasto-fecha" type="date" max={hoy} value={b.fecha} onChange={(e) => poner("fecha", e.target.value)} />
          </CampoFin>
        </div>

        {esActivo ? (
          <div className="fin-dos-campos">
            <CampoFin etiqueta="Dónde está" htmlFor="gasto-ubicacion">
              <SelectFin
                id="gasto-ubicacion"
                valor={b.ubicacion}
                deshabilitado={!!egreso || opcionesUbicacion.length < 2}
                onValor={(v) => poner("ubicacion", v)}
                opciones={opcionesUbicacion}
              />
            </CampoFin>
            <CampoFin
              etiqueta="Vida útil"
              htmlFor="activo-tipo"
              ayuda={
                tipoActivo
                  ? `Cuenta ${tipoActivo.cuenta}.${monto.ok ? ` Se deprecia ${soles((monto.valor - igv) / Math.max(1, tipoActivo.vidaUtilMeses))} al mes desde el próximo mes${igv ? ", sobre el costo sin IGV" : ""}.` : ""}`
                  : "La sugiere el tipo de bien; el contador la confirma."
              }
            >
              <SelectFin
                id="activo-tipo"
                valor={activo.tipo}
                onValor={(tipo) => setActivo({ tipo })}
                marcador="Elige qué tipo de bien es…"
                opciones={tiposActivo.map((t) => ({ valor: t.codigo, texto: `${textoVidaUtil(t.vidaUtilMeses)} · ${t.nombre.toLowerCase()}` }))}
              />
            </CampoFin>
          </div>
        ) : (
          <div className="fin-dos-campos" data-guia="fin-gastos.form-categoria">
            <CampoFin
              etiqueta="Categoría"
              htmlFor="gasto-categoria"
              ayuda={
                fijo
                  ? `${categoria ? `Va a la cuenta ${categoria.cuenta}. ` : ""}Viene del fijo «${fijo.descripcion}»: si es otro gasto, regístralo aparte; si la categoría del fijo está mal, se corrige en Configuración ▸ Gastos fijos.`
                  : categoria
                    ? `Va a la cuenta ${categoria.cuenta}. Nadie la elige: viene con la categoría.`
                    : "Sin «Otros»: si no calza en ninguna, avisa al líder."
              }
            >
              <SelectFin
                id="gasto-categoria"
                valor={b.categoria}
                // Como la tienda: la hoja que nace de un fijo cierra ESE fijo, y un fijo es de una categoría (`choqueConElFijo`).
                deshabilitado={!!fijo}
                onValor={(v) => poner("categoria", v)}
                marcador="Elige…"
                opciones={categorias.map((c) => ({ valor: c.codigo, texto: `${c.nombre} — ${c.ejemplos}` }))}
              />
            </CampoFin>
            <CampoFin etiqueta="A quién se le carga" htmlFor="gasto-ubicacion">
              <SelectFin
                id="gasto-ubicacion"
                valor={b.ubicacion}
                deshabilitado={!!egreso || !!fijo || opcionesUbicacion.length < 2}
                onValor={(v) => poner("ubicacion", v)}
                opciones={opcionesUbicacion}
              />
            </CampoFin>
          </div>
        )}

        {fijosPorPreguntar.length > 0 && (
          <div className="mb-4" data-guia="fin-gastos.form-fijo-parecido" data-sin-cascada>
            <PreguntaParecido
              id="gasto-fijo-parecido"
              titulo={
                fijosPorPreguntar.length === 1
                  ? `¿Es «${fijosPorPreguntar[0]!.descripcion}» de ${textoMes(mesDelFijo(fijosPorPreguntar[0]!))}?`
                  : `¿Es uno de tus gastos fijos de ${textoMes(mesDelFijo(fijosPorPreguntar[0]!))}?`
              }
              bajada="Si es ese, queda cerrado como fijo: ya no sigue pendiente en «Fijos del mes» y nadie lo paga dos veces. Si no, se registra como un gasto aparte."
              opciones={fijosPorPreguntar.map((f) => ({ id: f.id, nombre: f.descripcion, detalle: `${f.montoVariable ? "~" : ""}${solesRedondo(f.monto)} · ${textoFechaDeFijo(f, hoy)}` }))}
              si={(o) => ({
                // El nombre ya va en el texto de la fila: el botón dice lo mismo siempre y no se desborda con un nombre largo a 375 px.
                texto: "Sí, es este",
                onClick: () => {
                  poner("gastoFijoId", o.id);
                  // El aviso de «Se registra como…» todavía no existe: se enfoca cuando ya se dibujó (el botón que se tocó se desmonta y el foco caía al fondo de la hoja).
                  window.setTimeout(() => enfocar("gasto-fijo-elegido"), 60);
                },
              })}
              no={{
                // «No» vale para TODOS los que se parecían: así un fijo de monto lejano no vuelve a aparecer al rato.
                texto: "No, es otro gasto",
                onClick: () => {
                  setFijosDescartados((prev) => new Set([...prev, ...fijosPorPreguntar.map(claveDeFijo)]));
                  enfocar("gasto-monto");
                },
              }}
            />
          </div>
        )}
        {fijoElegido && (
          <div className="mb-4" data-sin-cascada>
            <Aviso
              id="gasto-fijo-elegido"
              tono="exito"
              chico
              enfocable
              accion={
                <button
                  type="button"
                  className="btn-cayla btn-enlace min-h-6"
                  aria-label={`Quitar «${fijoElegido.descripcion}»: no cerrar ese fijo`}
                  onClick={() => poner("gastoFijoId", undefined)}
                >
                  Quitar
                </button>
              }
            >
              Se registra como «{fijoElegido.descripcion}» de {textoMes(mesDelFijo(fijoElegido))}.
              {conComprobante && !aCredito ? " Con el comprobante ya pagado, después no se puede anular." : ""}
            </Aviso>
          </div>
        )}

        {esActivo && bloqueComprobante}

        <div className="fin-dos-campos" data-guia="fin-gastos.form-monto">
          <CampoFin etiqueta={esActivo ? "Costo (con IGV)" : "Total pagado (con IGV)"} htmlFor="gasto-monto" ayuda={egreso ? "Es lo que salió del cajón: no se cambia." : undefined}>
            <InputFin id="gasto-monto" inputMode="decimal" value={b.monto} readOnly={!!egreso} onChange={(e) => poner("monto", e.target.value)} placeholder="0.00" />
          </CampoFin>
          <CampoFin etiqueta="IGV" ayuda={b.comprobante === "factura" ? "Descontable: sale del total (18 %)." : "Solo la factura da IGV descontable."}>
            <SalidaFin>{b.comprobante === "factura" ? soles(igv) : "S/\u00a00.00"}</SalidaFin>
          </CampoFin>
        </div>

        {/* Guía interactiva (ADR-0389): la condición y de dónde salió, juntas en un recorte. */}
        {!egreso && (
          <div data-guia="fin-gastos.form-pago">
          <CampoFin etiqueta="¿Cómo se paga?">
            <RadiosFin
              nombre="gasto-condicion"
              etiqueta="Condición de pago"
              valor={aCredito ? "credito" : "contado"}
              onValor={(v) => poner("condicion", v)}
              opciones={[
                { valor: "contado", texto: "Ya se pagó" },
                { valor: "credito", texto: "A crédito", deshabilitada: !conComprobante },
              ]}
            />
          </CampoFin>

          <div className="fin-dos-campos" data-sin-cascada>
            {aCredito ? (
              <CampoFin etiqueta="Vence" htmlFor="gasto-vence" ayuda="Queda en Compras ▸ Por pagar hasta ese día.">
                <InputFin id="gasto-vence" type="date" min={b.fecha} value={b.vence} onChange={(e) => poner("vence", e.target.value)} />
              </CampoFin>
            ) : conCuentas ? (
              <CampoCuentaFin
                id="gasto-cuenta"
                etiqueta="Salió de"
                cuentas={cuentasGasto}
                listo={cuentasPago.listo}
                clase="pago"
                medio={medioSalida || "transferencia"}
                sinMedio
                valor={cuentaSalida}
                onValor={(v) => poner("cuentaId", v)}
              />
            ) : (
              <CampoFin
                etiqueta="Salió de"
                htmlFor="gasto-medio"
                tono={b.medio === "efectivo" && !cajaDeLaTienda ? "aviso" : undefined}
                ayuda={
                  b.medio === "efectivo"
                    ? cajaDeLaTienda
                      ? "Sale del cajón abierto de esa tienda: se crea su egreso de caja en la misma operación."
                      : "La caja de esa tienda no está abierta. Si ya salió del cajón, regístralo en Caja y clasifícalo aquí."
                    : "Si sale de un cajón, se crea su egreso de caja en la misma operación."
                }
              >
                <SelectFin<BorradorGasto["medio"]>
                  id="gasto-medio"
                  valor={b.medio}
                  onValor={(m) => poner("medio", m)}
                  marcador="Elige…"
                  opciones={mediosPara(b.comprobante).map((m) => ({ valor: m, texto: m === "efectivo" ? "Efectivo del cajón" : TEXTO_MEDIO[m] }))}
                />
              </CampoFin>
            )}
            {!aCredito && conCuentas && bancoConMedio && (
              <CampoFin etiqueta="Cómo" htmlFor="gasto-medio-banco" ayuda="Del banco, por qué camino salió.">
                <SelectFin
                  id="gasto-medio-banco"
                  valor={bancoConMedio}
                  onValor={(m) => setMedioBanco(m)}
                  opciones={mediosDeBanco(conComprobante).map((m) => ({ valor: m, texto: TEXTO_MEDIO[m] }))}
                />
              </CampoFin>
            )}
            {!aCredito && (conCuentas ? !bancoConMedio && medioSalida && medioSalida !== "efectivo" : b.medio && b.medio !== "efectivo") && (
              <CampoFin etiqueta="N.° de operación (opcional)" htmlFor="gasto-referencia">
                <InputFin id="gasto-referencia" value={b.referencia} onChange={(e) => poner("referencia", e.target.value)} />
              </CampoFin>
            )}
          </div>
          </div>
        )}
        {!egreso && !aCredito && conCuentas && bancoConMedio && (
          <CampoFin etiqueta="N.° de operación (opcional)" htmlFor="gasto-referencia">
            <InputFin id="gasto-referencia" value={b.referencia} onChange={(e) => poner("referencia", e.target.value)} />
          </CampoFin>
        )}

        <AvisoNoDeducible aviso={avisoNoDeducible} reservar={pagaAhora && monto.valor >= UMBRAL_BANCARIZACION} />

        <ComboResponsable control={responsable} deshabilitado={guardando || intento.incierto} />
      </fieldset>

      {intento.incierto && <AvisoIntentoIncierto onRevisar={revisar} revisando={revisando} className="mt-4" />}

      <div className="fin-botones mt-4" data-guia="fin-gastos.form-botones">
        <button type="button" className="btn-cayla btn-secundario" onClick={() => avisoSalida.pedirAccion(onCerrar)} disabled={guardando || intento.incierto}>
          Cancelar
        </button>
        <Boton peso="primario" cargando={guardando} type="button" onClick={guardar} disabled={guardando || revisando || !responsable.listo}>
          {intento.incierto
              ? "Volver a intentar"
              : egreso
                ? esActivo
                  ? "Guardar como activo"
                  : "Guardar como gasto"
                : esActivo
                  ? "Registrar activo"
                  : "Registrar gasto"}
        </Boton>
      </div>
      {avisoSalida.aviso}
    </Modal>
  );
}
