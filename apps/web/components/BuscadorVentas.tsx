"use client";

import { useEffect, useState, type MutableRefObject, type RefObject } from "react";
import { ArrowRight, Loader2, ReceiptText, ScanLine, Search, X } from "lucide-react";
import { Desplegable } from "@/components/ui/campos";

/** "/" enfoca la búsqueda desde cualquier parte de la pantalla (como en Linear o GitHub).
 *  Solo fuera de un campo: dentro de uno, "/" es un carácter más. `activo` es false
 *  mientras hay un flujo abierto, que tiene sus propios campos. */
export function useAtajoBusqueda(campoRef: RefObject<HTMLInputElement | null>, activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    function alTeclado(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const destino = e.target as HTMLElement | null;
      if (destino && (["INPUT", "SELECT", "TEXTAREA"].includes(destino.tagName) || destino.isContentEditable)) return;
      e.preventDefault();
      campoRef.current?.focus();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [campoRef, activo]);
}

const CHIP_ACCION =
  "inline-flex h-10 items-center gap-2 rounded-full bg-papel px-4 text-sm font-medium text-tinta ring-1 ring-tinta/[0.14] transition-[transform,box-shadow] duration-300 hover:-translate-y-px hover:ring-tinta/30";

/**
 * El área de acción de Cambios y de Devoluciones (2026-09-18): responde "¿qué quiero
 * hacer?" antes que nada. La búsqueda es la protagonista; al lado, las dos formas de llegar
 * a una venta cuando la clienta no trae la boleta.
 *
 * - Un solo campo entiende boleta ("B001-10"), DNI/RUC, nombre de la clienta, nombre de
 *   la prenda o su etiqueta — `clasificarBusqueda` decide cuál es cuál. El teléfono NO:
 *   ninguna tabla lo guarda, y el texto de ayuda no promete lo que no existe.
 * - "Escanear prenda" no abre una cámara: la pistola de CAYLA teclea el código y un
 *   Enter en el campo que tenga el foco. El botón deja el campo listo y lo dice.
 * - "Buscar en" reemplaza al switch "Buscar en todas las sedes" y solo lo ve un líder:
 *   la RLS de ventas (`fn_puede_operar_ubicacion`) no deja a una integrante ver otras
 *   sedes — el switch le decía "no encontramos" aunque la boleta existiera.
 */
export function BuscadorVentas({
  valorInicial,
  todasInicial,
  puedeVerTodas,
  sede,
  buscando,
  campoRef,
  onBuscar,
  onLimpiar,
  onSinComprobante,
  escanearRef,
  escanearEnBarraMovil = false,
}: {
  valorInicial: string;
  todasInicial: boolean;
  puedeVerTodas: boolean;
  sede: string;
  buscando: boolean;
  campoRef: RefObject<HTMLInputElement | null>;
  onBuscar: (texto: string, todas: boolean) => void;
  onLimpiar: () => void;
  onSinComprobante: () => void;
  /** Deja «Escanear prenda» al alcance de otra pieza (la barra fija del celular en Devoluciones):
   *  hace lo mismo que el chip, sin duplicar el estado del escaneo. */
  escanearRef?: MutableRefObject<(() => void) | null>;
  /** En el celular «Escanear prenda» ya está fijo abajo: el chip no se repite. */
  escanearEnBarraMovil?: boolean;
}) {
  const [texto, setTexto] = useState(valorInicial);
  const [todas, setTodas] = useState(todasInicial);
  const [escaneando, setEscaneando] = useState(false);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEscaneando(false);
    const limpio = texto.trim();
    if (limpio) onBuscar(limpio, todas);
    else onLimpiar();
  }

  function prepararEscaneo() {
    setEscaneando(true);
    setTexto("");
    campoRef.current?.focus();
  }

  useEffect(() => {
    if (!escanearRef) return;
    escanearRef.current = prepararEscaneo;
    return () => {
      escanearRef.current = null;
    };
  });

  return (
    <form role="search" onSubmit={enviar} className="space-y-4">
      {/* Una sola píldora: la búsqueda y su botón. Al enfocarla se despega un poco y toma el
          hilo (taupe) como borde. */}
      <div
        className={`flex h-16 items-center gap-3 rounded-xl bg-papel pl-5 pr-2.5 shadow-[0_20px_42px_-28px_rgba(80,50,20,0.5)] ring-1 transition-[box-shadow,transform] duration-300 focus-within:-translate-y-px focus-within:shadow-[0_26px_52px_-26px_rgba(80,50,20,0.6)] focus-within:ring-2 focus-within:ring-taupe sm:pl-6 ${
          escaneando ? "ring-2 ring-taupe" : "ring-tinta/[0.09]"
        }`}
      >
        <label className="flex h-full min-w-0 flex-1 cursor-text items-center gap-3">
          {escaneando ? <ScanLine className="h-5 w-5 shrink-0 text-tinta" aria-hidden /> : <Search className="h-5 w-5 shrink-0 text-tinta/60" aria-hidden />}
          <input
            ref={campoRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => setEscaneando(false)}
            placeholder={escaneando ? "Escanea la etiqueta…" : "Boleta, DNI, clienta, prenda o código"}
            aria-label="Buscar la venta: boleta, DNI o RUC, nombre de la clienta, nombre o código de la prenda"
            className="min-w-0 flex-1 bg-transparent text-base text-tinta outline-none placeholder:text-tinta/55"
          />
        </label>
        {buscando ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-tinta/60" aria-label="Buscando" />
        ) : (
          texto && (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                onLimpiar();
                campoRef.current?.focus();
              }}
              aria-label="Limpiar la búsqueda"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tinta/60 transition-colors duration-200 hover:bg-sand/60 hover:text-tinta"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )
        )}
        <kbd
          aria-hidden
          title="Atajo: / enfoca la búsqueda"
          className="hidden h-6 min-w-6 items-center justify-center rounded-md bg-tinta/[0.06] px-2 font-mono text-[11px] text-tinta/60 sm:flex"
        >
          /
        </kbd>
        <button
          type="submit"
          disabled={buscando}
          className="boton-brillo label-cayla h-12 shrink-0 rounded-md bg-tinta px-5 text-[11px] text-crema transition-colors duration-300 hover:bg-tinta/85 disabled:opacity-60 sm:px-7"
        >
          Buscar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={prepararEscaneo} className={`${CHIP_ACCION} ${escanearEnBarraMovil ? "max-sm:hidden" : ""}`}>
          <ScanLine className="h-4 w-4" aria-hidden />
          Escanear prenda
        </button>
        <button type="button" onClick={onSinComprobante} className={CHIP_ACCION}>
          <ReceiptText className="h-4 w-4" aria-hidden />
          Sin comprobante
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>

        {puedeVerTodas && (
          <div className="ml-auto flex items-center gap-2 text-sm text-tinta/70">
            <span>Buscar en</span>
            <Desplegable
              forma="pastilla"
              alineacion="derecha"
              etiquetaAccesible="Dónde buscar la venta"
              valor={todas ? "todas" : "aqui"}
              opciones={[
                { valor: "aqui", texto: sede },
                { valor: "todas", texto: "Todas las tiendas" },
              ]}
              onValor={(v) => {
                const nuevas = v === "todas";
                setTodas(nuevas);
                // Con algo escrito, el cambio de alcance vuelve a buscar solo.
                if (texto.trim()) onBuscar(texto.trim(), nuevas);
              }}
            />
          </div>
        )}
      </div>

      {escaneando && (
        <p className="anim-revelar text-xs text-tinta/70" role="status">
          Listo para escanear: apunta la pistola a la etiqueta. La búsqueda sale sola.
        </p>
      )}
    </form>
  );
}
