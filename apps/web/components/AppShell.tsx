"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { Boton, Hilo } from "@/components/ui/campos";
import { UbicacionSwitcher } from "@/components/UbicacionSwitcher";

// Navegación v3 (aprobada 2026-07-18, investigada de QuickBooks + POS retail):
// escritorio = lateral con "+ Nuevo" global; celular = 4 pestañas + botón + central.
// "Inventario" es el mundo único del stock físico (catálogo, recibir, almacén).
//
// v3.2 (2026-09-09, ADR-0014): el lateral era el último rincón de la app que
// seguía en la gramática de julio — bloque `bg-sand` plano para marcar dónde
// estás, sin nada del "hilo vivo" que desde ADR-0011 rige todos los campos.
// Ahora el marcador es UN solo riel rojo que se DESLIZA de una fila a otra:
// la misma pieza del `Segmentado` (que ya se desliza en horizontal) puesta de
// canto. Estructura, ancho y respiro cambiaron; ninguna ruta lo hizo.

// V2 (Fase UI 1, 2026-09-11): `ubicaciones.nombre` ya es legible por sí solo
// ("Tienda Lima") — a diferencia de V1, donde el código dejó de servir tras
// la unificación con Dynamic y hacía falta `sedeEtiqueta` aparte. Por eso acá
// no hay campo "código": no existe en `retail.ubicaciones` (V2) y no hace
// falta traducir nada.
type Persona = {
  nombre: string;
  rol: "lider" | "integrante";
  ubicacionId: string;
  ubicacionEtiqueta: string;
  puedeCambiarUbicacion: boolean;
};

type Props = {
  persona: Persona;
  /** Solo se usa si `persona.puedeCambiarUbicacion` — un integrante nunca ve
   *  el selector, así que no hace falta traerle la lista completa. */
  ubicaciones: { id: string; nombre: string }[];
  children: React.ReactNode;
};

// Íconos de línea (brandbook: "íconos rellenos ×, solo línea") — trazo 1.5
function Icono({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d={d} />
    </svg>
  );
}
const IC = {
  inicio: "M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5",
  vender: "M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2m7 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z",
  caja: "M12 3v18m4-15H10a2.5 2.5 0 000 5h4a2.5 2.5 0 010 5H8",
  productos: "M20.5 7.3L12 12m0 0L3.5 7.3M12 12v9m8.5-13.7v9.4a1 1 0 01-.5.87l-7.5 4.3a1 1 0 01-1 0l-7.5-4.3a1 1 0 01-.5-.87V7.3a1 1 0 01.5-.87l7.5-4.3a1 1 0 011 0l7.5 4.3a1 1 0 01.5.87z",
  inventario: "M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4L4 7m8 4l8-4m-8 4v10",
  movimientos: "M3 7h13m0 0l-4-4m4 4l-4 4M21 17H8m0 0l4 4m-4-4l4-4",
  facturacion: "M9 12h6m-6 4h6M9 8h1m3.5-5H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8.5L13.5 3z",
  compras: "M3 4h2l2.2 11.2a1 1 0 001 .8h9.6a1 1 0 001-.8L20 8H6.5M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2zM12 8v4m-2-2h4",
  colaboradores: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  buscar: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35",
  nuevo: "M12 5v14m-7-7h14",
};

/* ------------------------------------------------------------------
   Geometría del riel. El indicador y las filas leen los MISMOS dos
   números, así que el riel no se puede desalinear de la fila que
   marca — que es exactamente lo que pasa cuando el alto de la fila
   vive en una clase de Tailwind y el desplazamiento en un `style`.
   ------------------------------------------------------------------ */
const ALTO_FILA = 48; // px
const AIRE_FILA = 8; // px entre filas
const PASO_FILA = ALTO_FILA + AIRE_FILA;
const ALTO_RIEL = 20; // px — la misma marca de canto del listbox de campos.tsx

type Item = { href: string; etiqueta: string; icono: string };

function BuscadorGlobal({ compacto = false }: { compacto?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [enfocado, setEnfocado] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) {
          router.push(`/buscar?q=${encodeURIComponent(term)}`);
          setQ("");
        }
      }}
      className={compacto ? "w-full" : "w-full max-w-md"}
    >
      {/* Mismo hilo vivo que los campos del sistema (ADR-0011): el buscador
          tenía su propio `focus-within:border-rojo`, que hacía lo mismo pero
          apareciendo de golpe en vez de dibujarse. */}
      <div className="relative flex items-center gap-2.5 px-1 py-2">
        <Icono d={IC.buscar} className={`h-[18px] w-[18px] shrink-0 transition-colors ${enfocado ? "text-rojo" : "text-tinta/65"}`} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          placeholder="Buscar o escanear prenda…"
          aria-label="Buscar o escanear prenda"
          className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/55"
        />
        <Hilo activo={enfocado} />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------
   Una sección del lateral. Cada grupo lleva su propio riel: con un
   riel único para toda la columna habría que medir el alto real de
   los títulos de grupo en el DOM, y una medición que se hace tarde es
   un riel que salta al cargar la página.
   ------------------------------------------------------------------ */
function GrupoLateral({ titulo, items, indiceActivo }: { titulo: string | null; items: Item[]; indiceActivo: number }) {
  return (
    <div>
      {/* Con un solo grupo el título sobra: sería una etiqueta para TODO el
          menú, que es justo el ruido que se estaba sacando. Una Encargada ve
          las tres filas sin encabezado; el Líder ve los dos nombres. */}
      {titulo && <p className="label-cayla px-4 pb-3 text-[11px] text-tinta/65">{titulo}</p>}
      <div className="relative flex flex-col" style={{ gap: AIRE_FILA }}>
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 w-[2px] rounded-full bg-rojo transition-[transform,opacity] duration-300 ease-cayla"
          style={{
            height: ALTO_RIEL,
            top: (ALTO_FILA - ALTO_RIEL) / 2,
            transform: `translateY(${Math.max(indiceActivo, 0) * PASO_FILA}px)`,
            opacity: indiceActivo >= 0 ? 1 : 0,
          }}
        />
        {items.map((i, n) => {
          const esActivo = n === indiceActivo;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={esActivo ? "page" : undefined}
              style={{ height: ALTO_FILA }}
              className={`group relative flex items-center gap-3.5 rounded-lg pl-4 pr-3 text-sm transition-colors ${
                esActivo ? "bg-sand/70 font-medium text-tinta" : "text-tinta/80 hover:bg-sand/40 hover:text-rojo"
              }`}
            >
              {/* Marca fantasma: al pasar el mouse por una fila apagada aparece
                  el riel en gris, en el mismo sitio exacto donde va a quedar el
                  rojo si sueltas el clic. Se lee "estás acá / irías allá" — es
                  el riel mostrando su próximo destino, no un efecto aparte. */}
              {!esActivo && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-1/2 w-[2px] -translate-y-1/2 scale-y-0 rounded-full bg-tinta/30 transition-transform duration-200 ease-cayla group-hover:scale-y-100"
                  style={{ height: ALTO_RIEL }}
                />
              )}
              <Icono
                d={i.icono}
                className={`h-5 w-5 shrink-0 transition-[transform,color] duration-300 ease-cayla ${
                  esActivo ? "text-tinta" : "text-tinta/60 group-hover:translate-x-0.5 group-hover:text-rojo"
                }`}
              />
              {i.etiqueta}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   MenuNuevo — el panel del botón "+ Nuevo".

   NO es un `Modal` de Radix a propósito, y no por ahorrar: atrapar el
   foco es el patrón de un DIÁLOGO. Un menú hace lo contrario — el
   tabulador lo CIERRA y sigue de largo. Migrarlo a `Modal` le pondría
   el comportamiento de otra cosa.

   Lo que sí seguía faltando (BACKLOG desde ADR-0003) era el teclado del
   patrón menu button: flechas entre opciones, Inicio/Fin, Espacio para
   activar, tipeo para saltar, y sobre todo que Tab no recorriera el
   panel para terminar dentro de la app que está detrás del velo —
   visualmente bloqueada, pero perfectamente tabulable.

   El teclado es el mismo de `CampoSelect` (campos.tsx), lo que también
   quiere decir que se comporta igual: se levantó de ahí, no se inventó.
   Una diferencia con el patrón de la W3C, asumida: ahí Tab cierra y
   mueve al SIGUIENTE elemento de la página; acá cierra y devuelve el
   foco al botón que abrió. Cuesta un Tab más y evita tener que
   arrastrar un buscador de "próximo elemento tabulable" para un menú
   de cinco opciones. Nunca deja el foco flotando, que era el problema.
   ------------------------------------------------------------------ */
// Fase UI 1 (2026-09-11) + Prioridad 1 (2026-09-12): recortado a las
// escrituras que V2 ya tiene resueltas de punta a punta (RPC + pantalla).
// "Nuevo producto" y "Registrar gasto" vuelven cuando su propia pantalla se
// adapte (Fase 2/3/4) — ofrecerlas antes sería un enlace que compila y
// revienta contra un esquema que ya no existe. "Nueva venta" exige caja
// abierta — si no hay, /vender lo explica y manda a /caja, no es un enlace roto.
function MenuNuevo({ onClose }: { onClose: () => void }) {
  const acciones = [
    { href: "/vender", etiqueta: "Nueva venta", detalle: "Registrar la compra de una clienta" },
    { href: "/compras/nueva", etiqueta: "Registrar factura", detalle: "Una compra a proveedor, con su pago si es al contado" },
    { href: "/compras/recibir", etiqueta: "Recibir mercadería", detalle: "Lo que llegó de una o varias facturas" },
    { href: "/inventario/mover", etiqueta: "Mover mercadería", detalle: "Trasladar stock entre ubicaciones" },
  ];

  const [activo, setActivo] = useState(0);
  const filas = useRef<(HTMLAnchorElement | null)[]>([]);
  const tipeo = useRef({ texto: "", reloj: 0 });

  // El foco entra al panel al abrirse: se monta al final del árbol, así que
  // sin esto el tabulador recorría toda la app antes de llegar a las opciones.
  useEffect(() => {
    filas.current[0]?.focus();
  }, []);

  // Escape queda en `document` y no en el panel: si alguien hizo clic en el
  // velo, el foco puede haber salido de las filas, y Escape tiene que cerrar
  // igual. Es la única tecla que no depende de dónde esté parado el foco.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  function irA(i: number) {
    const n = (i + acciones.length) % acciones.length;
    setActivo(n);
    filas.current[n]?.focus();
  }

  function alTeclado(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Tab":
        // Cierra en vez de dejar pasar: sin esto el tabulador sale del panel
        // y sigue por la app de atrás, que está tapada por el velo pero
        // entera tabulable.
        e.preventDefault();
        onClose();
        break;
      case "ArrowDown":
        e.preventDefault();
        irA(activo + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        irA(activo - 1);
        break;
      case "Home":
        e.preventDefault();
        irA(0);
        break;
      case "End":
        e.preventDefault();
        irA(acciones.length - 1);
        break;
      case " ":
        // Enter ya navega solo (es un <a>); Espacio no activa un enlace.
        e.preventDefault();
        filas.current[activo]?.click();
        break;
      default: {
        if (e.key.length !== 1) return;
        if (Date.now() - tipeo.current.reloj > 500) tipeo.current.texto = "";
        tipeo.current.reloj = Date.now();
        tipeo.current.texto += e.key.toLowerCase();
        const i = acciones.findIndex((a) => a.etiqueta.toLowerCase().startsWith(tipeo.current.texto));
        if (i >= 0) irA(i);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="anim-velo absolute inset-0 bg-tinta/25 backdrop-blur-[2px]" />
      <div
        role="menu"
        aria-label="Nuevo"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={alTeclado}
        className="anim-entrada card-cayla absolute inset-x-4 bottom-24 p-2 shadow-lg sm:inset-x-auto sm:bottom-auto sm:left-lateral sm:top-24 sm:ml-4 sm:w-[21rem]"
      >
        {/* `role="menu"` solo admite hijos de menú, así que el encabezado sale
            del árbol de accesibilidad: el nombre del panel ya lo da aria-label. */}
        <p aria-hidden className="label-cayla px-3.5 pb-1.5 pt-2.5 text-[11px] text-tinta/65">Nuevo</p>
        {acciones.map((a, i) => (
          <Link
            key={a.href}
            href={a.href}
            role="menuitem"
            // Un menú es UNA parada de tabulador, no una por opción — y acá
            // además Tab lo cierra, así que ninguna fila entra en la secuencia.
            tabIndex={-1}
            ref={(el) => {
              filas.current[i] = el;
            }}
            onClick={onClose}
            // El mouse manda sobre el mismo índice que las flechas, igual que en
            // el desplegable de campos.tsx: así nunca hay dos filas encendidas.
            onMouseEnter={() => setActivo(i)}
            // Escalonado de 30ms por fila, el mismo del desplegable de campos.tsx:
            // la lista se lee como que se despliega, no como que aparece entera.
            style={{ animationDelay: `${i * 30}ms` }}
            className={`anim-revelar relative block rounded-lg px-3.5 py-3 outline-none transition-colors ${
              i === activo ? "bg-sand/60" : ""
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-rojo transition-transform duration-200 ease-cayla ${
                i === activo ? "scale-y-100" : "scale-y-0"
              }`}
            />
            <p className="text-sm font-medium text-tinta">{a.etiqueta}</p>
            <p className="mt-0.5 text-xs text-tinta/65">{a.detalle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Rutas (y todo lo que cuelga de ellas) que usan el ancho completo del <main>.
const SIN_TOPE_DE_ANCHO = ["/vender", "/compras"];

export function AppShell({ persona, ubicaciones, children }: Props) {
  const pathname = usePathname();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const disparadorNuevo = useRef<HTMLButtonElement | null>(null);
  const esLider = persona.rol === "lider";

  const abrirNuevo = (e: React.MouseEvent<HTMLButtonElement>) => {
    disparadorNuevo.current = e.currentTarget;
    setNuevoAbierto(true);
  };
  // Al cerrar, el foco vuelve al botón que abrió: si se quedara en el panel
  // que se acaba de desmontar, el teclado quedaría flotando en el body.
  const cerrarNuevo = useCallback(() => {
    setNuevoAbierto(false);
    disparadorNuevo.current?.focus();
  }, []);

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const inicio: Item = { href: "/", etiqueta: "Inicio", icono: IC.inicio };
  const vender: Item = { href: "/vender", etiqueta: "Vender", icono: IC.vender };
  const caja: Item = { href: "/caja", etiqueta: "Caja", icono: IC.caja };
  const productos: Item = { href: "/productos", etiqueta: "Productos", icono: IC.productos };
  const inventario: Item = { href: "/inventario", etiqueta: "Inventario", icono: IC.inventario };
  const movimientos: Item = { href: "/movimientos", etiqueta: "Movimientos", icono: IC.movimientos };
  const facturacion: Item = { href: "/vender/facturacion", etiqueta: "Facturación", icono: IC.facturacion };
  const compras: Item = { href: "/compras", etiqueta: "Compras", icono: IC.compras };
  const colaboradores: Item = { href: "/colaboradores", etiqueta: "Colaboradores", icono: IC.colaboradores };

  // Integración con Dynamic (2026-09-12): "Colaboradores" salió del nav
  // porque Dynamic es dueño de la IDENTIDAD (alta, rol, sede, activar/
  // desactivar) — eso sigue igual, retail no la administra ni la duplica.
  // Vuelve el 2026-09-13 con un significado distinto y propio de retail:
  // no "quién es esta persona" sino "a quién de Dynamic le doy entrada a
  // retail" (0013_colaboradores_autorizados.sql — "control total temporal"
  // de 0012 abrió la puerta a cualquiera; esto la vuelve a cerrar a una
  // lista elegida). Comercial y Finanzas siguen sin pantalla V2, siguen
  // fuera por esa otra razón. "Facturación" (0010_facturacion.sql) —
  // líder-only, emite documentos legales ante SUNAT.
  const grupos = [
    {
      titulo: null,
      // Compras (ADR-0035) va después de Inventario: es de donde entra la
      // mercadería. Líder-only como Facturación y Colaboradores — registra
      // facturas y pagos.
      items: [
        inicio,
        vender,
        caja,
        productos,
        inventario,
        ...(esLider ? [compras] : []),
        movimientos,
        ...(esLider ? [facturacion, colaboradores] : []),
      ],
    },
  ].filter((g) => g.items.length > 0);

  // Celular: 5 columnas fijas con el "+" al centro. Vender y Caja son las
  // de uso diario en el mostrador; Productos/Movimientos/Colaboradores
  // quedan a un toque del lateral (no entran en 5 columnas fijas).
  const columnas: (Item | null)[] = [inicio, vender, null, inventario, caja];
  const indiceMovil = columnas.findIndex((c) => c !== null && activo(c.href));

  const iniciales =
    persona.nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join("")
      .toUpperCase() || "·";

  return (
    <div className="min-h-screen bg-crema">
      {/* ==================== Lateral (escritorio) ==================== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-lateral flex-col border-r border-tinta/10 bg-crema sm:flex">
        <Link href="/" className="group flex items-center gap-3 px-7 pb-6 pt-7">
          <Image
            src="/cayla-isotipo.png"
            alt="CAYLA"
            width={32}
            height={32}
            priority
            className="h-8 w-auto transition-transform duration-500 ease-cayla group-hover:scale-105"
          />
          <span className="label-cayla text-sm text-tinta transition-colors group-hover:text-rojo" style={{ letterSpacing: "0.26em" }}>
            CAYLA
          </span>
        </Link>

        <div className="px-3 pb-7">
          <Boton peso="primario" onClick={abrirNuevo} className="w-full" aria-haspopup="menu" aria-expanded={nuevoAbierto}>
            <span className="flex items-center justify-center gap-2">
              <Icono d={IC.nuevo} className="h-3.5 w-3.5" /> Nuevo
            </span>
          </Boton>
        </div>

        <nav className="scroll-cayla flex-1 space-y-7 overflow-y-auto px-3">
          {grupos.map((g) => (
            <GrupoLateral
              key={g.titulo}
              titulo={grupos.length > 1 ? g.titulo : null}
              items={g.items}
              indiceActivo={g.items.findIndex((i) => activo(i.href))}
            />
          ))}
        </nav>

        {/* El lateral terminaba en un vacío de media pantalla. La firma de la
            marca le da un piso al bloque de abajo, en vez de dejar el aire
            colgando entre el último ítem y la persona. */}
        <p className="font-display px-7 pb-5 pt-6 text-xs italic text-taupe-profundo">Donde el estilo transforma.</p>

        <div className="border-t border-tinta/10 px-7 py-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-sm text-tinta"
            >
              {iniciales}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-tinta">{persona.nombre}</p>
              <p className="label-cayla mt-0.5 truncate text-[11px] text-tinta/65">
                {esLider ? "Líder" : "Integrante"} · {persona.ubicacionEtiqueta}
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* ==================== Cabecera ==================== */}
      {/* Translúcida + desenfoque: el contenido pasa POR DEBAJO al hacer scroll.
          No es decoración, es la única forma de que se note que hay más página
          arriba en vez de que el texto se corte contra una banda opaca. */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-tinta/10 bg-crema/85 backdrop-blur-md sm:left-lateral">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-8 sm:py-3">
          <Link href="/" className="flex items-center gap-2 sm:hidden">
            <Image src="/cayla-isotipo.png" alt="CAYLA" width={26} height={26} priority className="h-[26px] w-auto" />
          </Link>
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <BuscadorGlobal compacto />
          </div>
          {/* Selector de ubicación del líder (Fase 2, ya no pendiente):
              cambia toda la app de perspectiva, no solo Inventario/Recepción
              (que ya tenían el suyo propio, local a esa pantalla). Un
              integrante sigue viendo solo la etiqueta, sin poder tocarla. */}
          <div className="ml-auto shrink-0">
            {persona.puedeCambiarUbicacion ? (
              <UbicacionSwitcher ubicaciones={ubicaciones} ubicacionActualId={persona.ubicacionId} />
            ) : (
              <span className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</span>
            )}
          </div>
        </div>
      </header>

      {/* ==================== Contenido ==================== */}
      {/* Vender y Compras van sin el tope de max-w-5xl: el catálogo + ticket
          necesita todo el ancho (pedido de Felipe, 2026-09-12), y las tablas
          de Compras —seis columnas con documento, proveedor, estados y
          cifras— se apretaban en la columna de lectura (pedido de Felipe,
          2026-09-14). El resto de la app sigue centrado en la columna
          angosta de siempre. */}
      <main className="px-4 pb-28 pt-20 sm:ml-lateral sm:px-10 sm:pb-12 sm:pt-24">
        <div className={SIN_TOPE_DE_ANCHO.some((r) => pathname === r || pathname.startsWith(`${r}/`)) ? "" : "mx-auto max-w-5xl"}>{children}</div>
      </main>

      {/* ==================== Pestañas (celular) ==================== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-tinta/10 bg-crema/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="relative grid grid-cols-5">
          {/* El mismo riel del lateral, acostado: una sola marca que se desliza
              entre pestañas en vez de cinco que se prenden y se apagan. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-[2px] w-1/5 rounded-full bg-rojo transition-[transform,opacity] duration-300 ease-cayla"
            style={{ transform: `translateX(${Math.max(indiceMovil, 0) * 100}%)`, opacity: indiceMovil >= 0 ? 1 : 0 }}
          />
          {columnas.map((c, n) =>
            c === null ? (
              // Botón + central — el "+ Nuevo" de QuickBooks, siempre a un toque
              <button
                key="nuevo"
                onClick={abrirNuevo}
                aria-label="Nuevo"
                aria-haspopup="menu"
                aria-expanded={nuevoAbierto}
                className="flex flex-col items-center justify-center py-2"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tinta text-crema shadow-md transition-transform duration-200 ease-cayla active:scale-95">
                  <Icono d={IC.nuevo} className="h-5 w-5" />
                </span>
              </button>
            ) : (
              <Link
                key={c.href}
                href={c.href}
                aria-current={n === indiceMovil ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-3 transition-colors ${n === indiceMovil ? "text-rojo" : "text-tinta/70"}`}
              >
                <Icono d={c.icono} className="h-[22px] w-[22px]" />
                <span className="text-[11px]">{c.etiqueta}</span>
              </Link>
            ),
          )}
        </div>
      </nav>

      {nuevoAbierto && <MenuNuevo onClose={cerrarNuevo} />}
    </div>
  );
}
