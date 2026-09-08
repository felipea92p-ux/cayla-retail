"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

/* ====================================================================
   Campos del sistema CAYLA · v3.1 (2026-09-08)

   Por qué existe este archivo: hasta ahora cada modal armaba sus campos
   pegando strings de clases (`campoTexto`, `campoSelect` en ui/Modal.tsx).
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

/** El hilo vivo. Se dibuja desde el centro cuando el campo está activo. */
function Hilo({ activo, trabajando = false }: { activo: boolean; trabajando?: boolean }) {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px rounded-full bg-tinta/25" />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-center rounded-full bg-rojo transition-transform duration-300 ease-cayla ${
          activo ? "scale-x-100" : "scale-x-0"
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
  tono?: "neutro" | "error" | "aviso";
  htmlFor?: string;
  /** Id de la etiqueta, para controles compuestos (desplegable, segmentado)
      que no son un <input> y por lo tanto no se asocian con htmlFor. */
  idEtiqueta?: string;
  children: ReactNode;
};

const TONO_PIE = {
  neutro: "text-tinta/65",
  error: "text-rojo",
  aviso: "text-ambar",
} as const;

export function Campo({ etiqueta, ayuda, pie, tono = "neutro", htmlFor, idEtiqueta, children }: CampoProps) {
  return (
    <div>
      <label id={idEtiqueta} htmlFor={htmlFor} className="label-cayla block text-[11px] text-tinta/65">
        {etiqueta}
        {ayuda}
      </label>
      <div className="mt-1.5">{children}</div>
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
};

export function CampoTexto({ etiqueta, ayuda, pie, tono, mono, trabajando, className = "", ...props }: CampoTextoProps) {
  const id = useId();
  const [enfocado, setEnfocado] = useState(false);
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} pie={pie} tono={tono} htmlFor={id}>
      <div className="relative">
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
          className={`w-full bg-transparent px-0.5 py-2 text-sm text-tinta outline-none placeholder:text-tinta/55 ${
            mono ? "font-mono tabular-nums tracking-wider" : ""
          } ${className}`}
        />
        <Hilo activo={enfocado} trabajando={trabajando} />
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
type Opcion<T extends string> = { valor: T; texto: string };

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
              className={`label-cayla flex items-center justify-center rounded-t-md px-3 text-[11px] outline-none transition-all duration-260 focus-visible:bg-rojo/8 ${
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
   CampoSelect — desplegable propio, no el <select> nativo.
   El nativo no se puede animar ni estilar por dentro (el sistema
   operativo dibuja la lista), así que en Windows rompía la identidad
   justo en el momento de más atención de la pantalla.

   Construido a mano y no con Radix porque el repo solo tiene
   @radix-ui/react-dialog instalado, y sumar una dependencia por un
   desplegable de tres sedes no se paga. A cambio, el teclado está
   implementado completo (flechas, Inicio/Fin, Enter, Escape, tipeo
   para saltar) y los roles ARIA son los del patrón combobox.
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
}: {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  pie?: ReactNode;
  tono?: CampoProps["tono"];
  valor: T;
  onValor: (v: T) => void;
  opciones: readonly Opcion<T>[];
  marcador?: string;
}) {
  const id = useId();
  const idEtiqueta = `${id}-etq`;
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const tipeo = useRef({ texto: "", reloj: 0 });

  const indiceActual = opciones.findIndex((o) => o.valor === valor);
  const elegida = indiceActual >= 0 ? opciones[indiceActual] : null;

  function abrir() {
    setActivo(indiceActual >= 0 ? indiceActual : 0);
    setAbierto(true);
  }

  // Al cerrar, el foco vuelve al disparador: si se quedara en la lista
  // que se acaba de desmontar, el teclado quedaría flotando en el body.
  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) disparador.current?.focus();
  }

  function elegir(i: number) {
    onValor(opciones[i].valor);
    cerrar();
  }

  useEffect(() => {
    if (!abierto) return;
    lista.current?.focus();
    const afuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, [abierto]);

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
      case "ArrowDown":
        e.preventDefault();
        setActivo((i) => (i + 1) % opciones.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActivo((i) => (i - 1 + opciones.length) % opciones.length);
        break;
      case "Home":
        e.preventDefault();
        setActivo(0);
        break;
      case "End":
        e.preventDefault();
        setActivo(opciones.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        elegir(activo);
        break;
      default:
        // Tipear salta a la opción que empieza así (medio segundo de memoria).
        if (e.key.length !== 1) return;
        if (Date.now() - tipeo.current.reloj > 500) tipeo.current.texto = "";
        tipeo.current.reloj = Date.now();
        tipeo.current.texto += e.key.toLowerCase();
        const i = opciones.findIndex((o) => o.texto.toLowerCase().startsWith(tipeo.current.texto));
        if (i >= 0) setActivo(i);
    }
  }

  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} pie={pie} tono={tono} idEtiqueta={idEtiqueta}>
      <div className="relative" ref={contenedor}>
        <button
          ref={disparador}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-labelledby={idEtiqueta}
          aria-controls={`${id}-lista`}
          onClick={() => (abierto ? cerrar(false) : abrir())}
          onKeyDown={alTeclado}
          className="flex w-full items-center justify-between gap-2 rounded-t-md bg-transparent px-0.5 py-2 text-left text-sm outline-none transition-colors hover:bg-tinta/[0.03]"
        >
          <span className={elegida ? "text-tinta" : "text-tinta/65"}>{elegida?.texto ?? marcador}</span>
          <svg
            aria-hidden
            viewBox="0 0 10 6"
            className={`h-1.5 w-2.5 shrink-0 transition-transform duration-300 ease-cayla ${abierto ? "-rotate-180 text-rojo" : "text-tinta/65"}`}
          >
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
          </svg>
        </button>
        <Hilo activo={abierto} />

        {abierto && (
          <ul
            id={`${id}-lista`}
            ref={lista}
            role="listbox"
            aria-labelledby={idEtiqueta}
            tabIndex={-1}
            aria-activedescendant={`${id}-op-${activo}`}
            onKeyDown={alTeclado}
            className="anim-revelar scroll-cayla absolute inset-x-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-sand bg-papel py-1.5 shadow-md outline-none"
          >
            {opciones.map((o, i) => (
              <li
                key={o.valor}
                id={`${id}-op-${i}`}
                role="option"
                aria-selected={o.valor === valor}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(i)}
                className={`relative flex cursor-pointer items-center px-3 py-2 text-sm transition-colors duration-150 ${
                  i === activo ? "bg-rojo/8 text-tinta" : "text-tinta/80"
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
            ))}
          </ul>
        )}
      </div>
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
  primario: "bg-tinta text-crema hover:bg-rojo disabled:bg-tinta/30",
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
          justamente el "seco" que había que sacar. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
        <span
          className={`absolute inset-y-0 left-0 w-1/3 -translate-x-full skew-x-12 group-hover:[animation:cayla-brillo_650ms_ease-out] motion-reduce:group-hover:[animation:none] ${
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
