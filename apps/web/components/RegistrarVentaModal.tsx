"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { createClient } from "@/lib/supabase/client";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { encolarVenta, pasaElUmbralDeSobra } from "@/lib/ventas-offline";
import { Ayuda } from "@/components/Ayuda";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

type VarianteBusqueda = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number | null;
  stockAqui: number;
};

type ItemCarrito = {
  varianteId: string;
  referencia: string;
  sku: string;
  cantidad: number;
  monto: number; // precio unitario
  stockAqui: number; // tope real de esta sede, para frenar antes de llamar a la RPC
};

type Props = {
  sedeCodigo: string;
  cajaId: string;
  variantes: VarianteBusqueda[];
  /** Si el sondeo de conexión del panel ya sabe que no hay servidor (Paso 3A, ADR-0036). */
  sinConexion: boolean;
  /** Avisa al panel que hay una venta nueva en la cola, para que refresque el overlay de stock. */
  onVentaEncolada: () => void;
  onClose: () => void;
};

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  pos: "POS",
  yape: "Yape",
  transferencia: "Transferencia",
};

const MAX_RESULTADOS = 6;

export function RegistrarVentaModal({ sedeCodigo, cajaId, variantes, sinConexion, onVentaEncolada, onClose }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  /** El varianteId resaltado dentro de `resultados`. cmdk lo mueve solo con las
      flechas y lo reasienta al primer resultado cuando la lista cambia; acá
      solo se LEE para saber a quién agrega un Enter sin match exacto. */
  const [resaltado, setResaltado] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ total: number; prendas: number; offline: boolean } | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  /**
   * El token que hace que reintentar NO cobre dos veces.
   *
   * `traducirError` le dice a la Encargada "no se guardó nada — vuelve a intentar" cuando la
   * llamada falla sin llegar al servidor. Con la red de la tienda eso es mentira la mitad de
   * las veces: `Failed to fetch` no distingue entre "no salió" y "salió, entró, y se cortó la
   * respuesta". Si el corte fue de vuelta, la venta YA está registrada y el stock YA se
   * descontó — y la pantalla la está invitando a repetirla.
   *
   * `registrar_venta` es idempotente por `p_token` (migración `0054`): con el mismo token y el
   * mismo carrito devuelve la venta que ya existe en vez de crear otra.
   *
   * Va en un `ref` y NO en estado, a propósito: tiene que sobrevivir a los re-render del
   * carrito SIN provocar ninguno. Y se crea en el primer envío, no al montar: es el
   * identificador de ESTE intento de venta, y vive hasta que la venta entra. Si ella corrige
   * el carrito y vuelve a intentar, el token sigue siendo el mismo — y ahí está lo importante:
   * si el primer intento sí había entrado, la RPC lo rechaza en vez de cobrar de nuevo.
   */
  const token = useRef<string | null>(null);

  const term = q.trim().toLowerCase();

  const resultados = useMemo(() => {
    if (!term) return [];
    return variantes
      .filter((v) => `${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`.toLowerCase().includes(term))
      .slice(0, MAX_RESULTADOS);
  }, [variantes, term]);

  function agregar(v: VarianteBusqueda) {
    // Sin stock en esta sede no se agrega. La RPC lo rechazaría igual por el
    // `check (cantidad >= 0)` de `stock` (0010_stock_concurrencia.sql:14), y enterarse
    // recién ahí —con la clienta enfrente— es la peor forma de saberlo.
    if (v.stockAqui <= 0) {
      setAviso(`${v.referencia} no tiene stock en ${sedeCodigo}. Búscala en Inventario para ver dónde está.`);
      return;
    }
    let tope = false;
    setCarrito((actual) => {
      const existente = actual.find((it) => it.varianteId === v.varianteId);
      if (!existente) {
        return [
          ...actual,
          {
            varianteId: v.varianteId,
            referencia: v.referencia,
            sku: v.sku,
            cantidad: 1,
            monto: v.precio ?? 0,
            stockAqui: v.stockAqui,
          },
        ];
      }
      if (existente.cantidad >= v.stockAqui) {
        tope = true;
        return actual;
      }
      return actual.map((it) => (it.varianteId === v.varianteId ? { ...it, cantidad: it.cantidad + 1 } : it));
    });
    setAviso(tope ? `En ${sedeCodigo} quedan ${v.stockAqui} de ${v.referencia}. No puedes vender más.` : null);
    setQ("");
    setResaltado("");
    // Devolver el foco al buscador es lo que permite escanear una prenda tras otra sin
    // tocar el mouse: la pistola dispara el siguiente código sobre el campo correcto.
    buscador.current?.focus();
  }

  function quitar(varianteId: string) {
    setCarrito((actual) => actual.filter((it) => it.varianteId !== varianteId));
    setAviso(null);
  }

  function actualizar(varianteId: string, campo: "cantidad" | "monto", valor: number) {
    if (campo === "monto") {
      setCarrito((actual) => actual.map((it) => (it.varianteId === varianteId ? { ...it, monto: valor } : it)));
      return;
    }
    const item = carrito.find((it) => it.varianteId === varianteId);
    if (!item) return;
    const cantidad = Math.max(1, Math.min(valor || 1, item.stockAqui));
    setAviso(valor > item.stockAqui ? `En ${sedeCodigo} quedan ${item.stockAqui} de ${item.referencia}.` : null);
    setCarrito((actual) => actual.map((it) => (it.varianteId === varianteId ? { ...it, cantidad } : it)));
  }

  /**
   * El teclado del buscador — la pieza que hacía falta para que la caja acepte la pistola.
   *
   * La Zebra "tipea" el SKU de la etiqueta y da Enter sola (es lo que ya hace funcionar
   * `/buscar` sin configurar nada). Acá ese Enter caía en el envío implícito del formulario:
   * con el carrito vacío mostraba "El carrito está vacío", y con el carrito ya cargado
   * REGISTRABA LA VENTA a mitad del escaneo. Por eso lo primero que hace este manejador es
   * quitarle a este campo la capacidad de enviar el formulario: vender es un acto aparte,
   * con su propio botón.
   *
   * Las flechas las mueve `cmdk` solo (Command de abajo, `shouldFilter={false}`): resalta el
   * primer resultado cuando la lista cambia y las sube/baja sin que este handler intervenga.
   * Enter y Escape SÍ se interceptan acá, ANTES de que cmdk los vea (`stopPropagation`) — cmdk
   * dispararía su propio `onSelect` sobre lo resaltado, que no sabe nada de "SKU exacto
   * primero" ni puede evitar que Escape suba hasta el Modal y lo cierre entero.
   */
  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (!term) return;
      // Un escaneo trae el SKU exacto: ahí no hay nada que elegir de la lista.
      const exacta = variantes.find((v) => v.sku.toLowerCase() === term);
      if (exacta) return agregar(exacta);
      if (resultados.length > 0) {
        const elegida = resultados.find((v) => v.varianteId === resaltado) ?? resultados[0];
        return agregar(elegida);
      }
      setAviso(`No encontramos «${q.trim()}» en ${sedeCodigo}. Revisa la etiqueta o búscala en Inventario.`);
      return;
    }
  }

  /**
   * Radix escucha Escape con un listener de CAPTURA sobre `document`
   * (`@radix-ui/react-use-escape-keydown`) — corre ANTES de que cualquier
   * `onKeyDown` normal (fase de burbuja, como `alTeclado` de arriba) llegue a
   * ejecutarse. `preventDefault()` ahí siempre llega tarde para frenarlo. La
   * única forma real de evitar que Escape cierre el modal es el propio gancho
   * que Radix expone para esto: `onEscapeKeyDown` en `Dialog.Content`.
   */
  function alEscapeDelModal(e: KeyboardEvent) {
    if (q === "") return; // nada que limpiar: que cierre el modal, como siempre.
    e.preventDefault();
    setQ("");
    setResaltado("");
    setAviso(null);
  }

  const total = carrito.reduce((acc, it) => acc + it.cantidad * it.monto, 0);
  const prendas = carrito.reduce((acc, it) => acc + it.cantidad, 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (carrito.length === 0) {
      setError("Todavía no agregaste ninguna prenda. Escanea la etiqueta o escribe la referencia arriba.");
      return;
    }
    setLoading(true);
    setError(null);

    // Se crea una sola vez y se conserva entre reintentos: es lo que los vuelve seguros.
    token.current ??= crypto.randomUUID();

    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_venta", {
      p_caja_id: cajaId,
      p_metodo_pago: metodoPago,
      p_items: carrito.map((it) => ({ variante_id: it.varianteId, cantidad: it.cantidad, monto: it.monto })),
      p_token: token.current,
    });

    setLoading(false);
    if (error) {
      // Sin tocar `token.current` en ninguna rama de abajo: si esto fue un corte de red y
      // la venta ya se había comiteado del otro lado, un reintento —a mano o desde la
      // cola— con el mismo token la recupera en vez de duplicarla (ADR-0032/0033).
      if (esFalloDeRed(error)) {
        // La regla del umbral (ADR-0013 §C), ANTES de encolar (ADR-0036): sin red no hay
        // forma de coordinarse con otra sede, así que vender hasta dejar el stock en cero
        // acá es justo el escenario que puede sobrevender. Se juzga sobre `it.stockAqui`,
        // que ya trae el overlay de la cola aplicado (es el número que la Encargada ve).
        const sinSobra = carrito.filter((it) => !pasaElUmbralDeSobra(it.stockAqui, it.cantidad));
        if (sinSobra.length > 0) {
          setError(
            `Sin conexión no se puede vender ${sinSobra.map((it) => it.referencia).join(", ")}: hay que dejar al menos 1 unidad en ${sedeCodigo} hasta que vuelva la red, para que dos ventas sin conexión no vendan la misma última prenda. Espera la señal o quita esa prenda del carrito.`
          );
          return;
        }
        encolarVenta({
          token: token.current,
          cajaId,
          sedeCodigo,
          metodoPago,
          items: carrito.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad, monto: it.monto })),
          creadoEn: new Date().toISOString(),
        });
        onVentaEncolada();
        setOk({ total, prendas, offline: true });
        return;
      }
      // Un rechazo real del servidor (caja cerrada, sin permiso, token reusado) no se
      // encola: reintentar no lo arreglaría, y encolarlo dejaría una venta atascada para
      // siempre. `reintentoSeguro` no aplica acá — solo cambia el mensaje del corte de
      // red puro, y `esFalloDeRed(error)` ya dio `false`: el servidor SÍ respondió.
      setError(traducirError(error, "registrar la venta"));
      return;
    }
    // El acuse se muestra ANTES de cerrar: quien recién aprende necesita ver que la venta
    // entró. El refresco va acá para que "Ventas de hoy" ya esté al día al volver.
    setOk({ total, prendas, offline: false });
    router.refresh();
  }

  return (
    <Modal
      titulo={ok ? "Venta registrada" : "Registrar venta"}
      subtitulo={`Sede ${sedeCodigo}`}
      onClose={onClose}
      onEscapeKeyDown={alEscapeDelModal}
    >
      {ok ? (
        <div className="space-y-5">
          <div className="card-cayla p-5 text-center">
            <p className={`label-cayla text-[11px] ${ok.offline ? "text-ambar-profundo" : "text-verde-profundo"}`}>
              {ok.offline ? "Guardada — sube sola" : "Listo"}
            </p>
            <p className="font-display mt-2 text-3xl text-tinta">S/{ok.total.toFixed(2)}</p>
            <p className="mt-1 text-sm text-tinta/70">
              {ok.prendas} {ok.prendas === 1 ? "prenda" : "prendas"} · {ETIQUETA_METODO[metodoPago]}
            </p>
          </div>
          {ok.offline ? (
            <p className="text-center text-xs leading-relaxed text-ambar-profundo">
              Sin conexión: se guardó en este equipo y ya descuenta el stock que ves acá. Sube sola cuando vuelva la
              señal — no hace falta que hagas nada. No se puede emitir comprobante para esta venta hasta que suba.
            </p>
          ) : (
            <p className="text-center text-xs text-tinta/65">
              Ya está descontada del stock de {sedeCodigo} y aparece abajo, en «Ventas de hoy».
            </p>
          )}
          <button type="button" autoFocus onClick={onClose} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {sinConexion && (
            <div className="card-cayla border-ambar/50 bg-ambar/10 p-3 text-xs leading-relaxed text-ambar-profundo">
              Sin conexión con el servidor. Puedes vender igual — se guarda acá y sube sola al volver la señal.
            </div>
          )}
          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="venta-buscar">
              Escanea la etiqueta o busca la prenda
            </label>
            {/* shouldFilter=false: el filtro ya lo hace `resultados` (useMemo de arriba),
                cmdk solo pone el teclado (resaltar/mover) y el click encima. */}
            <Command shouldFilter={false} value={resaltado} onValueChange={setResaltado} className="overflow-visible bg-transparent">
              <CommandPrimitive.Input
                id="venta-buscar"
                ref={buscador}
                autoFocus
                value={q}
                onValueChange={(v) => {
                  setQ(v);
                  setAviso(null);
                }}
                onKeyDown={alTeclado}
                placeholder="Referencia, SKU, talla, color…"
                className={campoTexto}
              />
              {resultados.length > 0 && (
                <CommandList className="card-cayla mt-1.5 max-h-none divide-y divide-sand overflow-x-visible overflow-y-visible">
                  <CommandGroup aria-label="Prendas encontradas" className="p-0">
                    {resultados.map((v) => (
                      <CommandItem
                        key={v.varianteId}
                        value={v.varianteId}
                        onSelect={() => agregar(v)}
                        className="flex items-center justify-between rounded-none px-3 py-2 text-left text-sm data-[selected=true]:bg-sand"
                      >
                        <span>
                          {v.referencia}{" "}
                          <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                        </span>
                        <span className={`text-xs ${v.stockAqui <= 0 ? "text-rojo-profundo" : "text-tinta/65"}`}>
                          {v.stockAqui <= 0 ? `sin stock en ${sedeCodigo}` : `stock ${v.stockAqui}`}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              )}
              {/* Un buscador que no encuentra y no dice nada enseña a desconfiar de él. */}
              {term !== "" && resultados.length === 0 && (
                <p className="card-cayla mt-1.5 px-3 py-3 text-sm text-tinta/70">
                  No encontramos «{q.trim()}» en {sedeCodigo}. Revisa la etiqueta o búscala en Inventario.
                </p>
              )}
            </Command>
            {aviso && <p className="text-sm text-ambar-profundo">{aviso}</p>}
          </div>

          {carrito.length > 0 && (
            <div className="space-y-2">
              {carrito.map((it) => (
                <div key={it.varianteId} className="card-cayla flex items-center gap-2 p-2 text-sm">
                  <div className="flex-1">
                    <p className="font-medium text-tinta">{it.referencia}</p>
                    <p className="font-mono text-xs text-tinta/65">{it.sku}</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={it.stockAqui}
                    aria-label={`Cantidad de ${it.referencia}`}
                    value={it.cantidad}
                    onChange={(e) => actualizar(it.varianteId, "cantidad", Number(e.target.value))}
                    className="w-14 border border-sand px-1.5 py-1 text-center text-xs text-tinta outline-none focus:border-rojo"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.10"
                    aria-label={`Precio de ${it.referencia}`}
                    value={it.monto}
                    onChange={(e) => actualizar(it.varianteId, "monto", Number(e.target.value))}
                    className="w-20 border border-sand px-1.5 py-1 text-right text-xs text-tinta outline-none focus:border-rojo"
                  />
                  <button type="button" onClick={() => quitar(it.varianteId)} className="text-xs text-rojo">
                    Quitar
                  </button>
                </div>
              ))}
              <div className="flex justify-between border-t border-sand pt-2 text-sm font-semibold text-tinta">
                <span>Total</span>
                <span>S/{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="flex items-center">
              <label className={campoEtiqueta} htmlFor="venta-metodo">
                Método de pago
              </label>
              <Ayuda titulo="Método de pago">
                Cómo pagó la clienta. Acá se registra, no se cobra: Yape y POS se cobran en su
                propio aparato y esto es la anotación de que entró por ahí. Sirve para el cuadre
                del cierre, donde solo se cuenta el efectivo.
              </Ayuda>
            </span>
            <select
              id="venta-metodo"
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
              className={campoSelect}
            >
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO[m]}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-rojo">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={loading || carrito.length === 0} className={botonPrimario}>
              {loading ? "Guardando…" : "Registrar venta"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
