"use client";

import { useEffect, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { ArrowRight, ReceiptText, ScanLine } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Desplegable } from "@/components/ui/campos";
import { usePistola } from "@/components/ui/usePistola";
import { busquedaDesdeLectura } from "@/lib/cambios-atajos-reglas";

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
 * - "Escanear prenda": la pistola se porta igual que en Vender (`usePistola`): con el foco en
 *   cualquier botón de la pantalla, su primera tecla vuelve al campo; lo leído reemplaza lo que
 *   hubiera escrito y busca solo, mande o no Enter. El botón deja el campo listo y lo dice. En el
 *   teléfono (pantalla táctil), si la pantalla pasa `onCamara`, abre la cámara (Cambios,
 *   spike 2026-09-26).
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
  onCamara,
  extra,
  pistola = true,
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
  /** Abre la cámara del teléfono. Sin esta prop (Devoluciones) el botón siempre prepara la pistola. */
  onCamara?: () => void;
  /** Un dato de contexto en la fila de los botones (Cambios: si la caja está abierta). */
  extra?: ReactNode;
  /** `false` con una ventana encima (la cámara, anular una venta): la pistola no le roba las teclas. */
  pistola?: boolean;
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
    // Un teléfono no tiene pistola: con pantalla táctil y cámara disponible, se lee con la cámara.
    if (onCamara && window.matchMedia?.("(pointer: coarse)").matches) return onCamara();
    setEscaneando(true);
    setTexto("");
    campoRef.current?.focus();
  }

  // Lo leído es un código, no lo que la persona tenía escrito: la búsqueda va con la lectura sola (y el QR de una boleta,
  // como «B004-31», `busquedaDesdeLectura`).
  usePistola(campoRef, {
    activa: pistola,
    fuera: "atraer",
    alLeer: ({ codigo }) => {
      const busqueda = busquedaDesdeLectura(codigo);
      setEscaneando(false);
      setTexto(busqueda);
      onBuscar(busqueda, todas);
    },
  });

  useEffect(() => {
    if (!escanearRef) return;
    escanearRef.current = prepararEscaneo;
    return () => {
      escanearRef.current = null;
    };
  });

  return (
    <form role="search" onSubmit={enviar} className="space-y-4">
      {/* El buscador del mostrador (ADR-0358, ronda 5): la píldora que se despega al enfocar, con su botón. Busca al tocar
          «Buscar» o con Enter (la pistola teclea el código y un Enter). Escaneando, el ícono pasa al código de barras. */}
      <Buscador
        tamano="mostrador"
        ref={campoRef}
        valor={texto}
        onCambio={setTexto}
        onBorrar={() => {
          setTexto("");
          onLimpiar();
        }}
        buscando={buscando}
        atajo="visible"
        icono={escaneando ? "barras" : "lupa"}
        onBlur={() => setEscaneando(false)}
        inputMode="search"
        placeholder={escaneando ? "Escanea la etiqueta…" : "Boleta, DNI, cliente, prenda o código"}
        etiqueta="Buscar la venta: boleta, DNI o RUC, nombre del cliente, nombre o código de la prenda"
        className={escaneando ? "escaneando" : ""}
        accion={
          <button type="submit" disabled={buscando} className="btn-cayla btn-primario h-12 shrink-0">
            Buscar
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        {/* En el celular este chip repite un botón fijo de abajo (la cámara en Cambios, «Escanear prenda» en
            Devoluciones): se esconde ahí. */}
        <button type="button" onClick={prepararEscaneo} className={`${CHIP_ACCION} ${onCamara || escanearEnBarraMovil ? "max-sm:hidden" : ""}`}>
          <ScanLine className="h-4 w-4" aria-hidden />
          Escanear prenda
        </button>
        <button type="button" onClick={onSinComprobante} className={CHIP_ACCION}>
          <ReceiptText className="h-4 w-4" aria-hidden />
          Sin comprobante
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>

        {extra}

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
