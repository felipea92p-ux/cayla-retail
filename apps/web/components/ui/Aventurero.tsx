import { useId } from "react";
import { Anton } from "next/font/google";

// Aventurero (Felipe, 2026-10-15): el gato naranja con las patas en el teclado, como meme, en las pantallas donde la persona NO
// llega a lo que buscaba: «Sin acceso» (su rol no ve el módulo, o no ve ninguno) y las barreras de error. No reemplaza lo que esas
// pantallas dicen —qué pasó, qué hacer, a quién pedírselo, el código del error—: lo acompaña, para que toparse con una puerta
// cerrada no se sienta como un regaño del sistema.
//
// Es una foto (`public/aventurero.webp`, recortada para que el texto quepa arriba y abajo sin tapar al gato) dentro de un SVG del
// mismo tamaño: así las coordenadas de las patas y el texto son píxeles de la foto y todo escala junto, del celular al escritorio.
//
// LAS PATAS. Cada una es la misma foto otra vez, recortada por una elipse difusa que NO se mueve (la máscara) y girada unos grados
// desde su codo: dentro de la elipse la pata se levanta y deja ver el teclado; fuera, la foto sigue quieta. El giro es CSS
// (`app/estilos/aventurero.css`), con un ritmo distinto según lo que diga el meme: tecleo apurado en un error («lo está dando
// todo»), dos toques y un Enter decidido en «Sin acceso». Es una excepción a la regla de movimiento (ADR-0136, act. 2026-10-15):
// bucle pedido por Felipe, sin rebote, y quieto con `prefers-reduced-motion`.
//
// NO usa clases de Tailwind ni el `<Modal>`: también la dibuja `global-error.tsx`, que se pinta sin globals.css (el layout raíz
// reventó). Por eso trae su propia hoja (que `global-error` importa) y sus colores son los dos FIJOS (`tinta-fija`, `crema-fija`):
// el texto va sobre una foto, que no cambia con el tema, así que el blanco con borde negro del meme tampoco.

const FOTO = "/aventurero.webp";
const ANCHO = 960;
const ALTO = 560;

// La letra de los memes es Impact. La traen Mac y Windows, pero no el iPhone, el iPad ni Android: ahí entra Anton, su pariente libre
// (servida por Next desde el propio dominio). `preload: false` porque esta pieza se ve rara vez: que no se descargue en cada pantalla.
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap", preload: false });

/** Lo que dice el meme. Cada renglón con su tamaño: el de arriba del error es largo y se achica para caber en los 960 de la foto. */
const FRASES = {
  "sin-acceso": { arriba: { texto: "Aventurero decidió", tamano: 72 }, abajo: { texto: "que no puedes ver esto", tamano: 72 } },
  error: { arriba: { texto: "Aventurero lo está dando todo", tamano: 62 }, abajo: { texto: "para solucionarlo", tamano: 72 } },
} as const;

type MotivoAventurero = keyof typeof FRASES;

/** La frase completa, como se lee (para el lector de pantalla y para quien la cite). */
function fraseDeAventurero(motivo: MotivoAventurero): string {
  const { arriba, abajo } = FRASES[motivo];
  return `${arriba.texto} ${abajo.texto}`;
}

/** Cada pata: la elipse difusa que la recorta (cx, cy, radios y su inclinación, la del antebrazo) y el codo desde donde gira.
 *  En píxeles de la foto. La de adelante va DESPUÉS: es la que está más cerca de la cámara y tapa a la otra. */
const PATAS = [
  { clave: "atras", cx: 272, cy: 373, rx: 66, ry: 22, inclinacion: 5, codo: "190px 368px" },
  { clave: "adelante", cx: 292, cy: 407, rx: 62, ry: 26, inclinacion: 4, codo: "130px 405px" },
] as const;

/** Margen del texto al borde de la foto, como en un meme. */
const MARGEN = 20;

export function Aventurero({ motivo, className }: { motivo: MotivoAventurero; className?: string }) {
  // Los `id` de las máscaras tienen que ser únicos en el documento: dos Aventureros en la misma página no se pisan.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { arriba, abajo } = FRASES[motivo];

  return (
    <figure className={`aventurero ${anton.variable}${className ? ` ${className}` : ""}`} data-motivo={motivo}>
      <svg
        className="aventurero-lienzo"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label={`Un gato naranja con las patas sobre el teclado: «${fraseDeAventurero(motivo)}».`}
      >
        <defs>
          <filter id={`${id}-difuso`} x="-25%" y="-60%" width="150%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          {PATAS.map((p) => (
            <mask key={p.clave} id={`${id}-${p.clave}`} maskUnits="userSpaceOnUse" x="0" y="0" width={ANCHO} height={ALTO}>
              {/* El blanco de una máscara no es un color que se vea: dice «aquí sí se muestra» (luminancia). */}
              <ellipse
                cx={p.cx}
                cy={p.cy}
                rx={p.rx}
                ry={p.ry}
                transform={`rotate(${p.inclinacion} ${p.cx} ${p.cy})`}
                fill="white"
                filter={`url(#${id}-difuso)`}
              />
            </mask>
          ))}
        </defs>

        <image href={FOTO} width={ANCHO} height={ALTO} />
        {PATAS.map((p) => (
          <g key={p.clave} mask={`url(#${id}-${p.clave})`}>
            <image
              className={`aventurero-pata aventurero-pata-${p.clave}`}
              style={{ transformOrigin: p.codo }}
              href={FOTO}
              width={ANCHO}
              height={ALTO}
            />
          </g>
        ))}

        <text className="aventurero-meme" x={ANCHO / 2} y={MARGEN} dominantBaseline="hanging" fontSize={arriba.tamano}>
          {arriba.texto.toLocaleUpperCase("es")}
        </text>
        <text className="aventurero-meme" x={ANCHO / 2} y={ALTO - MARGEN} fontSize={abajo.tamano}>
          {abajo.texto.toLocaleUpperCase("es")}
        </text>
      </svg>
    </figure>
  );
}
