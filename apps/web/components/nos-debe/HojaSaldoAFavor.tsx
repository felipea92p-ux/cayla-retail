"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { soles } from "@/lib/compras-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { leerValorDeuda, pasarDeudaASaldoAFavor } from "@/lib/nos-debe-acciones";
import {
  AVISO_DE_CORTE_REPOSICION,
  argsSaldoAFavor,
  borradorSaldoAFavor,
  camposSaldoAFavor,
  cantidadASaldo,
  cantidadDePrendas,
  cuantoVale,
  detalleDeSaldoAFavor,
  fraseNotaDeLaFactura,
  fraseSaldoAFavor,
  leerCantidadSaldoAFavor,
  limpiarCantidadReposicion,
  mensajeDeNosDebe,
  nombreDeDeuda,
  pasablesASaldo,
  porQueDebeEnFrase,
  queDebe,
  sugiereRecargarNosDebe,
  textoBotonSaldoAFavor,
  TOPES_REPOSICION,
  type BorradorSaldoAFavor,
  type DeudaProveedor,
  type ValorDeDeuda,
} from "@/lib/nos-debe-reglas";

// «Pasar a saldo a favor» (ADR-0362, fase 5b, decisión 58): el proveedor no va a mandar lo que faltó, y la plata que CAYLA pagó por eso
// vuelve. La base registra un documento interno DI-… por esas prendas, al costo del papel: baja lo que se le debe a ese comprobante y, si ya
// estaba pagado, lo que sobra queda a favor del proveedor y se descuenta de su próximo pago (`resolver_deuda_proveedor`, forma
// «saldo_a_favor»). Las prendas no entran al stock. Lo que nadie facturó no se pagó: esas no se pasan.
//
// Antes del botón, la hoja dice cuánto vale y cómo se reparte (`fn_deuda_valor`, una lectura). La guía de foco (ADR-0284): la cantidad viene
// puesta con todo lo que se puede pasar y es «sugerida» hasta que se toca; la nota es opcional; quién lo hace, obligatorio. Un doble clic no
// registra dos documentos (candado con una ref, y el token: la base devuelve lo mismo si el pedido se repite igual).

export function BotonSaldoAFavor({ deuda, proveedorNombre, hoy }: { deuda: DeudaProveedor; proveedorNombre: string; hoy: string }) {
  const [abierta, setAbierta] = useState(false);
  // Al cerrar la hoja, el foco vuelve al botón que la abrió.
  const origen = useRef<HTMLElement | null>(null);
  // Lo que no está en ningún comprobante no se pagó: si es todo lo que debe, no hay plata que pasar.
  if (pasablesASaldo(deuda) <= 0) return null;
  return (
    <>
      <Boton
        type="button"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
        data-guia="proveedor-ficha.saldo-a-favor"
        className="shrink-0"
      >
        Pasar a saldo a favor
      </Boton>
      {abierta && <HojaSaldoAFavor deuda={deuda} proveedorNombre={proveedorNombre} hoy={hoy} volverA={origen} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

function HojaSaldoAFavor({
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
  const [borrador, setBorrador] = useState<BorradorSaldoAFavor>(() => borradorSaldoAFavor(deuda));
  const [cantidadTocada, setCantidadTocada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  // Cuánto vale lo que se va a pasar: se pregunta a la base cada vez que la cantidad queda bien escrita.
  const [valor, setValor] = useState<{ cantidad: number; v: ValorDeDeuda | null } | null>(null);
  // Un token por hoja, el mismo en cada reintento: la base no registra dos documentos para el mismo pedido.
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);

  const pasables = pasablesASaldo(deuda);
  const guia = useGuiaCampos(camposSaldoAFavor(borrador, deuda, { listo: responsable.listo, motivo: responsable.motivo }, { cantidad: cantidadTocada }));
  const n = cantidadASaldo(borrador, deuda);
  const problemaCantidad = pasables > 1 && cantidadTocada ? leerCantidadSaldoAFavor(borrador.cantidad, pasables, deuda.categoria).problema : null;

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
  const valorAlDia = valor && valor.cantidad === n ? valor.v : null;

  async function pasar() {
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic. El candado es el de la casa: una ref.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const bloquea = guia.faltan.find((c) => c.requerido)?.id ?? guia.ahora;
      if (bloquea) guia.ir(bloquea);
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const pasadas = n ?? 0;
      const { documentos, error: falla } = await pasarDeudaASaldoAFavor(argsSaldoAFavor(deuda, borrador, token), responsable.firma());
      setGuardando(false);
      responsable.despues(falla);
      if (falla) {
        // Se cortó la señal: pudo registrarse. Reintentar sin cambiar nada es seguro (el mismo token no registra dos documentos).
        setError(
          esFalloDeRed(falla)
            ? { texto: AVISO_DE_CORTE_REPOSICION, recargar: false }
            : { texto: mensajeDeNosDebe(falla) ?? traducirError(falla, "pasar a saldo a favor"), recargar: sugiereRecargarNosDebe(falla) },
        );
        return;
      }
      avisar.exito(pasadas === 1 ? "Pasó 1 a saldo a favor" : `Pasaron ${pasadas.toLocaleString("es-PE")} a saldo a favor`, {
        detalle: detalleDeSaldoAFavor(documentos),
      });
      onCerrar();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal titulo="Pasar a saldo a favor" subtitulo={`${proveedorNombre} · ${nombreDeDeuda(deuda)}`} bloqueado={guardando} onClose={onCerrar} alCerrarEnfocar={volverA}>
      {(cerrar) => (
        <form
          // La demo (ADR-0389) abre esta hoja para mostrarla y la cierra sin registrar nada.
          data-guia="proveedor-ficha.hoja-saldo-a-favor"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void pasar();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-tinta/80">
            {/* Con factura, con su IGV: es lo que vuelve, y lo mismo que dice «Vale» más abajo. */}
            Te debe <b className="font-semibold text-tinta">{queDebe(deuda)}</b> ({deuda.montoConIgv != null ? `${soles(deuda.montoConIgv)} con IGV` : soles(deuda.montoPendiente)}):{" "}
            {porQueDebeEnFrase(deuda, hoy)}.
          </p>
          <p className="nota-cayla text-[13px]">
            Úsalo si el proveedor no las va a mandar. Se registra un documento interno por lo que pagaste por ellas: baja lo que le debes por ese
            comprobante y, si ya lo pagaste, queda a favor para tu próximo pago. No suma prendas al stock.
          </p>
          {deuda.sinPapel > 0 && (
            <Aviso tono="info" chico>
              {cantidadDePrendas(deuda.sinPapel, deuda.categoria)} no {deuda.sinPapel === 1 ? "está" : "están"} en ningún comprobante: no se
              facturaron, así que no hay plata que pasar por {deuda.sinPapel === 1 ? "ella" : "ellas"}.
            </Aviso>
          )}

          {pasables > 1 ? (
            <CampoGuiado id="cantidad" guia={guia} titulo="¿Cuántas pasan a saldo a favor?" ayuda={`se pueden pasar ${pasables.toLocaleString("es-PE")}`}>
              <CampoTexto
                id="saldo-cantidad"
                etiqueta="Cuántas pasan"
                caja
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
                value={borrador.cantidad}
                tono={problemaCantidad ? "error" : undefined}
                pie={problemaCantidad ?? undefined}
                sinPie={!problemaCantidad}
                onChange={(e) => {
                  setCantidadTocada(true);
                  setBorrador((b) => ({ ...b, cantidad: limpiarCantidadReposicion(e.target.value) }));
                }}
              />
            </CampoGuiado>
          ) : (
            <p className="text-sm text-tinta/80">Se pasa 1.</p>
          )}

          {n != null && (
            <div className="rounded-xl bg-hueso px-4 py-3" aria-live="polite">
              {valorAlDia ? (
                <>
                  <p className="text-sm text-tinta">
                    Vale <b className="font-semibold tabular-nums">{cuantoVale(valorAlDia)}</b>, lo que costaron en su comprobante.
                  </p>
                  <p className="mt-1 text-[13px] text-tinta/75">{fraseSaldoAFavor(proveedorNombre, valorAlDia)}</p>
                  {fraseNotaDeLaFactura(valorAlDia) && <p className="mt-1 text-[13px] text-tinta/75">{fraseNotaDeLaFactura(valorAlDia)}</p>}
                </>
              ) : (
                <p className="text-[13px] text-tinta/65">{valor && valor.cantidad === n ? "No pude calcular cuánto vale: la base lo dirá al pasarlo." : "Calculando cuánto vale…"}</p>
              )}
            </div>
          )}

          <CampoGuiado id="nota" guia={guia} titulo="Nota">
            <CampoTexto
              id="saldo-nota"
              etiqueta="Nota"
              caja
              maxLength={TOPES_REPOSICION.nota}
              placeholder="Por qué no la va a mandar (opcional)"
              value={borrador.nota}
              onChange={(e) => setBorrador((b) => ({ ...b, nota: e.target.value }))}
            />
            <p className="mt-1.5 text-xs text-taupe">Queda en el historial de esta deuda.</p>
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia} titulo="Quién lo hace">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <PieGuia guia={guia} listo="Todo listo para pasarlo a saldo a favor." />
          {error && (
            <Aviso
              ref={avisoError}
              enfocable
              tono="error"
              titulo="No se pudo pasar a saldo a favor"
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
            <Boton textoCargando="Pasando…" type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {textoBotonSaldoAFavor(n)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
