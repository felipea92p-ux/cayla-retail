"use client";

import { Fragment, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { useDestinoFlotante, usePosicionLista } from "@/components/ui/useAnclaje";
import { useComboLista } from "@/components/ui/useCombo";
import { clave } from "@/lib/buscar-prenda-v2";
import { comboNecesitaBuscador, primeraElegible, siguienteElegible, tramosPorGrupo } from "@/lib/combo-reglas";

/* ====================================================================
   Campos del sistema CAYLA · v3.1 (2026-09-08)

   Por qué existe este archivo: hasta ahora cada modal armaba sus campos
   pegando strings de clases (`campoTexto` en ui/Modal.tsx; el `campoSelect` de
   entonces ya no existe).
   Eso alcanza para un input suelto, pero no puede expresar comportamiento
   — un desplegable que se abre, una línea que se dibuja, una cifra que se
   re-asienta. Un string de clases no tiene estado.

   El brandbook prohíbe sombra, gradiente y esquina redondeada. Entonces
   la jerarquía visual de un formulario tiene que salir de otra parte:
   sale de UNA LÍNEA DE 1px. En reposo es `tinta/20`; cuando estás parado
   ahí, se dibuja encima una de `rojo` desde el centro hacia afuera. Ese
   es el "hilo vivo", y es lo único con color que se mueve en toda la app.
   Un solo dispositivo, usado en todos lados, en vez de cinco efectos.

   Todo lo de acá es PRESENTACIÓN. Ningún componente valida, transforma
   ni decide: recibe `valor`, avisa `onValor`, y ya. La lógica vive donde
   ya vivía.
   ==================================================================== */

/** El hilo vivo. Se dibuja desde el centro cuando el campo está activo.
    Exportado el 2026-09-09: el buscador global del AppShell usa el mismo
    dispositivo, y tenerlo definido dos veces era garantía de que un día
    se movieran por separado.
    `reposo` (2026-09-25, ADR-0211): la línea gris de "acá hay un campo" tiene sentido en un campo suelto
    sobre el fondo de la página — dentro del panel de píldoras (`divide-x`, fondo propio) varias píldoras
    seguidas la pintaban borde a borde y se leía como una sola barra negra de punta a punta del panel, no
    como el borde de cada una. `reposo={false}` la apaga y deja solo el trazo rojo/verde de la interacción. */
export function Hilo({
  activo,
  trabajando = false,
  valido = false,
  reposo = true,
}: {
  activo: boolean;
  trabajando?: boolean;
  /** El dato ya está bien: el hilo se queda en verde (ProveedorModal, 2026-09-19). */
  valido?: boolean;
  reposo?: boolean;
}) {
  return (
    <>
      {/* `--hilo` deja que una pantalla tiña la línea de reposo (el cobro guiado la pone terracota en
          el paso del comprobante); sin definirla es el mismo gris de siempre. */}
      {reposo && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px rounded-full bg-[var(--hilo,rgb(26_26_24/0.25))] transition-colors duration-500" />
      )}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-center rounded-full bg-rojo transition-transform duration-300 ease-cayla ${
          activo && !valido ? "scale-x-100" : "scale-x-0"
        }`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left rounded-full bg-verde transition-transform duration-300 ease-cayla ${
          valido ? "scale-x-100" : "scale-x-0"
        }`}
      />
      {trabajando && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-full">
          <span className="block h-full w-1/3 rounded-full bg-rojo [animation:cayla-hilo-barrido_1.1s_linear_infinite]" />
        </span>
      )}
    </>
  );
}

/* ------------------------------------------------------------------
   Campo: la caja común de etiqueta + control + pie.
   El pie ocupa alto fijo aunque esté vacío — si apareciera y
   desapareciera, el formulario entero saltaría al tipear un dígito malo.
   ------------------------------------------------------------------ */
type CampoProps = {
  etiqueta: ReactNode;
  /** Slot para el botón <Ayuda>, que va pegado a la etiqueta. */
  ayuda?: ReactNode;
  /** Texto bajo el campo. `tono` decide el color; el alto está reservado siempre. */
  pie?: ReactNode;
  tono?: "neutro" | "error" | "aviso" | "ok";
  htmlFor?: string;
  /** Id de la etiqueta, para controles compuestos (desplegable, segmentado)
      que no son un <input> y por lo tanto no se asocian con htmlFor. */
  idEtiqueta?: string;
  /** La etiqueta existe (para lectores de pantalla) pero no se ve: la caja ya dice qué es con su marcador. */
  etiquetaOculta?: boolean;
  children: ReactNode;
};

const TONO_PIE = {
  neutro: "text-tinta/65",
  error: "text-rojo",
  aviso: "text-ambar",
  ok: "text-verde-profundo",
} as const;

export function Campo({ etiqueta, ayuda, pie, tono = "neutro", htmlFor, idEtiqueta, etiquetaOculta = false, children }: CampoProps) {
  return (
    <div>
      <label id={idEtiqueta} htmlFor={htmlFor} className={etiquetaOculta ? "sr-only" : "label-cayla block text-[11px] text-tinta/65"}>
        {etiqueta}
        {ayuda}
      </label>
      <div className={etiquetaOculta ? "" : "mt-1.5"}>{children}</div>
      <div className={`mt-1 min-h-[0.9rem] text-xs leading-tight ${TONO_PIE[tono]}`}>
        {pie ? <span className="anim-revelar block">{pie}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   CampoTexto — input de una línea sobre el hilo vivo.
   Acepta todas las props nativas de <input>: quien lo use sigue
   controlando type, required, maxLength, inputMode, etc.
   ------------------------------------------------------------------ */
type CampoTextoProps = InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  pie?: ReactNode;
  tono?: CampoProps["tono"];
  /** Cifras y códigos: ancho de dígito fijo, para que no bailen al tipear. */
  mono?: boolean;
  /** Algo está en vuelo por culpa de este campo (una consulta al padrón, por
      ejemplo): el hilo barre para que se vea que el sistema no se colgó. */
  trabajando?: boolean;
  /** El valor ya está bien: el hilo de abajo se queda en verde. */
  valido?: boolean;
  /** Guía oficial: caja hundida en hueso, sin hilo, y la etiqueta solo para lectores de pantalla (barras de filtros). */
  caja?: boolean;
};

/* Altura única de todo control de una línea (input, fecha, combo): 36px, que
   es lo que ya medía un input `text-sm` + `py-2`. Se fija explícita porque
   Safari le da a `type="date"` su propia altura y letra internas, y un combo
   con `appearance-none` pierde la altura nativa — sin un número común, cada
   uno mide distinto al lado del otro. */
export const ALTO_CONTROL = "h-9";

/* Safari (macOS/iOS) dibuja el `type="date"` con su propio editor interno
   (::-webkit-datetime-edit), con relleno y tamaño de letra propios. Se le
   quita todo eso para que mida igual que un input de texto. Chrome ignora
   estas reglas sin efecto. */
const FECHA_COMO_TEXTO =
  "[&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit]:text-sm [&::-webkit-datetime-edit]:leading-none " +
  "[&::-webkit-datetime-edit-fields-wrapper]:p-0 [&::-webkit-date-and-time-value]:min-h-0 [&::-webkit-date-and-time-value]:text-left " +
  "[&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100";

export function CampoTexto({ etiqueta, ayuda, pie, tono, mono, trabajando, valido, caja = false, className = "", ...props }: CampoTextoProps) {
  // Un `id` propio permite enfocarlo desde un aviso (`avisar.error(…, { enfocar: id })`).
  const idPropio = useId();
  const id = props.id ?? idPropio;
  const [enfocado, setEnfocado] = useState(false);
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} pie={pie} tono={tono} htmlFor={id} etiquetaOculta={caja}>
      <div className={caja ? "caja-cayla relative px-3" : "relative"}>
        <input
          id={id}
          {...props}
          onFocus={(e) => {
            setEnfocado(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setEnfocado(false);
            props.onBlur?.(e);
          }}
          className={`w-full bg-transparent px-0.5 py-2 text-sm text-tinta outline-none placeholder:text-tinta/55 ${caja ? "h-10" : ALTO_CONTROL} ${
            mono ? "font-mono tabular-nums tracking-wider" : ""
          } ${props.type === "date" || props.type === "time" ? FECHA_COMO_TEXTO : ""} ${className}`}
        />
        {!caja && <Hilo activo={enfocado} trabajando={trabajando} valido={valido} />}
      </div>
    </Campo>
  );
}

/* ------------------------------------------------------------------
   CampoMonto — la cifra es lo más importante de la pantalla, así que
   se lee como la pantalla de un instrumento, no como un input más:
   serif grande, dígitos de ancho fijo, y el "S/" fijo a la izquierda
   en gris para que no compita con el número.
   ------------------------------------------------------------------ */
type CampoMontoProps = InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  pie?: ReactNode;
  tono?: CampoProps["tono"];
  moneda?: string;
};

export function CampoMonto({ etiqueta, ayuda, pie, tono, moneda = "S/", className = "", ...props }: CampoMontoProps) {
  const id = useId();
  const [enfocado, setEnfocado] = useState(false);
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} pie={pie} tono={tono} htmlFor={id}>
      <div className="relative flex items-baseline gap-2">
        <span aria-hidden className="font-display select-none pb-1 text-lg leading-none text-tinta/65">
          {moneda}
        </span>
        <input
          id={id}
          {...props}
          onFocus={(e) => {
            setEnfocado(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setEnfocado(false);
            props.onBlur?.(e);
          }}
          // Las flechitas del type=number rompen la lectura de instrumento.
          className={`font-display w-full bg-transparent pb-1 text-[1.75rem] leading-none tabular-nums text-tinta outline-none placeholder:text-tinta/55 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`}
        />
        <Hilo activo={enfocado} />
      </div>
    </Campo>
  );
}

/* ------------------------------------------------------------------
   Segmentado — dos o tres opciones que se ven todas a la vez.
   Se usa cuando la opción CAMBIA el resto del formulario (boleta pide
   DNI, factura exige RUC): con un desplegable esa consecuencia queda
   escondida detrás de un clic. El indicador es el mismo hilo rojo,
   que se desliza en vez de aparecer — el deslizamiento es lo que
   dice "es el mismo control, cambió la selección".
   ------------------------------------------------------------------ */
/* ------------------------------------------------------------------
   Interruptor (switch). Para UNA opción que se prende o se apaga y cuyo
   texto ya dice qué pasa al prenderla ("El precio incluye IGV"). Distinto
   del Segmentado, que es para elegir entre dos o más opciones con nombre
   propio. `role="switch"` + `aria-checked`: lector de pantalla y teclado
   (Espacio/Enter) lo tratan como interruptor, no como botón.
   ------------------------------------------------------------------ */
export function Interruptor({ activo, onActivo, etiqueta, pie, disabled = false }: { activo: boolean; onActivo: (v: boolean) => void; etiqueta: ReactNode; pie?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={`flex items-center gap-3 text-sm text-tinta/80 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={activo}
          disabled={disabled}
          onClick={() => onActivo(!activo)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ease-cayla ${activo ? "bg-rojo" : "bg-tinta/25"}`}
        >
          <span aria-hidden className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-crema shadow-sm transition-transform duration-300 ease-cayla ${activo ? "translate-x-4" : "translate-x-0"}`} />
        </button>
        <span>{etiqueta}</span>
      </label>
      {pie && <p className="text-xs text-tinta/55">{pie}</p>}
    </div>
  );
}

export type Opcion<T extends string> = {
  valor: T;
  texto: string;
  /** Título del grupo (el <optgroup> del navegador): las opciones seguidas del mismo grupo se listan bajo ese título —las
   *  cuentas en bancos, cajas fuertes y cajones—. Solo lo dibuja `Desplegable`/`CampoSelect`. */
  grupo?: string;
  /** Se ve pero no se elige (un cajón con la caja cerrada): ni con el mouse ni con el teclado. Solo `Desplegable`/`CampoSelect`. */
  deshabilitada?: boolean;
};

/* ------------------------------------------------------------------
   SelectorMultiple — chips que se prenden y apagan, cero o varios a la
   vez ("qué sedes puede vender esta etiqueta", "qué tallas ofrece esta
   categoría"). Distinto de Segmentado (una sola opción, siempre exactamente
   una elegida) y de CampoSelect (un desplegable, para listas largas donde
   mostrar todo junto no entra). Este control asume la lista completa cabe
   en pantalla sin desplegar — bien para vocabularios de un puñado a unas
   pocas decenas de valores, no para cientos.
   ------------------------------------------------------------------ */
export function SelectorMultiple<T extends string>({
  opciones,
  seleccionadas,
  onCambio,
  disabled = false,
}: {
  opciones: readonly Opcion<T>[];
  seleccionadas: T[];
  onCambio: (valores: T[]) => void;
  /** Ej. mientras el formulario que lo contiene está guardando — evita que
   *  un cambio hecho a mitad de un guardado en vuelo se pierda en silencio. */
  disabled?: boolean;
}) {
  function alternar(valor: T) {
    onCambio(seleccionadas.includes(valor) ? seleccionadas.filter((v) => v !== valor) : [...seleccionadas, valor]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const elegida = seleccionadas.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={elegida}
            disabled={disabled}
            onClick={() => alternar(o.valor)}
            className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
              elegida ? "border-rojo/60 bg-rojo/5 text-rojo" : "border-tinta/15 text-tinta/65 hover:border-tinta/35"
            }`}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

export function Segmentado<T extends string>({
  etiqueta,
  ayuda,
  pie,
  tono,
  valor,
  onValor,
  opciones,
}: {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  pie?: ReactNode;
  tono?: CampoProps["tono"];
  valor: T;
  onValor: (v: T) => void;
  opciones: readonly Opcion<T>[];
}) {
  const idEtiqueta = useId();
  const indice = Math.max(0, opciones.findIndex((o) => o.valor === valor));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Flechas dentro del grupo, como manda el patrón de radiogroup: un
  // radiogroup es UNA parada de tabulador, no una por opción.
  function alTeclado(e: React.KeyboardEvent, i: number) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const siguiente = (i + delta + opciones.length) % opciones.length;
    onValor(opciones[siguiente].valor);
    refs.current[siguiente]?.focus();
  }

  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} pie={pie} tono={tono} idEtiqueta={idEtiqueta}>
      <div role="radiogroup" aria-labelledby={idEtiqueta} className="relative">
        <div className="grid min-h-9" style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
          {opciones.map((o, i) => (
            <button
              key={o.valor}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={o.valor === valor}
              tabIndex={o.valor === valor ? 0 : -1}
              onClick={() => onValor(o.valor)}
              onKeyDown={(e) => alTeclado(e, i)}
              className={`label-cayla flex items-center justify-center rounded-t-md px-3 text-[11px] outline-none transition-all duration-300 focus-visible:bg-rojo/8 ${
                o.valor === valor ? "text-rojo" : "text-tinta/65 hover:text-tinta/80"
              }`}
            >
              {o.texto}
            </button>
          ))}
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px rounded-full bg-tinta/25" />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-full bg-rojo transition-transform duration-300 ease-cayla"
          style={{ width: `${100 / opciones.length}%`, transform: `translateX(${indice * 100}%)` }}
        />
      </div>
    </Campo>
  );
}

/* ------------------------------------------------------------------
   Desplegable — el cuerpo del desplegable propio, sin la caja `Campo`.

   Es un <select> escrito a mano porque el nativo no se puede animar ni
   estilar por dentro (la lista la dibuja el sistema operativo), y en
   Windows eso rompía la identidad justo en el momento de más atención
   de la pantalla. No se usó Radix porque el repo solo tiene
   @radix-ui/react-dialog instalado y sumar una dependencia por un
   desplegable de tres sedes no se paga; a cambio, el teclado está
   completo (flechas, Inicio/Fin, Enter, Escape, tipeo para saltar) y
   los roles ARIA son los del patrón combobox.

   Vive separado de `CampoSelect` desde el 2026-09-09. El motivo: la
   cabecera necesita este control SIN etiqueta ni pie — `Campo` reserva
   alto fijo para el pie y dibuja un <label>, y meter eso arriba le sumaba
   ~30px de alto a la barra superior de TODAS las pantallas. La
   alternativa era un prop `compacto` adentro de `CampoSelect`, que obliga
   a pensar cada cambio futuro dos veces ("¿con etiqueta o sin?").
   Partirlo deja a cada pieza haciendo una cosa:
     Desplegable  = el control
     CampoSelect  = Campo + Desplegable
   Ningún consumidor de `CampoSelect` cambió: su API es idéntica.

   Regla global de combos (2026-09-25, ADR-0209): con más de
   `UMBRAL_BUSCAR_COMBO` (8) opciones aparece un campo para buscar (mismo
   filtro sin tildes/mayúsculas que `ComboBuscable`); si lo filtrado pasa
   de `TAMANO_PAGINA_COMBO` (50), la lista se completa sola al bajar el
   scroll. Con 8 opciones o menos no cambia nada: `mostradas` es
   literalmente `opciones`, el mismo control de siempre. La regla vive en
   lib/combo-reglas.ts (puro, con pruebas); acá solo se usa.

   Desde el 2026-09-26 es el ÚNICO combo del ERP: el <select> del
   navegador ya no existe en la web y `lib/sin-select-nativo.test.ts` lo
   vigila. Para eso aprendió lo que el nativo resolvía solo: grupos
   (`Opcion.grupo`, el <optgroup>), opciones que se ven pero no se eligen
   (`Opcion.deshabilitada`), un `id` y un `ref` para que la pantalla lo
   enfoque al avisar un error, y las dos formas de Finanzas.
   ------------------------------------------------------------------ */

// Formas, no modos: es dónde vive el control, no cómo se porta.
type FormaDesplegable = {
  /** Las clases del disparador. */
  boton: string;
  /** La flecha propia, que gira al abrir. Las de Finanzas usan la de su spike, dibujada por CSS. */
  flecha: boolean;
  /** Se para sobre el hilo vivo. */
  hilo: boolean;
  /** Como el <select> del navegador, que es lo que dibuja el spike de Finanzas: mide lo que su opción MÁS LARGA (no
   *  baila al elegir otra) y su lista puede ser más ancha que el control. */
  comoNativo: boolean;
};

const FORMA_DESPLEGABLE = {
  /** Dentro de un formulario, sobre el hilo vivo. */
  campo: {
    boton: "w-full justify-between rounded-t-md bg-transparent px-0.5 py-2 text-sm text-tinta hover:bg-tinta/[0.03] disabled:hover:bg-transparent",
    flecha: true,
    hilo: true,
    comoNativo: false,
  },
  /** Sola con su borde, en la cabecera (la sede). */
  pastilla: { boton: "gap-2 rounded-md border bg-transparent px-2.5 py-1.5 label-cayla text-[11px] text-tinta hover:border-rojo", flecha: true, hilo: false, comoNativo: false },
  /** Guía oficial (2026-09-22, ADR-0169): la caja hundida en hueso de las barras de filtros, la misma de `CampoTexto caja`.
   *  Hasta el 2026-09-26 salía transparente: un `bg-transparent` de todas las formas le ganaba a `.caja-cayla`. */
  caja: { boton: "caja-cayla h-10 w-full justify-between gap-3 px-3 text-sm text-tinta", flecha: true, hilo: false, comoNativo: false },
  /** Finanzas (ADR-0195): cerrado, el control en caja de su spike (`fin-control`, app/estilos/finanzas.css). */
  fin: { boton: "fin-control fin-desplegable", flecha: false, hilo: false, comoNativo: true },
  /** Finanzas, dentro de un sobretítulo («Lo que ya pasó · SETIEMBRE DE 2026»): sin caja, hereda la letra. El contorno de
   *  foco va acá y no en el CSS: el `outline-none` de todas las formas le ganaría. */
  finEnLinea: {
    boton: "fin-etq-select focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo",
    flecha: false,
    hilo: false,
    comoNativo: true,
  },
} satisfies Record<string, FormaDesplegable>;

export function Desplegable<T extends string>({
  valor,
  onValor,
  opciones,
  marcador = "Elegir",
  forma = "campo",
  // Dónde se ancla la lista. `campo` la clava al ancho del control, que es
  // lo que hace hoy dentro de un formulario. `derecha` la deja crecer con
  // su contenido y la pega al borde derecho: en la cabecera el disparador
  // dice "TRU" y mide 60px, y una lista de 60px no se puede leer.
  alineacion = "campo",
  trabajando = false,
  idEtiqueta,
  etiquetaAccesible,
  deshabilitado = false,
  id: idPropio,
  ref,
  className = "",
}: {
  valor: T;
  onValor: (v: T) => void;
  opciones: readonly Opcion<T>[];
  marcador?: string;
  forma?: keyof typeof FORMA_DESPLEGABLE;
  alineacion?: "campo" | "derecha";
  trabajando?: boolean;
  /** Id de un <label> existente (lo pasa `CampoSelect`). */
  idEtiqueta?: string;
  /** Nombre accesible cuando NO hay label visible (cabecera). */
  etiquetaAccesible?: string;
  /** No se puede abrir todavía (p. ej. el motivo de caja antes de elegir entrada o salida): el marcador dice por qué. */
  deshabilitado?: boolean;
  /** El id del disparador: para un `<label htmlFor>` y para `avisar.error(…, { enfocar: id })`. */
  id?: string;
  /** El disparador, para que la pantalla lo enfoque ella misma (el foco-en-error de Cambios). */
  ref?: Ref<HTMLButtonElement>;
  /** Clases de la caja de afuera: su lugar en la fila (ancho, `inline-block`), nunca su aspecto — eso lo decide `forma`. */
  className?: string;
}) {
  const idGenerado = useId();
  const id = idPropio ?? idGenerado;
  const f = FORMA_DESPLEGABLE[forma];
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  // La caja flotante entera (buscador + lista): vive en un portal, fuera de `contenedor`.
  const capa = useRef<HTMLDivElement>(null);
  const tipeo = useRef({ texto: "", reloj: 0 });
  // React 19: `ref` llega como una prop más; la pantalla recibe el disparador (lo que se enfoca y se clickea).
  useImperativeHandle(ref, () => disparador.current as HTMLButtonElement, []);

  // Regla global de combos (ADR-0209): con 8 opciones o menos, `mostradas` es literalmente `opciones` — cero
  // cambio para los cientos de Desplegable de 2 a 6 opciones que ya funcionaban. El grupo también se busca: «banco»
  // trae todas las cuentas de «Bancos y billeteras».
  const mostrarBuscador = comboNecesitaBuscador(opciones.length);
  const filtradas = useMemo(() => {
    if (!mostrarBuscador || !busqueda) return opciones;
    const k = clave(busqueda);
    return opciones.filter((o) => clave(`${o.texto} ${o.grupo ?? ""}`).includes(k));
  }, [opciones, busqueda, mostrarBuscador]);
  const { visibles, mostrarDesde, reiniciar, alHacerScroll } = useComboLista();
  const mostradas = mostrarBuscador ? filtradas.slice(0, visibles) : opciones;

  // En `campo` la lista va en `fixed` (usePosicionLista): dentro de un <Modal> una lista `absolute` queda recortada por
  // el scroll de la hoja. `derecha` (cabecera) sigue en `absolute`: allí nada la recorta y crece con su contenido.
  const flotante = alineacion === "campo";
  const posLista = usePosicionLista(contenedor, abierto && flotante, 224);
  const destino = useDestinoFlotante(contenedor, abierto && flotante);
  // La lista en `fixed` se pinta recién cuando tiene posición (un render después de abrir).
  const listaVisible = abierto && (!flotante || !!posLista);

  const indiceActual = opciones.findIndex((o) => o.valor === valor);
  const elegida = indiceActual >= 0 ? opciones[indiceActual] : null;

  function abrir() {
    setBusqueda("");
    // Se abre parado en la elegida; sin elegida, en la primera que se puede elegir (no en un cajón cerrado).
    const i = indiceActual >= 0 ? indiceActual : Math.max(0, primeraElegible(opciones));
    setActivo(i);
    mostrarDesde(i);
    setAbierto(true);
  }

  // Al cerrar, el foco vuelve al disparador: si se quedara en la lista
  // que se acaba de desmontar, el teclado quedaría flotando en el body.
  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) disparador.current?.focus();
  }

  function elegir(o: Opcion<T> | undefined) {
    // Una opción bloqueada se ve, pero ni el clic ni Enter la eligen (el <option disabled> del navegador).
    if (!o || o.deshabilitada) return;
    onValor(o.valor);
    cerrar();
  }

  useEffect(() => {
    if (!listaVisible) return;
    // Con buscador, el foco va al campo de texto (para que tipear filtre ya mismo); sin buscador, a la lista
    // (patrón de siempre: las flechas mueven `activo` con la lista enfocada).
    if (mostrarBuscador) buscador.current?.focus();
    else lista.current?.focus();
    const afuera = (e: MouseEvent) => {
      // La lista cuelga de un portal (ADR-0211), FUERA de `contenedor` en el DOM: el «¿tocó afuera?» tiene que
      // mirar las dos cajas. Mirando solo `contenedor`, tocar una opción contaba como «afuera», la lista se cerraba
      // en el mousedown y el click de la opción ya no llegaba: no se podía elegir con mouse ni con el dedo.
      const t = e.target as Node;
      if (contenedor.current?.contains(t) || capa.current?.contains(t)) return;
      setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, [listaVisible, mostrarBuscador]);

  // Al reabrir con una opción elegida más abajo (`mostrarDesde` ya la incluyó en `mostradas`), la lista arranca
  // scrolleada arriba del todo: sin esto quedaba resaltada pero fuera de la vista.
  useEffect(() => {
    if (!listaVisible) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo, listaVisible]);

  function alTeclado(e: React.KeyboardEvent) {
    if (!abierto) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        // Sin esto, el Escape sigue subiendo y el Dialog de Radix cierra el
        // modal entero: cerrar un desplegable no debe tirar abajo el
        // formulario que la persona venía llenando.
        e.stopPropagation();
        cerrar();
        break;
      case "Tab":
        setAbierto(false);
        break;
      // Las flechas, Inicio y Fin saltan las opciones bloqueadas (lib/combo-reglas.ts): nunca aterrizan en una que no se elige.
      case "ArrowDown":
        e.preventDefault();
        setActivo((i) => siguienteElegible(mostradas, i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActivo((i) => siguienteElegible(mostradas, i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActivo(Math.max(0, primeraElegible(mostradas)));
        break;
      case "End":
        e.preventDefault();
        setActivo(Math.max(0, primeraElegible(mostradas, true)));
        break;
      case " ":
        // Con buscador, el espacio es texto de búsqueda ("San Isidro"), no una elección.
        if (mostrarBuscador) break;
        e.preventDefault();
        elegir(mostradas[activo]);
        break;
      case "Enter":
        e.preventDefault();
        elegir(mostradas[activo]);
        break;
      default:
        // Tipear salta a la opción que empieza así (medio segundo de memoria). Con buscador propio, tipear ya
        // filtra por su cuenta — este atajo es solo para el desplegable corto, sin buscador.
        if (mostrarBuscador || e.key.length !== 1) return;
        // La hora de la propia tecla (`timeStamp`), no la del reloj: es la que mide el medio segundo entre dos teclas, y
        // el compilador de React no la confunde con algo que cambie entre dos dibujos.
        if (e.timeStamp - tipeo.current.reloj > 500) tipeo.current.texto = "";
        tipeo.current.reloj = e.timeStamp;
        tipeo.current.texto += e.key.toLowerCase();
        const i = opciones.findIndex((o) => !o.deshabilitada && o.texto.toLowerCase().startsWith(tipeo.current.texto));
        if (i >= 0) setActivo(i);
    }
  }

  const esPastilla = forma === "pastilla";

  /** Una fila de la lista. Bloqueada: se lee apagada, no se resalta ni se elige. */
  const opcion = (o: Opcion<T>, i: number) => (
    <li
      key={o.valor}
      id={`${id}-op-${i}`}
      data-i={i}
      role="option"
      aria-selected={o.valor === valor}
      aria-disabled={o.deshabilitada || undefined}
      onMouseEnter={() => !o.deshabilitada && setActivo(i)}
      onClick={() => elegir(o)}
      // El escalonado corto (30ms por fila) hace que la lista se lea como que se despliega, no
      // como que aparece entera de golpe — pero con buscador la lista puede tener decenas de filas,
      // y esperar 30ms×i dejaría la fila 96 invisible casi 3 segundos: ahí no hay escalonado.
      style={mostrarBuscador ? undefined : { animationDelay: `${i * 30}ms` }}
      className={`relative mx-1.5 flex items-center rounded-md px-2.5 py-2 text-sm transition-colors ${mostrarBuscador ? "" : "anim-revelar"} ${
        o.deshabilitada ? "cursor-not-allowed text-tinta/40" : i === activo ? "cursor-pointer bg-rojo/10 text-tinta" : "cursor-pointer text-tinta/80"
      }`}
    >
      {/* La marca de "esta es la elegida" es el mismo hilo rojo, de canto. */}
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-rojo transition-transform duration-200 ease-cayla ${
          o.valor === valor ? "scale-y-100" : "scale-y-0"
        }`}
      />
      {o.texto}
    </li>
  );

  return (
    <div className={`relative ${className}`} ref={contenedor}>
      <button
        ref={disparador}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-labelledby={idEtiqueta}
        aria-label={idEtiqueta ? undefined : etiquetaAccesible}
        aria-controls={`${id}-lista`}
        disabled={deshabilitado}
        onClick={() => (abierto ? cerrar(false) : abrir())}
        onKeyDown={alTeclado}
        className={`flex items-center text-left outline-none transition-colors disabled:cursor-not-allowed ${f.boton} ${
          esPastilla ? (abierto ? "border-rojo" : "border-sand") : ""
        }`}
      >
        {f.comoNativo ? (
          // Como el <select> del navegador: todas las opciones, invisibles y apiladas en la misma celda, le dan al
          // control el ancho de la más larga —cerrado mide igual que el del spike y no baila al elegir otra—; en una
          // columna angosta, lo elegido se corta con «…» y lo invisible no desborda (`overflow-hidden`).
          <span className="grid min-w-0 overflow-hidden">
            <span className={`col-start-1 row-start-1 truncate ${elegida ? "" : "text-tinta/65"}`}>{elegida?.texto ?? marcador}</span>
            {[marcador, ...opciones.map((o) => o.texto)].map((t, k) => (
              <span key={k} aria-hidden className="invisible col-start-1 row-start-1 h-0 whitespace-nowrap">
                {t}
              </span>
            ))}
          </span>
        ) : (
          <span className={elegida ? "" : "text-tinta/65"}>{elegida?.texto ?? marcador}</span>
        )}
        {f.flecha && (
          <svg
            aria-hidden
            viewBox="0 0 10 6"
            className={`h-1.5 w-2.5 shrink-0 transition-transform duration-300 ease-cayla ${abierto ? "-rotate-180 text-rojo" : "text-tinta/65"}`}
          >
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
          </svg>
        )}
        {/* La pastilla no se para sobre el hilo, así que el "estoy trabajando"
            se dibuja adentro, igual que en `Boton cargando`. Es lo que le dice
            a quien está en el mostrador que el sistema no se colgó. */}
        {esPastilla && trabajando && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-full">
            <span className="block h-full w-1/3 rounded-full bg-rojo [animation:cayla-hilo-barrido_1.1s_linear_infinite]" />
          </span>
        )}
      </button>
      {f.hilo && <Hilo activo={abierto} trabajando={trabajando} />}

      {listaVisible && (
        // `flotante` va en `fixed` medido contra el control (`usePosicionLista`) — y por eso, igual que
        // `MenuAcciones` y `ResumenControles`, en un portal a `document.body`: sin portal, cualquier ancestro con
        // stacking context propio (una tarjeta `@container`, un modal, un futuro `transform`) atrapa el `fixed` y
        // lo pinta DEBAJO de contenido posterior en el DOM aunque su `z-50` diga lo contrario — el bug de
        // «el desplegable se esconde detrás de la fila de abajo» (ADR-0211). `derecha` (cabecera) sigue `absolute`
        // e inline: crece con su contenido y nada lo recorta ahí.
        maybePortal(
          flotante,
          destino,
          <div
            ref={capa}
            style={
              flotante && posLista
                ? {
                    position: "fixed",
                    ...posLista,
                    // Como la del navegador: al menos el ancho del control, y más si una opción lo pide (el mes «setiembre
                    // de 2026 · a la fecha» en un control de 184 px), sin salirse de la ventana.
                    ...(f.comoNativo ? { width: "max-content", minWidth: posLista.width, maxWidth: window.innerWidth - posLista.left - 8 } : {}),
                  }
                : undefined
            }
            className={`anim-revelar z-50 flex flex-col overflow-hidden rounded-lg border border-sand bg-papel shadow-md ${
              flotante ? "" : "absolute right-0 top-full mt-1.5 max-h-56 w-max min-w-full"
            }`}
          >
          {mostrarBuscador && (
            <input
              ref={buscador}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setActivo(0);
                reiniciar();
              }}
              onKeyDown={alTeclado}
              placeholder="Buscar…"
              aria-label={etiquetaAccesible ?? "Buscar"}
              aria-controls={`${id}-lista`}
              aria-activedescendant={mostradas[activo] ? `${id}-op-${activo}` : undefined}
              autoComplete="off"
              className="w-full shrink-0 border-b border-tinta/15 bg-transparent px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45"
            />
          )}
          <ul
            id={`${id}-lista`}
            ref={lista}
            role="listbox"
            aria-labelledby={idEtiqueta}
            aria-label={idEtiqueta ? undefined : etiquetaAccesible}
            tabIndex={mostrarBuscador ? undefined : -1}
            aria-activedescendant={mostrarBuscador ? undefined : `${id}-op-${activo}`}
            onKeyDown={mostrarBuscador ? undefined : alTeclado}
            onScroll={alHacerScroll}
            className="scroll-cayla min-h-0 flex-1 overflow-y-auto py-1.5 outline-none"
          >
            {mostradas.length === 0 ? (
              <li className="px-3 py-3 text-sm text-tinta/65">Nada coincide con «{busqueda.trim()}».</li>
            ) : (
              // Los grupos (lib/combo-reglas.ts): un título y sus opciones en un `role="group"`; sin grupo, las filas sueltas
              // de siempre. El índice de cada fila es el de la lista plana, así las flechas no saben que hay grupos.
              tramosPorGrupo(mostradas).map((t, k) =>
                t.grupo === undefined ? (
                  <Fragment key={`t${k}`}>{t.items.map(({ o, i }) => opcion(o, i))}</Fragment>
                ) : (
                  <li key={`t${k}`} role="presentation">
                    <p id={`${id}-g${k}`} aria-hidden className="label-cayla px-4 pb-1 pt-2.5 text-[10px] text-tinta/55">
                      {t.grupo}
                    </p>
                    <ul role="group" aria-labelledby={`${id}-g${k}`}>
                      {t.items.map(({ o, i }) => opcion(o, i))}
                    </ul>
                  </li>
                )
              )
            )}
          </ul>
          </div>
        )
      )}
    </div>
  );
}

/** Con destino: portal ahí (`document.body`, o la hoja del modal: `useDestinoFlotante`), para `position: fixed`
 *  medido contra un control. `false`: el nodo se queda donde está en el árbol (para `position: absolute`, que sí
 *  debe crecer con su padre). */
function maybePortal(fijo: boolean, destino: HTMLElement | null, nodo: ReactNode) {
  if (!fijo) return nodo;
  return destino ? createPortal(nodo, destino) : null;
}

/* ------------------------------------------------------------------
   CampoSelect — el `Desplegable` dentro de la caja `Campo`, que es como
   lo usa todo formulario. Su API no cambió al partirse en dos.
   ------------------------------------------------------------------ */
export function CampoSelect<T extends string>({
  etiqueta,
  ayuda,
  pie,
  tono,
  valor,
  onValor,
  opciones,
  marcador = "Elegir",
  caja = false,
  id,
  deshabilitado,
}: {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  pie?: ReactNode;
  tono?: CampoProps["tono"];
  valor: T;
  onValor: (v: T) => void;
  opciones: readonly Opcion<T>[];
  marcador?: string;
  /** Guía oficial: caja hundida en hueso y la etiqueta solo para lectores de pantalla (barras de filtros). */
  caja?: boolean;
  /** El id del combo, para `avisar.error(…, { enfocar: id })`. */
  id?: string;
  /** No se puede abrir (p. ej. «Sale de» sin cuentas para ese medio): el marcador dice por qué. */
  deshabilitado?: boolean;
}) {
  const idEtiqueta = useId();
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} pie={pie} tono={tono} idEtiqueta={idEtiqueta} etiquetaOculta={caja}>
      <Desplegable
        valor={valor}
        onValor={onValor}
        opciones={opciones}
        marcador={marcador}
        idEtiqueta={idEtiqueta}
        forma={caja ? "caja" : "campo"}
        id={id}
        deshabilitado={deshabilitado}
      />
    </Campo>
  );
}

/* ------------------------------------------------------------------
   Boton — un solo componente con tres pesos, para que el "qué pasa si
   lo aprieto" se lea por la forma y no haya que confiar en el texto.
   `cargando` no es solo texto: el hilo barre mientras algo está en
   vuelo, que es lo que le dice a quien está en el mostrador que el
   sistema NO se colgó.
   ------------------------------------------------------------------ */
const PESO_BOTON = {
  // Guía oficial (2026-09-22): el hover del primario es rojo PROFUNDO — el rojo de marca no se gasta en un hover.
  primario: "bg-tinta text-crema hover:bg-rojo-profundo disabled:bg-tinta/30",
  fantasma: "border border-tinta/25 text-tinta hover:border-rojo hover:text-rojo disabled:border-tinta/10 disabled:text-tinta/65",
  discreto: "border border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo disabled:border-tinta/10 disabled:text-tinta/65",
} as const;

export function Boton({
  peso = "fantasma",
  cargando = false,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  peso?: keyof typeof PESO_BOTON;
  cargando?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || cargando}
      className={`label-cayla group relative overflow-hidden rounded-md px-4 py-3 text-[11px] outline-none transition-all ease-cayla active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 disabled:cursor-not-allowed disabled:active:scale-100 ${PESO_BOTON[peso]} ${className}`}
    >
      {/* Barrido de luz al pasar el mouse: cruza una vez y no deja nada
          pintado. Es el único gradiente del sistema, y existe solo como
          movimiento — un botón que solo cambia de color de golpe es
          justamente el "seco" que había que sacar.
          En reposo la barra es INVISIBLE (`opacity-0`), no solo "fuera de
          cuadro": está inclinada y una inclinación de 12° mete su esquina
          ~4-5px dentro del botón (mitad del alto × tan 12°), y eso se veía como
          una esquina rosada en el borde inferior izquierdo de todos los botones
          aun sin mouse. La animación la enciende (`cayla-brillo` fija
          `opacity: 1`) y al terminar vuelve a apagarse. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
        <span
          className={`absolute inset-y-0 left-0 w-1/3 -translate-x-full skew-x-12 opacity-0 group-hover:[animation:cayla-brillo_650ms_ease-out] motion-reduce:group-hover:[animation:none] ${
            peso === "primario" ? "bg-crema/20" : "bg-rojo/10"
          }`}
        />
      </span>
      <span className="relative">{children}</span>
      {cargando && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-full">
          <span
            className={`block h-full w-1/3 rounded-full [animation:cayla-hilo-barrido_1.1s_linear_infinite] ${peso === "primario" ? "bg-crema" : "bg-rojo"}`}
          />
        </span>
      )}
    </button>
  );
}
