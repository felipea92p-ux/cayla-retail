"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { validarDocumento } from "@cayla-retail/shared";
import { createClient } from "@/lib/supabase/client";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ETIQUETA_METODO } from "@/lib/compras-reglas";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { normalizarCci, normalizarCelular, proveedorConRuc } from "@/lib/proveedores-reglas";
import {
  argsGuardarCuentas,
  avisoCuentasNoGuardadas,
  BANCOS_COMUNES,
  BILLETERAS,
  celularDeTelefono,
  CUENTAS_VACIAS,
  cuentasDeFila,
  escribirCci,
  escribirCelular,
  ETIQUETA_BILLETERA,
  hayQueGuardarCuentas,
  LARGO_TITULAR,
  leerBancoDelCci,
  primerErrorCuentas,
  validarCuentas,
  type CuentasForm,
} from "@/lib/proveedores-cuentas-form";

// Alta y edición de un proveedor (extraído de ProveedoresPanel el 2026-09-18 para que la lista y la
// ficha abran el MISMO formulario: la ficha ganó el botón «Editar» y el formulario no se duplica).
//
// El RUC y la razón social son el mismo <ConsultaDocumento> que usa Vender/Facturación (una sola copia
// de la lógica del padrón, ver el comentario de cabecera de ese componente), en modo `boton`: SUNAT se
// consulta solo al apretar «Buscar», porque cada consulta se paga y quien registra puede preferir
// escribir el nombre a mano. Si el padrón no responde, el nombre se escribe a mano y se guarda igual
// (principio 9): un proveedor no se queda sin registrar por una API ajena.
//
// El rubro sigue siendo texto libre (ADR-0094) pero sugiere los ya usados (`rubros`): así «Tela»,
// «tela» y «Telas» no terminan siendo tres filtros distintos en la lista. ADR-0128: las sugerencias
// ahora son botones a la vista (un toque) además de la lista desplegable del campo.
//
// ADR-0128 (spike visual 2026-09-19): el formulario se rehízo con la carcasa y las piezas del spike — encabezado
// con su rótulo, contador y validación del RUC («n/11», hilo verde, ✓ que se dibuja), plazo de crédito y forma de
// pago como opciones a la vista (el plazo con un pulgar que se desliza), rubro con sugerencias en botones, y un
// botón que barre mientras guarda y confirma con un ✓ antes de cerrar. Los campos reales que el spike no tenía
// (consulta a SUNAT, teléfono, banco, cuenta) siguen: cambia cómo se ven, no qué se guarda.
//
// ADR-0129 (2026-09-19): el bloque «Cómo pagarle» — banco, N.° de cuenta, CCI, celular Yape/Plin (con sus apps) y
// titular. Todo opcional. `guardar_cuentas_proveedor` es una RPC aparte de `registrar/actualizar_proveedor` (esas dos no
// cambiaron de firma), así que guardar son DOS pasos: 1) el proveedor de siempre, 2) las cuentas, solo si algo de
// ellas cambió. Si el paso 2 falla el proveedor YA existe: el modal se queda abierto con lo escrito, ya en modo
// edición (un segundo «Guardar» actualiza, no duplica) y al cerrarlo la lista se entera. La lógica pura (validar,
// detectar el banco, saber si cambió, armar los argumentos) vive en `lib/proveedores-cuentas-form.ts`.
//
// ADR-0128: el RUC duplicado se dice AL ESCRIBIR, con el nombre del proveedor con el que choca
// (`existentes`). El candado de verdad sigue siendo el índice único de la base; esto solo evita que el
// error llegue recién al guardar, después de haber llenado todo el formulario.

// Mismo vocabulario y orden que el selector de medio de pago en LineasPago.tsx (compra_pagos.metodo):
// un solo catálogo de formas de pago en toda la app.
const FORMAS_PAGO = Object.keys(ETIQUETA_METODO);

// Plazos que se eligen con un toque; cualquier otro número entra por «Otro».
const PLAZOS = ["15", "30", "45", "60"];
/** Debe coincidir con `.anim-salida` en globals.css. */
const MS_SALIDA = 220;

const CHIP = "rounded-full border px-3 py-0.5 text-xs transition-colors duration-200";
const CHIP_OFF = "border-tinta/15 text-tinta/75 hover:border-rojo hover:text-rojo";
const CHIP_ON = "border-tinta bg-tinta text-crema";

export type Borrador = {
  id: string | null;
  nombre: string;
  ruc: string;
  contacto: string;
  telefono: string;
  banco: string;
  cuentaBancaria: string;
  rubro: string;
  plazoCreditoDias: string;
  formaPagoPreferida: string;
} & CuentasForm;

export const BORRADOR_VACIO: Borrador = {
  id: null,
  nombre: "",
  ruc: "",
  contacto: "",
  telefono: "",
  banco: "",
  cuentaBancaria: "",
  rubro: "",
  plazoCreditoDias: "",
  formaPagoPreferida: "",
  ...CUENTAS_VACIAS,
};

/** Del proveedor (de la lista o de la ficha) al formulario de edición. */
export function borradorDe(p: {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  rubro: string | null;
  plazo_credito_dias: number | null;
  forma_pago_preferida: string | null;
  cci: string | null;
  celular_billetera: string | null;
  billeteras: string[] | null;
  titular_cuenta: string | null;
}): Borrador {
  return {
    id: p.id,
    nombre: p.nombre,
    ruc: p.ruc ?? "",
    contacto: p.contacto ?? "",
    telefono: p.telefono ?? "",
    banco: p.banco ?? "",
    cuentaBancaria: p.cuenta_bancaria ?? "",
    rubro: p.rubro ?? "",
    plazoCreditoDias: p.plazo_credito_dias != null ? String(p.plazo_credito_dias) : "",
    formaPagoPreferida: p.forma_pago_preferida ?? "",
    ...cuentasDeFila(p),
  };
}

export function ProveedorModal({
  inicial,
  rubros = [],
  existentes = [],
  onClose,
  onGuardado,
  onDesactivar,
}: {
  inicial: Borrador;
  /** Rubros ya usados, para sugerir al escribir. */
  rubros?: string[];
  /** Los proveedores ya registrados, para avisar de un RUC repetido mientras se escribe. */
  existentes?: { id: string; nombre: string; ruc: string | null }[];
  onClose: () => void;
  /** `id` del proveedor guardado (el nuevo, o el que se editó): la lista lo marca y lo lleva a la vista. */
  onGuardado: (id: string | null) => void;
  /** Solo al editar: desactivar vive acá y no en la fila (ver ProveedoresPanel). */
  onDesactivar?: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [ruc, setRuc] = useState(inicial.ruc);
  const [contacto, setContacto] = useState(inicial.contacto);
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [banco, setBanco] = useState(inicial.banco);
  const [cuentaBancaria, setCuentaBancaria] = useState(inicial.cuentaBancaria);
  const [rubro, setRubro] = useState(inicial.rubro);
  const [plazoCreditoDias, setPlazoCreditoDias] = useState(inicial.plazoCreditoDias);
  // «Otro» es un modo, no un valor: un plazo de 20 días no está entre los botones y el campo tiene que seguir visible.
  const [plazoOtro, setPlazoOtro] = useState(inicial.plazoCreditoDias !== "" && !PLAZOS.includes(inicial.plazoCreditoDias));
  const [formaPagoPreferida, setFormaPagoPreferida] = useState(inicial.formaPagoPreferida);
  const [cci, setCci] = useState(inicial.cci);
  const [celular, setCelular] = useState(inicial.celularBilletera);
  const [billeteras, setBilleteras] = useState<string[]>(inicial.billeteras);
  const [titular, setTitular] = useState(inicial.titularCuenta);
  // Los errores de cada campo aparecen al salir de él (o al intentar guardar), no mientras se escribe por primera vez.
  const [tocados, setTocados] = useState<Partial<Record<"cci" | "celular" | "titular", boolean>>>({});
  const [intento, setIntento] = useState(false);
  // Con qué cuentas se abrió el formulario: solo si difieren se llama a `guardar_cuentas_proveedor`. No se actualiza
  // si el paso 2 falla: esas cuentas siguen sin guardarse y el reintento tiene que volver a mandarlas.
  const cuentasIniciales = useRef<CuentasForm>({ cci: inicial.cci, celularBilletera: inicial.celularBilletera, billeteras: inicial.billeteras, titularCuenta: inicial.titularCuenta }).current;
  // El banco que se completó solo desde el CCI: si quien registra no lo tocó, un CCI corregido lo puede volver a cambiar.
  const bancoAuto = useRef<string | null>(null);
  // Tras crear el proveedor con éxito pero fallar las cuentas, el formulario pasa a modo edición con este id.
  const [idGuardado, setIdGuardado] = useState<string | null>(null);
  // reposo → guardando (el botón barre) → listo (✓) → se cierra con la salida animada.
  const [fase, setFase] = useState<"reposo" | "guardando" | "listo">("reposo");
  const [cerrando, setCerrando] = useState(false);
  const alCerrar = useRef<(() => void) | null>(null);

  const idActual = idGuardado ?? inicial.id;
  const editando = idActual !== null;
  const rucValido = ruc.length === 0 || validarDocumento("ruc", ruc).valido;
  const repetido = proveedorConRuc(ruc, existentes, idActual);
  const puedeGuardar = !!nombre.trim() && rucValido && !repetido && fase === "reposo";

  const cuentas: CuentasForm = { cci, celularBilletera: celular, billeteras, titularCuenta: titular };
  const errores = validarCuentas(cuentas);
  const verError = (campo: "cci" | "celular" | "titular") => (tocados[campo] || intento ? errores[campo] : undefined);
  // «Celular sin app» solo se marca en rojo al intentar guardar: al salir del campo lo natural es tocar Yape o Plin, y un error que parpadea antes de eso molesta.
  const verErrorApps = intento ? errores.billeteras : undefined;
  const faltaApp = !!errores.billeteras && !!tocados.celular;
  const digitosCci = normalizarCci(cci).length;
  const lecturaBanco = leerBancoDelCci(cci, banco);
  const celularDelTelefono = celularDeTelefono(telefono);
  const ofrecerTelefono = celularDelTelefono !== null && normalizarCelular(telefono) !== normalizarCelular(celular);

  function escribirCciCampo(v: string) {
    const nuevo = escribirCci(v);
    setCci(nuevo);
    // CCI completo y reconocido + «Banco» vacío (o completado por nosotros antes) → se completa solo.
    const { detectado } = leerBancoDelCci(nuevo, banco);
    if (detectado && (banco.trim() === "" || banco === bancoAuto.current)) {
      bancoAuto.current = detectado;
      setBanco(detectado);
    }
  }
  const alternarBilletera = (b: string) => setBilleteras((v) => (v.includes(b) ? v.filter((x) => x !== b) : [...v, b]));

  // Cierre en dos tiempos, igual que `Modal`: se anima la salida y recién ahí se avisa al padre (que lo desmonta).
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => (alCerrar.current ?? onClose)(), reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onClose]);

  const modoPlazo = plazoOtro ? "otro" : plazoCreditoDias;
  function elegirPlazo(clave: string) {
    if (clave === "otro") {
      setPlazoOtro(true);
      if (PLAZOS.includes(plazoCreditoDias)) setPlazoCreditoDias("");
      return;
    }
    setPlazoOtro(false);
    setPlazoCreditoDias(clave);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fase !== "reposo") return;
    if (!nombre.trim()) return void avisar.error("El proveedor necesita un nombre.", { enfocar: "documento-nombre" });
    if (!rucValido) return void avisar.error("El RUC tiene que ser de 11 dígitos. Si no tiene, déjalo en blanco.", { enfocar: "documento-numero" });
    if (repetido) return void avisar.error(`Ese RUC ya es de ${repetido.nombre}.`, { enfocar: "documento-numero" });
    // Las cuentas se validan ANTES del paso 1: no se guarda el proveedor para descubrir después que el CCI estaba mal.
    const problema = primerErrorCuentas(errores);
    if (problema) {
      setIntento(true);
      return void avisar.error(problema.mensaje, { enfocar: { cci: "proveedor-cci", celular: "proveedor-celular", billeteras: "proveedor-billeteras", titular: "proveedor-titular" }[problema.campo] });
    }
    setFase("guardando");
    const supabase = createClient();
    const args = {
      p_nombre: nombre.trim(),
      p_ruc: ruc || undefined,
      p_contacto: contacto.trim() || undefined,
      p_rubro: rubro.trim() || undefined,
      p_plazo_credito_dias: plazoCreditoDias ? Number(plazoCreditoDias) : undefined,
      p_forma_pago_preferida: formaPagoPreferida || undefined,
      p_telefono: telefono.trim() || undefined,
      p_banco: banco.trim() || undefined,
      p_cuenta_bancaria: cuentaBancaria.trim() || undefined,
    };
    // Paso 1: el proveedor de siempre.
    const { data: idNuevo, error } = editando
      ? await supabase.rpc("actualizar_proveedor", {
          p_proveedor_id: idActual!,
          ...args,
        })
      : await supabase.rpc("registrar_proveedor", args);
    if (error) {
      setFase("reposo");
      avisar.error(traducirError(error, editando ? "guardar el proveedor" : "registrar el proveedor"));
      return;
    }
    const id = editando ? idActual : ((idNuevo as string | null) ?? null);
    alCerrar.current = () => onGuardado(id);

    // Paso 2: las cuentas, solo si algo de ellas cambió (o es un alta con algo escrito).
    if (id && hayQueGuardarCuentas(cuentasIniciales, cuentas, inicial.id === null)) {
      const { error: errorCuentas } = await supabase.rpc("guardar_cuentas_proveedor", argsGuardarCuentas(id, cuentas));
      if (errorCuentas) {
        // El proveedor YA está guardado: el formulario sigue abierto con todo lo escrito, en modo edición, y al cerrarlo
        // (por donde sea) la lista se entera del proveedor nuevo. Nada se pierde ni se duplica.
        if (!editando) setIdGuardado(id);
        setFase("reposo");
        avisar.error(avisoCuentasNoGuardadas(traducirError(errorCuentas, "guardar las cuentas")));
        return;
      }
    }
    avisar.exito(editando ? `${nombre.trim()} actualizado` : `Proveedor ${nombre.trim()} registrado`);
    // El ✓ se ve un instante y recién ahí el modal se va: la confirmación es parte del gesto, no un aviso aparte.
    setFase("listo");
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(pedirCierre, reducido ? 0 : 520);
  }

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && fase !== "guardando" && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 bg-tinta/30 backdrop-blur-[2.5px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`} />
        {/* El centrado vive en este contenedor y no en el panel: la animación de entrada usa `transform`. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Dialog.Content
            className={`pointer-events-auto flex max-h-[92dvh] w-full max-w-[35rem] flex-col overflow-hidden rounded-t-2xl border border-sand bg-papel shadow-xl outline-none sm:rounded-2xl ${
              cerrando ? "anim-salida" : "anim-entrada"
            }`}
          >
            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-[22px]">
                <div>
                  <p className="label-cayla text-[11px] text-tinta/65">Compras · Proveedores</p>
                  <Dialog.Title asChild>
                    <h2 className="font-display mt-0.5 text-2xl leading-tight text-tinta">{editando ? "Editar proveedor" : "Registrar proveedor"}</h2>
                  </Dialog.Title>
                </div>
                <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="-mr-1 -mt-1 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <Dialog.Description className="sr-only">Datos del proveedor: RUC, razón social, contacto, rubro, plazo de crédito, forma de pago y cómo pagarle.</Dialog.Description>

              <div className="scroll-cayla min-h-0 flex-1 space-y-2 overflow-y-auto px-6 pb-5 pt-2">
                {/* La razón social y el RUC: el mismo <ConsultaDocumento> que usa Vender/Facturación (una sola copia de
                    la lógica del padrón). `contador` le agrega «n/11», el hilo verde y el ✓ del spike. */}
                <ConsultaDocumento
                  tipo="ruc"
                  obligatorio={false}
                  disparo="boton"
                  contador
                  problemaExterno={repetido ? <>Ya está registrado: <b className="font-semibold">{repetido.nombre}</b>. Un RUC no puede repetirse.</> : undefined}
                  numero={ruc}
                  onNumero={setRuc}
                  nombre={nombre}
                  onNombre={setNombre}
                />

                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  <CampoTexto etiqueta="Contacto" autoComplete="off" placeholder="Con quién se coordina" value={contacto} onChange={(e) => setContacto(e.target.value)} />
                  <CampoTexto etiqueta="Teléfono" type="tel" autoComplete="off" placeholder="El WhatsApp de los pedidos" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>

                <div>
                  <CampoTexto
                    etiqueta="Rubro"
                    autoComplete="off"
                    list="proveedor-rubros"
                    placeholder="Tela, avíos, prenda terminada, servicios…"
                    value={rubro}
                    onChange={(e) => setRubro(e.target.value)}
                  />
                  <datalist id="proveedor-rubros">
                    {rubros.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                  {rubros.length > 0 && (
                    <div className="-mt-1 mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Rubros ya usados">
                      {rubros.map((r) => {
                        const elegido = rubro.trim().toLowerCase() === r.toLowerCase();
                        return (
                          <button key={r} type="button" aria-pressed={elegido} onClick={() => setRubro(r)} className={`${CHIP} ${elegido ? CHIP_ON : CHIP_OFF}`}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Campo etiqueta="Plazo de crédito" idEtiqueta="etiqueta-plazo">
                  <SegmentoDeslizante
                    etiqueta="Plazo de crédito"
                    valor={modoPlazo}
                    onCambio={elegirPlazo}
                    opciones={[{ clave: "", etiqueta: "Sin definir" }, ...PLAZOS.map((d) => ({ clave: d, etiqueta: `${d} d` })), { clave: "otro", etiqueta: "Otro" }]}
                  />
                  {plazoOtro && (
                    <div className="anim-revelar mt-2 max-w-[12rem]">
                      <CampoTexto etiqueta="Días" type="number" min={1} step={1} autoComplete="off" placeholder="20" value={plazoCreditoDias} onChange={(e) => setPlazoCreditoDias(e.target.value)} />
                    </div>
                  )}
                </Campo>

                <Campo etiqueta="Forma de pago preferida" idEtiqueta="etiqueta-forma-pago">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="etiqueta-forma-pago">
                    {FORMAS_PAGO.map((m) => {
                      const elegido = formaPagoPreferida === m;
                      return (
                        // Tocar la elegida la quita: «sin definir» es una respuesta válida.
                        <button key={m} type="button" aria-pressed={elegido} onClick={() => setFormaPagoPreferida(elegido ? "" : m)} className={`${CHIP} ${elegido ? CHIP_ON : CHIP_OFF}`}>
                          {ETIQUETA_METODO[m]}
                        </button>
                      );
                    })}
                  </div>
                </Campo>

                {/* ADR-0129 · Cómo pagarle. Todo opcional: sin esto el proveedor se registra igual, y en el pago se avisa que falta. */}
                <section aria-labelledby="proveedor-pago-titulo" className="mt-1 space-y-2 border-t border-tinta/10 pt-4">
                  <p id="proveedor-pago-titulo" className="label-cayla text-[11px] text-tinta/65">
                    Cómo pagarle
                  </p>
                  <p className="-mt-1 text-xs text-tinta/55">Todo es opcional. Lo que registres aparece al pagar, listo para copiar.</p>

                  <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <div>
                      <CampoTexto etiqueta="Banco" autoComplete="off" list="proveedor-bancos" placeholder="BCP, Interbank…" value={banco} onChange={(e) => setBanco(e.target.value)} />
                      <datalist id="proveedor-bancos">
                        {BANCOS_COMUNES.map((b) => (
                          <option key={b} value={b} />
                        ))}
                      </datalist>
                    </div>
                    <CampoTexto etiqueta="N.° de cuenta" mono autoComplete="off" inputMode="numeric" placeholder="Para depósito o mismo banco" value={cuentaBancaria} onChange={(e) => setCuentaBancaria(e.target.value)} />
                  </div>

                  <CampoTexto
                    id="proveedor-cci"
                    etiqueta={
                      <>
                        {/* Igual que «n/11» del RUC: el contador queda a la derecha de la misma línea. */}
                        <span className={`float-right font-medium normal-case tracking-normal tabular-nums transition-colors duration-200 ${digitosCci === 20 ? "text-verde-profundo" : "text-tinta/45"}`}>{digitosCci}/20</span>
                        CCI <span className="normal-case tracking-normal">(para transferir desde otro banco)</span>
                      </>
                    }
                    mono
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000-000-000000000000-00"
                    value={cci}
                    onChange={(e) => escribirCciCampo(e.target.value)}
                    onBlur={() => setTocados((t) => ({ ...t, cci: true }))}
                    aria-invalid={!!verError("cci")}
                    valido={digitosCci === 20 && !errores.cci}
                    tono={verError("cci") ? "error" : lecturaBanco.discrepa ? "aviso" : lecturaBanco.detectado ? "ok" : "neutro"}
                    pie={
                      verError("cci") ??
                      (lecturaBanco.discrepa ? (
                        <>
                          Este CCI es de <b className="font-semibold">{lecturaBanco.detectado}</b>, pero en «Banco» dice «{banco.trim()}». Revisa cuál es el correcto.
                        </>
                      ) : lecturaBanco.detectado ? (
                        <span className="inline-flex items-center gap-1.5">
                          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <path pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" className="trazo-linea anim-trazo" />
                          </svg>
                          Banco detectado: <b className="font-semibold">{lecturaBanco.detectado}</b>
                        </span>
                      ) : undefined)
                    }
                  />

                  <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <CampoTexto
                      id="proveedor-celular"
                      etiqueta="Celular Yape / Plin"
                      mono
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      placeholder="987 654 321"
                      value={celular}
                      onChange={(e) => setCelular(escribirCelular(e.target.value))}
                      onBlur={() => setTocados((t) => ({ ...t, celular: true }))}
                      aria-invalid={!!verError("celular")}
                      tono={verError("celular") ? "error" : "neutro"}
                      pie={verError("celular") ?? (faltaApp ? "Elige si lo recibe en Yape, Plin o ambos." : undefined)}
                    />
                    {/* «Yape» y «Plin» no son un banco ni un teléfono: son la app que hay que abrir. Un celular sin app (o al revés) no puede existir en la base. */}
                    <div>
                      <span id="proveedor-billeteras-etiqueta" className="label-cayla block text-[11px] text-tinta/65">
                        Lo recibe en
                      </span>
                      <div id="proveedor-billeteras" tabIndex={-1} className="mt-1.5 flex flex-wrap items-center gap-1.5 py-1.5 outline-none" role="group" aria-labelledby="proveedor-billeteras-etiqueta">
                        {BILLETERAS.map((b) => {
                          const elegido = billeteras.includes(b);
                          return (
                            <button key={b} type="button" aria-pressed={elegido} onClick={() => alternarBilletera(b)} className={`${CHIP} ${elegido ? CHIP_ON : CHIP_OFF}`}>
                              {ETIQUETA_BILLETERA[b]}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1 min-h-[0.9rem] text-xs leading-tight text-rojo">{verErrorApps && <span className="anim-revelar block">{verErrorApps}</span>}</div>
                    </div>
                  </div>
                  {ofrecerTelefono && (
                    <p className="anim-revelar -mt-1 text-xs text-tinta/65">
                      ¿Es el mismo del contacto?{" "}
                      <button type="button" onClick={() => setCelular(celularDelTelefono ?? "")} className="text-rojo hover:underline">
                        Usar el teléfono de contacto ({celularDelTelefono})
                      </button>
                    </p>
                  )}

                  <CampoTexto
                    id="proveedor-titular"
                    etiqueta="Titular de la cuenta"
                    autoComplete="off"
                    maxLength={LARGO_TITULAR.max}
                    placeholder="Como sale en la app del banco o de Yape"
                    value={titular}
                    onChange={(e) => setTitular(e.target.value)}
                    onBlur={() => setTocados((t) => ({ ...t, titular: true }))}
                    aria-invalid={!!verError("titular")}
                    tono={verError("titular") ? "error" : "neutro"}
                    pie={verError("titular") ?? "Quien paga lo compara con el nombre que muestra el banco antes de confirmar."}
                  />
                </section>

                {onDesactivar && (
                  <p className="border-t border-tinta/10 pt-3 text-xs text-tinta/55">
                    ¿Ya no se le compra?{" "}
                    <button type="button" onClick={onDesactivar} disabled={fase !== "reposo"} className="text-rojo hover:underline">
                      Desactivar proveedor
                    </button>
                    . Deja de aparecer al registrar comprobantes; su historial se conserva.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-tinta/10 px-6 py-4">
                <Boton type="button" peso="fantasma" onClick={pedirCierre} disabled={fase !== "reposo"}>
                  Cancelar
                </Boton>
                {/* Solo se ve «apagado» en reposo, cuando de verdad falta algo; guardando y listo el botón sigue vivo (onSubmit ya ignora los clics repetidos). */}
                <Boton type="submit" peso="primario" disabled={fase === "reposo" && !puedeGuardar} className="min-w-[11.5rem]">
                  {fase === "guardando" && (
                    // El mismo hilo que barre en el spike mientras se guarda: se ve que el sistema trabaja.
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
                      <span className="block h-full w-1/3 bg-crema [animation:cayla-hilo-barrido_0.9s_linear_infinite]" />
                    </span>
                  )}
                  {fase === "listo" ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" className="trazo-linea anim-trazo" />
                      </svg>
                      Listo
                    </span>
                  ) : fase === "guardando" ? (
                    "Guardando…"
                  ) : editando ? (
                    "Guardar cambios"
                  ) : (
                    "Registrar proveedor"
                  )}
                </Boton>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
