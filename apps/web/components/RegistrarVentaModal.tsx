"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { traducirError } from "@/lib/error-escritura";
import { filtrarPrendas, resolverCodigo, type PrendaBuscable } from "@/lib/buscar-prenda";
import { Ayuda } from "@/components/Ayuda";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";

type VarianteBusqueda = PrendaBuscable & {
  precio: number | null;
  stockAqui: number;
};

type ItemCarrito = {
  varianteId: string;
  referencia: string;
  codigo: string | null; // lo que dice la etiqueta; el sku es el respaldo
  sku: string;
  cantidad: number;
  monto: number; // precio unitario
  stockAqui: number; // tope real de esta sede, para frenar antes de llamar a la RPC
};

type Props = {
  sedeCodigo: string;
  cajaId: string;
  variantes: VarianteBusqueda[];
  /** `codigos_barras` aplanada: código impreso o de fábrica → variante. Vacía si no llegó. */
  porCodigoBarras: Record<string, string>;
  onClose: () => void;
};

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  pos: "POS",
  yape: "Yape",
  transferencia: "Transferencia",
};

const MAX_RESULTADOS = 6;

export function RegistrarVentaModal({ sedeCodigo, cajaId, variantes, porCodigoBarras, onClose }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ total: number; prendas: number } | null>(null);
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

  const term = q.trim();

  // La lógica de reconocer una prenda vive en `lib/buscar-prenda.ts`, con prueba: es lo
  // que decide si una etiqueta escaneada entra o no, y ahí no se puede adivinar.
  const resultados = useMemo(() => filtrarPrendas(q, variantes, MAX_RESULTADOS), [variantes, q]);

  function agregar(v: VarianteBusqueda) {
    // Sin stock en esta sede no se agrega. La RPC lo rechazaría igual por el
    // `check (cantidad >= 0)` de `stock` (0010_stock_concurrencia.sql:14), y enterarse
    // recién ahí —con la clienta enfrente— es la peor forma de saberlo.
    if (v.stockAqui <= 0) {
      setAviso(`${v.referencia} no tiene stock en ${sedeCodigo}. Búscala en Inventario para ver dónde está.`);
      return;
    }
    // El tope se decide contra el carrito de ESTE render, no adentro del updater de
    // `setCarrito`: React puede correr ese updater recién al renderizar, y para entonces
    // el aviso ya se había decidido con el tope en falso — así "quedan N" no se veía nunca
    // y la Encargada escaneaba sin saber por qué la prenda no entraba (visto el 2026-09-11).
    const existente = carrito.find((it) => it.varianteId === v.varianteId);
    const tope = existente !== undefined && existente.cantidad >= v.stockAqui;
    if (!tope) {
      setCarrito((actual) => {
        const ya = actual.find((it) => it.varianteId === v.varianteId);
        if (!ya) {
          return [
            ...actual,
            {
              varianteId: v.varianteId,
              referencia: v.referencia,
              codigo: v.codigo,
              sku: v.sku,
              cantidad: 1,
              monto: v.precio ?? 0,
              stockAqui: v.stockAqui,
            },
          ];
        }
        // Dos escaneos antes de un render: el updater vuelve a mirar el tope por su cuenta.
        if (ya.cantidad >= v.stockAqui) return actual;
        return actual.map((it) => (it.varianteId === v.varianteId ? { ...it, cantidad: it.cantidad + 1 } : it));
      });
    }
    setAviso(tope ? `En ${sedeCodigo} quedan ${v.stockAqui} de ${v.referencia}. No puedes vender más.` : null);
    setQ("");
    setActivo(0);
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
   * Las flechas y el Escape se levantan de `Desplegable` (ui/campos.tsx), no se inventan: es
   * el mismo teclado del selector de sede y del panel "+ Nuevo" (ADR-0019).
   */
  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!term) return;
      // Un escaneo trae un código completo —el corto de la etiqueta, el de fábrica o el
      // SKU viejo—: ahí no hay nada que elegir de la lista.
      const exacta = resolverCodigo(q, variantes, porCodigoBarras);
      if (exacta) return agregar(exacta);
      if (resultados.length > 0) return agregar(resultados[Math.min(activo, resultados.length - 1)]);
      setAviso(`No encontramos «${q.trim()}» en ${sedeCodigo}. Revisa la etiqueta o búscala en Inventario.`);
      return;
    }
    if (e.key === "ArrowDown" && resultados.length > 0) {
      e.preventDefault();
      setActivo((i) => (i + 1) % resultados.length);
      return;
    }
    if (e.key === "ArrowUp" && resultados.length > 0) {
      e.preventDefault();
      setActivo((i) => (i - 1 + resultados.length) % resultados.length);
      return;
    }
    if (e.key === "Escape" && q !== "") {
      // Con texto escrito, Escape limpia la búsqueda. Sin él sube hasta Radix y cierra el
      // modal entero, que es lo correcto solo cuando no queda nada que limpiar.
      e.preventDefault();
      e.stopPropagation();
      setQ("");
      setActivo(0);
      setAviso(null);
    }
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
      // Sin tocar `token.current`: si esto fue un corte de red y la venta ya se había
      // comiteado del otro lado, un reintento con el mismo token la recupera en vez
      // de duplicarla (ADR-0033). No hay forma de distinguir ese caso de un error
      // real desde el navegador, así que se deja el mismo token siempre — y por eso
      // el mensaje dice que reintentar es seguro.
      setError(traducirError(error, "registrar la venta", { reintentoSeguro: true }));
      return;
    }
    // El acuse se muestra ANTES de cerrar: quien recién aprende necesita ver que la venta
    // entró. El refresco va acá para que "Ventas de hoy" ya esté al día al volver.
    setOk({ total, prendas });
    router.refresh();
  }

  return (
    <Modal
      titulo={ok ? "Venta registrada" : "Registrar venta"}
      subtitulo={`Sede ${sedeCodigo}`}
      onClose={onClose}
    >
      {ok ? (
        <div className="space-y-5">
          <div className="card-cayla p-5 text-center">
            <p className="label-cayla text-[11px] text-verde-profundo">Listo</p>
            <p className="font-display mt-2 text-3xl text-tinta">S/{ok.total.toFixed(2)}</p>
            <p className="mt-1 text-sm text-tinta/70">
              {ok.prendas} {ok.prendas === 1 ? "prenda" : "prendas"} · {ETIQUETA_METODO[metodoPago]}
            </p>
          </div>
          <p className="text-center text-xs text-tinta/65">
            Ya está descontada del stock de {sedeCodigo} y aparece abajo, en «Ventas de hoy».
          </p>
          <button type="button" autoFocus onClick={onClose} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="venta-buscar">
              Escanea la etiqueta o busca la prenda
            </label>
            <input
              id="venta-buscar"
              ref={buscador}
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActivo(0);
                setAviso(null);
              }}
              onKeyDown={alTeclado}
              placeholder="Código de la etiqueta, referencia, talla, color…"
              role="combobox"
              aria-expanded={resultados.length > 0}
              aria-controls="venta-resultados"
              aria-activedescendant={resultados.length > 0 ? `venta-op-${activo}` : undefined}
              aria-autocomplete="list"
              className={campoTexto}
            />
            {resultados.length > 0 && (
              <ul
                id="venta-resultados"
                role="listbox"
                aria-label="Prendas encontradas"
                className="card-cayla divide-y divide-sand"
              >
                {resultados.map((v, i) => (
                  <li key={v.varianteId} id={`venta-op-${i}`} role="option" aria-selected={i === activo}>
                    <button
                      type="button"
                      onMouseEnter={() => setActivo(i)}
                      onClick={() => agregar(v)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                        i === activo ? "bg-sand" : ""
                      }`}
                    >
                      <span>
                        {v.referencia}{" "}
                        <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join("/")}</span>{" "}
                        {/* El código que va en la etiqueta: así la Encargada confirma que es ESA prenda. */}
                        <span className="font-mono text-xs text-tinta/65">{v.codigo ?? v.sku}</span>
                      </span>
                      <span className={`text-xs ${v.stockAqui <= 0 ? "text-rojo-profundo" : "text-tinta/65"}`}>
                        {v.stockAqui <= 0 ? `sin stock en ${sedeCodigo}` : `stock ${v.stockAqui}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* Un buscador que no encuentra y no dice nada enseña a desconfiar de él. */}
            {term !== "" && resultados.length === 0 && (
              <p className="card-cayla px-3 py-3 text-sm text-tinta/70">
                No encontramos «{q.trim()}» en {sedeCodigo}. Revisa la etiqueta o búscala en Inventario.
              </p>
            )}
            {aviso && <p className="text-sm text-ambar-profundo">{aviso}</p>}
          </div>

          {carrito.length > 0 && (
            <div className="space-y-2">
              {carrito.map((it) => (
                <div key={it.varianteId} className="card-cayla flex items-center gap-2 p-2 text-sm">
                  <div className="flex-1">
                    <p className="font-medium text-tinta">{it.referencia}</p>
                    <p className="font-mono text-xs text-tinta/65">{it.codigo ?? it.sku}</p>
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
