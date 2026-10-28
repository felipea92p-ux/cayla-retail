"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CampoSaleDe, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { PastillasMedio } from "@/components/PagoPiezas";
import { soles } from "@/lib/compras-reglas";
import { cuentaEfectiva, hayCuentasPara } from "@/lib/cuenta-sellada-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { leerValorDeuda, registrarDepositoDeuda } from "@/lib/nos-debe-acciones";
import { ejemploReferencia } from "@/lib/sugerencias-deposito";
import {
  AVISO_DE_CORTE_REPOSICION,
  argsDeposito,
  borradorDeposito,
  camposDeposito,
  cantidadDeposito,
  cantidadDePrendas,
  cuantoVale,
  detalleDeDeposito,
  fraseDeposito,
  fraseNotaDeLaFactura,
  fraseSinDeposito,
  leerMontoDeposito,
  limpiarCantidadReposicion,
  mensajeDeNosDebe,
  nombreDeDeuda,
  pasablesASaldo,
  porQueDebeEnFrase,
  problemasDeposito,
  queDebe,
  sugiereRecargarNosDebe,
  textoBotonDeposito,
  TOPES_DEPOSITO,
  TOPES_REPOSICION,
  type BorradorDeposito,
  type DeudaProveedor,
  type ValorDeDeuda,
} from "@/lib/nos-debe-reglas";

// «Depositó» (ADR-0362, fase 5b, actividad 5; decisiones 24 y 59): el proveedor no va a mandar lo que faltó y ya devolvió esa plata. En una
// sola operación la base registra el documento interno DI-… por esas prendas (como «Pasar a saldo a favor») y el reembolso de lo que quedó a
// favor, a la cuenta donde entró (`registrar_deposito_deuda`). Lo depositado tiene que ser exactamente eso: si todavía se le debe el
// comprobante, lo que no llegó solo baja esa deuda y no hay nada que depositar.
//
// El monto se escribe mirando el depósito (no viene puesto: es plata que entró, y la hoja la compara con lo que quedó a favor). Lo demás viene
// como en el reembolso: la transferencia, la cuenta de siempre para ese medio y la fecha de hoy, «sugeridos» hasta que se tocan (ADR-0284).
// Un doble clic no registra dos (candado con una ref y el token: la base devuelve lo mismo si el pedido se repite igual).

export function BotonDeposito({ deuda, proveedorNombre, hoy }: { deuda: DeudaProveedor; proveedorNombre: string; hoy: string }) {
  const [abierta, setAbierta] = useState(false);
  // Al cerrar la hoja, el foco vuelve al botón que la abrió.
  const origen = useRef<HTMLElement | null>(null);
  // Lo que no está en ningún comprobante no se pagó: si es todo lo que debe, no hay plata que devolver.
  if (pasablesASaldo(deuda) <= 0) return null;
  return (
    <>
      <Boton
        type="button"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
        data-guia="proveedor-ficha.deposito"
        className="shrink-0"
      >
        Depositó
      </Boton>
      {abierta && <HojaDeposito deuda={deuda} proveedorNombre={proveedorNombre} hoy={hoy} volverA={origen} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

type Tocados = { cantidad?: boolean; fecha?: boolean; metodo?: boolean; cuenta?: boolean };

function HojaDeposito({
  deuda,
  proveedorNombre,
  hoy,
  volverA,
  onCerrar,
}: {
  deuda: DeudaProveedor;
  proveedorNombre: string;
  hoy: string;
  volverA: RefObject<HTMLElement | null>;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [borrador, setBorrador] = useState<BorradorDeposito>(() => borradorDeposito(deuda, hoy));
  const [tocados, setTocados] = useState<Tocados>({});
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  // Cuánto vale lo que se paga con el depósito: se pregunta a la base cada vez que la cantidad queda bien escrita.
  const [valor, setValor] = useState<{ cantidad: number; v: ValorDeDeuda | null } | null>(null);
  // «Entra a» (como el reembolso, ADR-0195 F3b): el banco o la caja donde entró la plata; al cajón, con su ingreso de caja. Propone las de la
  // sede donde faltaron las prendas.
  const cuentas = useCuentasParaElegir("reembolso", deuda.sedeId);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  // Un token por hoja, el mismo en cada reintento: la base no registra dos depósitos para el mismo pedido.
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);

  const pasables = pasablesASaldo(deuda);
  const n = cantidadDeposito(borrador, deuda);
  const valorAlDia = valor && valor.cantidad === n ? valor.v : null;
  const aFavor = valorAlDia ? valorAlDia.aFavor : null;
  const cuentaEntra = cuentaEfectiva(cuentas.cuentas, "reembolso", borrador.metodo, cuentaElegida);
  const hayCuentas = cuentas.listo && hayCuentasPara(cuentas.cuentas, "reembolso", borrador.metodo);
  const problemas = problemasDeposito({ borrador, deuda, aFavor, hoy });
  const guia = useGuiaCampos(
    camposDeposito(problemas, borrador, deuda, {
      responsable: { listo: responsable.listo, motivo: responsable.motivo },
      cuenta: { hay: hayCuentas, id: cuentaEntra },
      tocados,
    }),
  );
  const monto = leerMontoDeposito(borrador.monto).n;
  // Un error de un campo se muestra si ya se escribió algo, o después de intentar registrar: no antes de empezar.
  const errorDe = (campo: keyof typeof problemas, escrito: string) => (intentado || escrito.trim() !== "" ? problemas[campo] : undefined);
  const errorCantidad = pasables > 1 && tocados.cantidad ? problemas.cantidad : undefined;

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  useEffect(() => {
    if (n == null) return;
    let vigente = true;
    const espera = setTimeout(() => {
      void leerValorDeuda(deuda.diferenciaId, n).then((v) => {
        if (vigente) setValor({ cantidad: n, v });
      });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [deuda.diferenciaId, n]);

  const tocar = (campo: keyof Tocados) => setTocados((t) => (t[campo] ? t : { ...t, [campo]: true }));

  async function registrar() {
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic. El candado es el de la casa: una ref.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      setIntentado(true);
      const bloquea = guia.faltan.find((c) => c.requerido)?.id ?? guia.ahora;
      if (bloquea) guia.ir(bloquea);
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const { documentos, error: falla } = await registrarDepositoDeuda(argsDeposito(deuda, borrador, cuentaEntra, token), responsable.firma());
      setGuardando(false);
      responsable.despues(falla);
      if (falla) {
        // Se cortó la señal: pudo registrarse. Reintentar sin cambiar nada es seguro (el mismo token no registra dos).
        setError(
          esFalloDeRed(falla)
            ? { texto: AVISO_DE_CORTE_REPOSICION, recargar: false }
            : { texto: mensajeDeNosDebe(falla) ?? traducirError(falla, "registrar el depósito"), recargar: sugiereRecargarNosDebe(falla) },
        );
        return;
      }
      const nombreCuenta = cuentas.cuentas.find((c) => c.id === cuentaEntra)?.nombre ?? null;
      avisar.exito(monto != null ? `Depósito de ${soles(monto)} registrado` : "Depósito registrado", { detalle: detalleDeDeposito(documentos, nombreCuenta) });
      onCerrar();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal titulo="Depositó" subtitulo={`${proveedorNombre} · ${nombreDeDeuda(deuda)}`} tamano="mediana" bloqueado={guardando} onClose={onCerrar} alCerrarEnfocar={volverA}>
      {(cerrar) => (
        <form
          // La demo (ADR-0389) abre esta hoja para mostrarla y la cierra sin registrar nada.
          data-guia="proveedor-ficha.hoja-deposito"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void registrar();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-tinta/80">
            Te debe <b className="font-semibold text-tinta">{queDebe(deuda)}</b> ({deuda.montoConIgv != null ? `${soles(deuda.montoConIgv)} con IGV` : soles(deuda.montoPendiente)}):{" "}
            {porQueDebeEnFrase(deuda, hoy)}.
          </p>
          <p className="nota-cayla text-[13px]">
            Úsalo si el proveedor no las va a mandar y ya te devolvió la plata. Se registra un documento interno por lo que pagaste por ellas y el
            depósito que entró, juntos. No suma prendas al stock.
          </p>
          {deuda.sinPapel > 0 && (
            <Aviso tono="info" chico>
              {cantidadDePrendas(deuda.sinPapel, deuda.categoria)} no {deuda.sinPapel === 1 ? "está" : "están"} en ningún comprobante: no se
              facturaron, así que no hay plata que devolver por {deuda.sinPapel === 1 ? "ella" : "ellas"}.
            </Aviso>
          )}

          {pasables > 1 ? (
            <CampoGuiado id="cantidad" guia={guia} titulo="¿Cuántas pagó con el depósito?" ayuda={`puede pagar hasta ${pasables.toLocaleString("es-PE")}`}>
              <CampoTexto
                id="deposito-cantidad"
                etiqueta="Cuántas pagó"
                caja
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
                value={borrador.cantidad}
                tono={errorCantidad ? "error" : undefined}
                pie={errorCantidad}
                sinPie={!errorCantidad}
                onChange={(e) => {
                  tocar("cantidad");
                  setBorrador((b) => ({ ...b, cantidad: limpiarCantidadReposicion(e.target.value) }));
                }}
              />
            </CampoGuiado>
          ) : (
            <p className="text-sm text-tinta/80">Paga {cantidadDePrendas(1, deuda.categoria)}.</p>
          )}

          {n != null &&
            (valorAlDia && valorAlDia.aFavor <= 0 ? (
              // Todavía se le debe el comprobante: lo que no llegó solo baja esa deuda. Dice qué hacer en vez de dejar escribir un monto que no va.
              <div aria-live="polite">
                <Aviso tono="atencion" titulo="No hay nada que te deposite">
                  {fraseSinDeposito(valorAlDia)}
                </Aviso>
              </div>
            ) : (
              <div className="rounded-xl bg-hueso px-4 py-3" aria-live="polite">
                {valorAlDia ? (
                  <>
                    <p className="text-sm text-tinta">
                      Vale <b className="font-semibold tabular-nums">{cuantoVale(valorAlDia)}</b>, lo que costaron en su comprobante.
                    </p>
                    <p className="mt-1 text-[13px] text-tinta/75">{fraseDeposito(proveedorNombre, valorAlDia)}</p>
                    {fraseNotaDeLaFactura(valorAlDia) && <p className="mt-1 text-[13px] text-tinta/75">{fraseNotaDeLaFactura(valorAlDia)}</p>}
                  </>
                ) : (
                  <p className="text-[13px] text-tinta/65">{valor && valor.cantidad === n ? "No pude calcular cuánto vale: la base lo revisará al registrarlo." : "Calculando cuánto vale…"}</p>
                )}
              </div>
            ))}

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <CampoGuiado id="monto" guia={guia} titulo="Cuánto te depositó" ayuda={aFavor != null && aFavor > 0 ? `tiene que ser ${soles(aFavor)}` : undefined}>
              <CampoMonto
                id="deposito-monto"
                etiqueta="Cuánto te depositó"
                etiquetaOculta
                inputMode="decimal"
                autoComplete="off"
                // sugerir-fijo: el formato de un monto en soles; lo que tiene que ser va al lado, en el título
                placeholder="0.00"
                value={borrador.monto}
                tono={errorDe("monto", borrador.monto) ? "error" : undefined}
                pie={errorDe("monto", borrador.monto)}
                onChange={(e) => setBorrador((b) => ({ ...b, monto: e.target.value }))}
              />
            </CampoGuiado>
            <CampoGuiado id="fecha" guia={guia} titulo="Fecha del depósito">
              <CampoFecha
                id="deposito-fecha"
                caja
                etiqueta="Fecha del depósito"
                valor={borrador.fecha}
                onValor={(iso) => {
                  tocar("fecha");
                  setBorrador((b) => ({ ...b, fecha: iso }));
                }}
                required
                tono={errorDe("fecha", borrador.fecha) ? "error" : "neutro"}
                pie={errorDe("fecha", borrador.fecha)}
              />
            </CampoGuiado>
          </div>

          <CampoGuiado id="metodo" guia={guia} titulo="Cómo te lo devolvió">
            <PastillasMedio
              valor={borrador.metodo}
              etiqueta="Cómo te lo devolvió"
              onValor={(m) => {
                tocar("metodo");
                setBorrador((b) => ({ ...b, metodo: m }));
              }}
            />
          </CampoGuiado>

          {hayCuentas ? (
            <CampoGuiado id="cuenta" guia={guia}>
              <CampoSaleDe
                etiqueta="Entra a"
                sentido="entra"
                cuentas={cuentas.cuentas}
                listo={cuentas.listo}
                clase="reembolso"
                medio={borrador.metodo}
                valor={cuentaEntra}
                deshabilitado={guardando}
                onValor={(id) => {
                  tocar("cuenta");
                  setCuentaElegida(id);
                }}
              />
            </CampoGuiado>
          ) : (
            <CampoSaleDe
              etiqueta="Entra a"
              sentido="entra"
              cuentas={cuentas.cuentas}
              listo={cuentas.listo}
              clase="reembolso"
              medio={borrador.metodo}
              valor={cuentaEntra}
              onValor={setCuentaElegida}
            />
          )}

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <CampoGuiado id="referencia" guia={guia} titulo="Referencia">
              <CampoTexto
                id="deposito-referencia"
                etiqueta="Referencia"
                caja
                autoComplete="off"
                maxLength={TOPES_DEPOSITO.referencia}
                placeholder={ejemploReferencia(borrador.metodo)}
                value={borrador.referencia}
                tono={errorDe("referencia", borrador.referencia) ? "error" : undefined}
                pie={errorDe("referencia", borrador.referencia)}
                sinPie={!errorDe("referencia", borrador.referencia)}
                onChange={(e) => setBorrador((b) => ({ ...b, referencia: e.target.value }))}
              />
            </CampoGuiado>
            <CampoGuiado id="nota" guia={guia} titulo="Nota">
              <CampoTexto
                id="deposito-nota"
                etiqueta="Nota"
                caja
                maxLength={TOPES_REPOSICION.nota}
                placeholder="Por qué no la va a mandar (opcional)"
                value={borrador.nota}
                onChange={(e) => setBorrador((b) => ({ ...b, nota: e.target.value }))}
              />
            </CampoGuiado>
          </div>

          <CampoGuiado id="responsable" guia={guia} titulo="Quién lo hace">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <PieGuia guia={guia} listo="Todo listo para registrar el depósito." />
          {error && (
            <Aviso
              ref={avisoError}
              enfocable
              tono="error"
              titulo="No se pudo registrar el depósito"
              accion={
                // La deuda cambió mientras la hoja estaba abierta: se cierra y la ficha se vuelve a leer, con lo que queda de verdad.
                error.recargar ? (
                  <Boton
                    type="button"
                    onClick={() => {
                      onCerrar();
                      router.refresh();
                    }}
                  >
                    Recargar
                  </Boton>
                ) : undefined
              }
            >
              {error.texto}
            </Aviso>
          )}
          {/* Fija abajo mientras el contenido pasa por detrás: en un laptop de 768 px de alto el botón quedaba bajo el pliegue. */}
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton textoCargando="Registrando…" type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {textoBotonDeposito(monto)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
