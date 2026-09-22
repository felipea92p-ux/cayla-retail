import type { ReactNode } from "react";

/* ====================================================================
   InventarioHero (2026-09-22) — extraído de Existencias: Movimientos lo pidió
   con «misma composición, mismo tratamiento de imagen, mismo tipo de
   integración con la página» — así que ahora hay UN solo hero de Inventario,
   no una copia por pantalla. Cada pantalla solo cambia el texto, la foto (por
   pantalla, `fotoHeroPorPantalla`) y su acción propia (Existencias trae «+
   Nuevo traslado»; Movimientos no trae ninguna — `accion` es opcional).

   El tratamiento de foto (antes `ExistenciasHero.tsx`, absorbido acá):
   `background-image` en dos capas (la foto primero, un degradado cálido
   detrás como respaldo — si el archivo llegara a faltar, se ve el
   degradado, nunca un ícono roto). El velo de la izquierda funde el borde
   de la foto con el papel para que el texto respire; el velo superior, más
   leve, suaviza la línea del techo.
   ==================================================================== */

export type PantallaInventario = "existencias" | "movimientos" | "traslados" | "mover" | "conteo" | "analisis";

/** Pedido de Felipe (2026-09-22, v2): la foto ya NO cambia por sede — cambia por PANTALLA de
 *  Inventario, una foto propia por cada una. Solo «Mover» (crear traslado) sigue con la genérica
 *  de respaldo — comparte familia con Traslados y todavía no tiene una propia; nunca un archivo
 *  que no existe. */
const FOTO_POR_PANTALLA: Record<PantallaInventario, string> = {
  existencias: "/inventario-hero-existencias.webp",
  movimientos: "/inventario-hero-movimientos.webp",
  traslados: "/inventario-hero-traslados.webp",
  mover: "/existencias-hero.webp",
  conteo: "/inventario-hero-conteo.webp",
  analisis: "/inventario-hero-analisis.webp",
};

export function fotoHeroPorPantalla(pantalla: PantallaInventario): string {
  return FOTO_POR_PANTALLA[pantalla];
}

/** Los dos looks del hero (2026-09-22). `tarjeta` es el original: tarjeta con borde, fondo `papel`
 *  y esquinas redondeadas, como una `card-cayla` más. `integrado` es el pedido de Felipe, probado
 *  primero en Conteo y desde el 22-09 llevado a las siete pantallas de Inventario: sin caja, fondo
 *  `crema` (el mismo de la página, no uno parecido) y la foto fundiéndose por los cuatro bordes — se
 *  ve como la cabecera de la página, no como una tarjeta más flotando sobre ella. `tarjeta` sigue
 *  siendo el default del componente (nadie lo pide ya, pero no hay razón para borrarlo: es la mitad
 *  del trabajo si alguna pantalla nueva de Inventario quisiera el look anterior). */
type VarianteHero = "tarjeta" | "integrado";

function FotoHero({ foto, variante }: { foto: string; variante: VarianteHero }) {
  const integrado = variante === "integrado";
  return (
    <div
      aria-hidden
      className={`relative h-full w-full overflow-hidden bg-cover ${integrado ? "" : "rounded-xl"}`}
      style={{
        backgroundImage: `url(${foto}), linear-gradient(135deg, var(--color-sand) 0%, var(--color-crema) 55%, var(--color-rojo) 140%)`,
        backgroundPosition: integrado ? "center 16%" : "center 30%",
      }}
    >
      {integrado ? (
        <>
          {/* Cuatro veletas, no una: para que no quede "la foto con un borde difuminado" sino que
              se sienta nacida del fondo. La izquierda es la que más trabaja (de ahí sale el texto);
              abajo y arriba son más discretas; la derecha es casi un matiz, no un límite. Todas
              funden a `crema` — el fondo real de la página en esta variante, no `papel`. */}
          <div className="absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-crema via-crema/65 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-crema/80 via-crema/25 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-crema/45 to-transparent" />
          <div className="absolute inset-y-0 right-0 w-[8%] bg-gradient-to-l from-crema/30 to-transparent" />
        </>
      ) : (
        <>
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-papel via-papel/70 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-papel/35 to-transparent" />
        </>
      )}
    </div>
  );
}

export function InventarioHero({
  eyebrow,
  titulo,
  descripcion,
  auxiliar,
  foto,
  accion,
  variante = "tarjeta",
}: {
  /** «Inventario · Existencias», o el migajero propio de una subventana («‹ Traslados › Tienda
   *  Lima»): por eso acepta nodo, no solo texto — algunas ya traían un enlace o un color. */
  eyebrow: ReactNode;
  titulo: ReactNode;
  /** Se omite si la pantalla no tenía una frase propia (una subventana con solo migajero + título). */
  descripcion?: ReactNode;
  /** Una línea chica opcional bajo la descripción («Cargado a las 15:10»); se omite si no aporta. */
  auxiliar?: ReactNode;
  foto: string;
  /** La acción propia de la pantalla, si tiene una («+ Nuevo traslado», «Seguir contando»). Sin
   *  ella, el hero no reserva espacio de botón — no todas las pantallas necesitan una acá. */
  accion?: ReactNode;
  /** `tarjeta` (default, sin tocar las pantallas que ya lo usan) o `integrado` (Conteo, 2026-09-22):
   *  ver el comentario de `VarianteHero` arriba. */
  variante?: VarianteHero;
}) {
  const integrado = variante === "integrado";
  return (
    <div
      className={`anim-sube relative grid h-auto grid-cols-1 items-stretch overflow-hidden md:grid-cols-[1fr_1.1fr] ${
        integrado ? "bg-crema md:h-[156px]" : "card-cayla md:h-56"
      }`}
    >
      <div className={`flex min-w-0 flex-col justify-center gap-1 px-5 sm:px-6 ${integrado ? "py-5" : "py-4"}`}>
        <p className="label-cayla text-[11px] text-tinta/65">{eyebrow}</p>
        <h1 className="font-display text-[1.7rem] leading-none text-tinta">{titulo}</h1>
        {descripcion && <p className="max-w-sm text-[13px] leading-snug text-tinta/65">{descripcion}</p>}
        {auxiliar}
      </div>
      {/* «Tarjeta» es más alta a propósito (2026-09-22): con menos alto, `bg-cover` recorta demasiado
          y solo deja ver una franja fina de la foto. «Integrado» acepta ese recorte mayor a cambio de
          los 156px que pidió Felipe — por eso su fade es más generoso (arriba), no solo un ajuste de
          altura. */}
      <div className={`relative hidden md:block ${integrado ? "min-h-[156px]" : "min-h-[14rem]"}`}>
        <FotoHero foto={foto} variante={variante} />
        {/* Abajo, no al centro (2026-09-22): centrado tapaba justo la parte de la foto con más
            contenido — acá queda apoyado en el borde inferior, sin competir con ella. */}
        {accion && <div className="absolute inset-0 flex items-end justify-end p-5">{accion}</div>}
      </div>
      {accion && <div className="flex items-center px-5 pb-4 md:hidden">{accion}</div>}
    </div>
  );
}
