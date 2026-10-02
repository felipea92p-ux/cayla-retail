import Image from "next/image";
import type { ReactElement } from "react";
import { familiaDeTejido, type FamiliaTejido } from "@/lib/tejido-visual";

/**
 * La "muestra" de un tejido en Atributos → Tejidos: la textura de la tela
 * dibujada de cerca (sarga del denim, canalé de la pana, panal del piqué…)
 * para reconocerla de un vistazo en vez de leer 17 nombres. Es el equivalente
 * de `MuestraPatron` para patrones. Desde el ADR-0256 un Líder puede subir la
 * foto real (`imagenUrl`); el dibujo queda de respaldo para lo que no la tiene.
 *
 * Los tonos son los de la tela real (el denim es azul índigo, la pana marrón),
 * no los de la marca: aquí el color ES la información. Lo que sí se respeta
 * del brandbook v3.0: nada de rojo (acento sagrado, máx. 2 usos por pantalla),
 * sin gradientes ni sombras. Los fondos son translúcidos-planos; el "brillo"
 * de la seda o el poliéster son bandas planas, no degradados.
 *
 * Todo es determinista (el "azar" de la alpaca y el lino sale de una semilla
 * fija): el servidor y el navegador dibujan lo mismo, sin parpadeo.
 */

const ANCHO = 120;
const ALTO = 40;

function rango(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// Generador pseudoaleatorio con semilla — mismo resultado en cada render.
function semillaAzar(semilla: number): () => number {
  let s = semilla;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const f = (n: number) => n.toFixed(1);

type Dibujo = { fondo: string; formas: ReactElement };

const DIBUJOS: Record<FamiliaTejido, () => Dibujo> = {
  // Tafetán a la vista: hilos de urdimbre y trama cruzados; donde se cruzan se
  // oscurece solo (translúcidos), que es como se ve el algodón de cerca.
  algodon: () => ({
    fondo: "#F1EADB",
    formas: (
      <>
        {rango(30).map((i) => (
          <rect key={`v${i}`} x={i * 4} y={0} width={1.8} height={ALTO} fill="#1A1A18" opacity={0.12} />
        ))}
        {rango(10).map((i) => (
          <rect key={`h${i}`} x={0} y={i * 4} width={ANCHO} height={1.8} fill="#1A1A18" opacity={0.12} />
        ))}
      </>
    ),
  }),

  // Mismo tafetán pero con hilo más largo y fino (la razón de ser del pima):
  // trama mucho más densa, más clara, con una banda de brillo.
  pima: () => ({
    fondo: "#F7F1E5",
    formas: (
      <>
        {rango(60).map((i) => (
          <rect key={`v${i}`} x={i * 2} y={0} width={0.8} height={ALTO} fill="#1A1A18" opacity={0.09} />
        ))}
        {rango(20).map((i) => (
          <rect key={`h${i}`} x={0} y={i * 2} width={ANCHO} height={0.8} fill="#1A1A18" opacity={0.09} />
        ))}
        <polygon points="34,0 58,0 40,40 16,40" fill="#FFFFFF" opacity={0.45} />
      </>
    ),
  }),

  // Fibra larga y esponjosa: cientos de hebras cortas curvas, claras y
  // oscuras, en todas las direcciones.
  alpaca: () => {
    const azar = semillaAzar(11);
    return {
      fondo: "#CDB48C",
      formas: (
        <>
          {rango(300).map((i) => {
            const x = azar() * ANCHO;
            const y = azar() * ALTO;
            const largo = 3 + azar() * 4;
            const giro = -60 + azar() * 120;
            const oscura = i % 3 === 0;
            return (
              <path
                key={i}
                d={`M0 0 q${f(largo / 2)} ${f(-2.5 + azar() * 5)} ${f(largo)} ${f(-1 + azar() * 2)}`}
                transform={`translate(${f(x)} ${f(y)}) rotate(${f(giro)})`}
                fill="none"
                stroke={oscura ? "#7A5F3E" : "#F4E8D0"}
                strokeWidth={oscura ? 0.5 : 0.8}
                strokeLinecap="round"
                opacity={oscura ? 0.45 : 0.6}
              />
            );
          })}
        </>
      ),
    };
  },

  // Sarga 45° apretada, urdimbre índigo y trama clara: el "diagonal" del jean.
  denim: () => ({
    fondo: "#3F5670",
    formas: (
      <>
        {rango(56).map((i) => (
          <line key={i} x1={i * 3 - 40} y1={ALTO} x2={i * 3} y2={0} stroke="#7C93AD" strokeWidth={1} opacity={0.5} />
        ))}
        {[
          [14, 9, 6],
          [52, 30, 8],
          [88, 14, 5],
          [104, 33, 7],
          [30, 25, 5],
        ].map(([x, y, l], i) => (
          <line key={`m${i}`} x1={x} y1={y} x2={x + l} y2={y} stroke="#C9D4E0" strokeWidth={0.9} opacity={0.45} />
        ))}
      </>
    ),
  }),

  // Sarga 45° más ancha y firme, caqui de uniforme/workwear.
  drill: () => ({
    fondo: "#B79E73",
    formas: (
      <>
        {rango(30).map((i) => (
          <line key={i} x1={i * 4.5 - 40} y1={ALTO} x2={i * 4.5} y2={0} stroke="#7E6A48" strokeWidth={1.8} opacity={0.4} />
        ))}
      </>
    ),
  }),

  // Sarga muy fina y empinada (63°): la gabardina se reconoce por esa cordonada
  // diagonal tupida; gris cálido, tela de vestir.
  gabardina: () => ({
    fondo: "#6E6A5C",
    formas: (
      <>
        {rango(96).map((i) => (
          <line key={i} x1={i * 2 - 20} y1={ALTO} x2={i * 2} y2={0} stroke="#A29D8E" strokeWidth={0.8} opacity={0.55} />
        ))}
      </>
    ),
  }),

  // Punto liso: filas de "V" encadenadas, el derecho del tejido de polera.
  jersey: () => {
    let d = "";
    for (const fila of rango(9)) {
      for (const col of rango(31)) {
        const x = col * 4 - 2;
        const y = fila * 4.6 + 1;
        d += `M${x} ${f(y)} l2 3.4 l2 -3.4 `;
      }
    }
    return {
      fondo: "#EFE8DA",
      formas: <path d={d} fill="none" stroke="#805C4C" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />,
    };
  },

  // Elástico: superficie lisa oscura con la malla finísima del punto y una
  // banda de brillo — se ve "tensa", que es lo que la licra es.
  licra: () => ({
    fondo: "#2B2A28",
    formas: (
      <>
        {rango(20).map((i) => (
          <rect key={i} x={0} y={i * 2} width={ANCHO} height={0.7} fill="#5A5854" opacity={0.7} />
        ))}
        <polygon points="70,0 96,0 78,40 52,40" fill="#FFFFFF" opacity={0.14} />
        <polygon points="18,0 26,0 8,40 0,40" fill="#FFFFFF" opacity={0.1} />
      </>
    ),
  }),

  // Hilo irregular con "nudos" (slubs): hilos horizontales y verticales de
  // grosor desigual y motas gruesas, la asimetría es justo lo que lo delata.
  lino: () => {
    const azar = semillaAzar(23);
    return {
      fondo: "#D9CDB2",
      formas: (
        <>
          {rango(60).map((i) => {
            const y = azar() * ALTO;
            const x1 = azar() * 100;
            return <line key={`h${i}`} x1={f(x1)} y1={f(y)} x2={f(x1 + 8 + azar() * 22)} y2={f(y)} stroke="#8F7E5E" strokeWidth={0.5 + azar() * 1} opacity={0.15 + azar() * 0.25} />;
          })}
          {rango(80).map((i) => {
            const x = azar() * ANCHO;
            const y1 = azar() * 32;
            return <line key={`v${i}`} x1={f(x)} y1={f(y1)} x2={f(x)} y2={f(y1 + 5 + azar() * 12)} stroke="#8F7E5E" strokeWidth={0.5 + azar() * 1} opacity={0.15 + azar() * 0.25} />;
          })}
          {rango(16).map((i) => {
            const x = azar() * (ANCHO - 14);
            const y = azar() * ALTO;
            return <line key={`n${i}`} x1={f(x)} y1={f(y)} x2={f(x + 5 + azar() * 9)} y2={f(y)} stroke="#B5A27E" strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />;
          })}
        </>
      ),
    };
  },

  // Corduroy: canales verticales anchos con su lomo claro y el surco oscuro.
  pana: () => ({
    fondo: "#5C4330",
    formas: (
      <>
        {rango(18).map((i) => (
          <g key={i}>
            <rect x={i * 7} y={0} width={5.4} height={ALTO} fill="#9A7857" />
            <rect x={i * 7 + 0.6} y={0} width={1.6} height={ALTO} fill="#BC9A74" opacity={0.85} />
          </g>
        ))}
      </>
    ),
  }),

  // Panal de polo: rombos que se tocan, con el relieve marcado en sus vértices.
  pique: () => {
    let d = "";
    for (const fila of rango(9)) {
      for (const col of rango(16)) {
        const x = col * 8 + (fila % 2 ? 4 : 0);
        const y = fila * 5;
        d += `M${x} ${y + 2.5} l4 -2.5 l4 2.5 l-4 2.5 z `;
      }
    }
    return {
      fondo: "#F1EADB",
      formas: <path d={d} fill="none" stroke="#8A7F6B" strokeWidth={0.9} strokeLinejoin="round" opacity={0.7} />,
    };
  },

  // Fleece: pelusa densa de motas redondas superpuestas, claras y suaves.
  polar: () => {
    const azar = semillaAzar(37);
    return {
      fondo: "#DDD3C0",
      formas: (
        <>
          {rango(150).map((i) => (
            <circle key={i} cx={f(azar() * ANCHO)} cy={f(azar() * ALTO)} r={f(1.4 + azar() * 1.4)} fill="#F6F1E6" stroke="#C9BDA5" strokeWidth={0.4} opacity={0.9} />
          ))}
        </>
      ),
    };
  },

  // Superficie sintética lisa: malla de microporos muy regular y una banda
  // de brillo plana. Gris azulado, distinto de todos los naturales.
  poliester: () => {
    let d = "";
    for (const fila of rango(14)) {
      for (const col of rango(40)) {
        d += `M${col * 3 + 1} ${fila * 3 + 1} h0.01 `;
      }
    }
    return {
      fondo: "#B7BDBF",
      formas: (
        <>
          <path d={d} stroke="#5F6A70" strokeWidth={1.1} strokeLinecap="round" opacity={0.55} />
          <polygon points="60,0 84,0 66,40 42,40" fill="#FFFFFF" opacity={0.28} />
        </>
      ),
    };
  },

  // Camisería: hilo finísimo y parejo, trama horizontal marcada, azul lavado
  // de camisa. Se distingue del algodón por su finura y su rigor.
  popelina: () => ({
    fondo: "#E6EDF0",
    formas: (
      <>
        {rango(26).map((i) => (
          <rect key={`h${i}`} x={0} y={i * 1.6} width={ANCHO} height={0.6} fill="#8FA7B5" opacity={0.4} />
        ))}
        {rango(60).map((i) => (
          <rect key={`v${i}`} x={i * 2} y={0} width={0.5} height={ALTO} fill="#8FA7B5" opacity={0.2} />
        ))}
      </>
    ),
  }),

  // Canalé: columnas alternas hundidas/elevadas con la costura de puntos en
  // cada una — más angosto que la pana y con punto, no con lomo liso.
  rib: () => ({
    fondo: "#E4DACA",
    formas: (
      <>
        {rango(20).map((i) => (
          <g key={i}>
            <rect x={i * 6} y={0} width={3} height={ALTO} fill="#805C4C" opacity={0.28} />
            <line x1={i * 6 + 4.5} y1={0} x2={i * 6 + 4.5} y2={ALTO} stroke="#805C4C" strokeWidth={0.9} strokeDasharray="2 1.6" opacity={0.55} />
          </g>
        ))}
      </>
    ),
  }),

  // Satén: ondas anchas de tela caída; el brillo son bandas claras planas
  // junto a bandas de sombra, sin degradado.
  seda: () => ({
    fondo: "#E8D9BF",
    formas: (
      <>
        {[
          [6, 9, "#C4AC85", 0.5],
          [12, 7, "#FBF4E4", 0.9],
          [21, 9, "#C4AC85", 0.45],
          [28, 7, "#FBF4E4", 0.9],
          [36, 9, "#C4AC85", 0.5],
        ].map(([y, ancho, color, op], i) => (
          <path
            key={i}
            d={`M-5 ${y} C30 ${Number(y) - 12}, 62 ${Number(y) + 12}, 125 ${Number(y) - 6}`}
            fill="none"
            stroke={String(color)}
            strokeWidth={Number(ancho)}
            opacity={Number(op)}
          />
        ))}
      </>
    ),
  }),

  // Caída fluida: pliegues verticales suaves, salvia — liviana, veraniega.
  viscosa: () => ({
    fondo: "#A9B79A",
    formas: (
      <>
        {rango(9).map((i) => (
          <path
            key={i}
            d={`M${i * 15 - 2} -2 C${i * 15 + 10} 12, ${i * 15 - 10} 28, ${i * 15 + 2} 42`}
            fill="none"
            stroke={i % 2 ? "#7F9070" : "#C7D2B9"}
            strokeWidth={6}
            opacity={i % 2 ? 0.4 : 0.7}
          />
        ))}
      </>
    ),
  }),

  // — Las de abajo se sumaron el 2026-10-02 para los tejidos de producción que salían «Sin muestra». —

  // Franela: pelusa del cepillado (motas cortas claras y oscuras en todas las direcciones) sobre una sarga
  // finísima casi invisible, gris jaspeado. Se ve blanda y mate, a diferencia del polar (motas redondas).
  franela: () => {
    const azar = semillaAzar(61);
    return {
      fondo: "#CFCBC1",
      formas: (
        <>
          {rango(50).map((i) => (
            <line key={`d${i}`} x1={i * 3 - 40} y1={ALTO} x2={i * 3} y2={0} stroke="#A9A498" strokeWidth={0.8} opacity={0.35} />
          ))}
          {rango(240).map((i) => {
            const x = azar() * ANCHO;
            const y = azar() * ALTO;
            const largo = 1.4 + azar() * 1.6;
            const clara = i % 2 === 0;
            return <line key={`m${i}`} x1={f(x)} y1={f(y)} x2={f(x + largo)} y2={f(y)} stroke={clara ? "#EFECE4" : "#8F8A7E"} strokeWidth={0.9} strokeLinecap="round" opacity={clara ? 0.7 : 0.4} />;
          })}
        </>
      ),
    };
  },

  // Gasa: casi transparente. Una malla finísima y dos capas translúcidas que se cruzan; donde se
  // superponen se nota el fondo a través, que es justo lo que la distingue de la popelina.
  gasa: () => ({
    fondo: "#EDE1DC",
    formas: (
      <>
        {rango(40).map((i) => (
          <rect key={`v${i}`} x={i * 3} y={0} width={0.4} height={ALTO} fill="#8E7A74" opacity={0.18} />
        ))}
        {rango(14).map((i) => (
          <rect key={`h${i}`} x={0} y={i * 3} width={ANCHO} height={0.4} fill="#8E7A74" opacity={0.18} />
        ))}
        <path d="M-5 30 C25 6, 55 40, 90 14 S125 24, 130 12 L130 40 L-5 40 Z" fill="#C9AFA8" opacity={0.28} />
        <path d="M-5 14 C30 36, 60 0, 95 24 S125 8, 130 20 L130 0 L-5 0 Z" fill="#FFFFFF" opacity={0.35} />
      </>
    ),
  }),

  // Hilo (tejido de punto con hilo de algodón): las «V» del punto liso pero gruesas, apiladas en columnas (la
  // punta de cada «V» cae entre los brazos de la de abajo, que es lo que lo lee como tejido y no como zigzag), con
  // el cuerpo del hilo visible y una hebra clara encima. Más grande que el jersey, que es el mismo punto en fino.
  hilo: () => {
    let cuerpo = "";
    let hebra = "";
    for (const fila of rango(8)) {
      for (const col of rango(17)) {
        const x = col * 7.5 - 3;
        const y = fila * 5.5 - 1;
        cuerpo += `M${f(x)} ${f(y)} l3.5 5.5 l3.5 -5.5 `;
        hebra += `M${f(x + 0.7)} ${f(y + 0.3)} l2.8 4.4 `;
      }
    }
    return {
      fondo: "#E9DFCB",
      formas: (
        <>
          <path d={cuerpo} fill="none" stroke="#9D8A68" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
          <path d={hebra} fill="none" stroke="#FBF6EA" strokeWidth={0.8} strokeLinecap="round" opacity={0.8} />
        </>
      ),
    };
  },

  // Macramé: cuerdas que se cruzan en diagonal formando rombos, con un nudo en cada cruce. Es el nudo lo
  // que lo delata; sin él sería una red de pescar.
  macrame: () => {
    const k = 14;
    let cuerdas = "";
    for (let a = -3; a <= 9; a++) cuerdas += `M${k * a} 0 L${k * a + 40} 40 `;
    for (let b = 0; b <= 12; b++) cuerdas += `M${k * b} 0 L${k * b - 40} 40 `;
    const nudos: ReactElement[] = [];
    for (let a = -3; a <= 9; a++) {
      for (let b = 0; b <= 12; b++) {
        const x = (k * (a + b)) / 2;
        const y = (k * (b - a)) / 2;
        if (x < -2 || x > 122 || y < -2 || y > 42) continue;
        nudos.push(
          <g key={`${a}_${b}`}>
            <circle cx={x} cy={y} r={2.3} fill="#8E7B5A" opacity={0.92} />
            <circle cx={f(x - 0.6)} cy={f(y - 0.6)} r={0.8} fill="#F6EEDC" opacity={0.7} />
          </g>,
        );
      }
    }
    return {
      fondo: "#E3D8C0",
      formas: (
        <>
          <path d={cuerdas} fill="none" stroke="#A99677" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
          {nudos}
        </>
      ),
    };
  },

  // «Tela mojada»: elástica, brillante y fluida, con ondas largas de brillo plano sobre un fondo oscuro. Es
  // la hermana oscura de la seda: misma idea de bandas planas, más estrechas y con más contraste.
  mojado: () => ({
    fondo: "#5F5453",
    formas: (
      <>
        {[
          [6, 1.6, "#CDBFB9", 0.55],
          [13, 3.4, "#9C8B86", 0.5],
          [20, 1.4, "#E5DAD5", 0.75],
          [27, 3.8, "#9C8B86", 0.5],
          [34, 1.6, "#CDBFB9", 0.55],
        ].map(([y, ancho, color, op], i) => (
          <path
            key={i}
            d={`M-5 ${y} C18 ${Number(y) - 9}, 42 ${Number(y) + 9}, 66 ${y} S104 ${Number(y) - 8}, 125 ${Number(y) + 3}`}
            fill="none"
            stroke={String(color)}
            strokeWidth={Number(ancho)}
            strokeLinecap="round"
            opacity={Number(op)}
          />
        ))}
      </>
    ),
  }),

  // Oxford: tafetán en «canasta» (dos hilos juntos por cada cruce), con urdimbre azul y trama blanca. Los
  // bloques de 2×2 que alternan vertical y horizontal son lo que lo separa de una popelina lisa.
  oxford: () => ({
    fondo: "#B9CEDD",
    formas: (
      <>
        {rango(20).flatMap((col) =>
          rango(7).map((fila) => {
            const x = col * 6;
            const y = fila * 6;
            return (col + fila) % 2 === 0 ? (
              <g key={`${col}_${fila}`} fill="#F6F7F4" opacity={0.9}>
                <rect x={x + 0.4} y={y} width={1.8} height={6} />
                <rect x={x + 3.4} y={y} width={1.8} height={6} />
              </g>
            ) : (
              <g key={`${col}_${fila}`} fill="#F6F7F4" opacity={0.9}>
                <rect x={x} y={y + 0.4} width={6} height={1.8} />
                <rect x={x} y={y + 3.4} width={6} height={1.8} />
              </g>
            );
          }),
        )}
      </>
    ),
  }),

  // Sastre: tela de vestir. Gris carbón con una sarga finísima y motas claras y oscuras (jaspeado): sobria,
  // sin brillo y sin dibujo, porque el dibujo de una prenda de sastre lo pone el Patrón, no el tejido.
  sastre: () => {
    const azar = semillaAzar(71);
    return {
      fondo: "#464B54",
      formas: (
        <>
          {rango(70).map((i) => (
            <line key={`d${i}`} x1={i * 2 - 40} y1={ALTO} x2={i * 2} y2={0} stroke="#5E646E" strokeWidth={0.7} opacity={0.5} />
          ))}
          {rango(160).map((i) => (
            <rect key={`m${i}`} x={f(azar() * ANCHO)} y={f(azar() * ALTO)} width={1.2} height={0.7} fill={i % 2 === 0 ? "#8D939D" : "#2A2D33"} opacity={0.6} />
          ))}
        </>
      ),
    };
  },

  // Seersucker: franjas lisas azules que alternan con franjas fruncidas blancas; el fruncido son líneas
  // onduladas, porque el relieve ES el tejido (no se plancha).
  seersucker: () => ({
    fondo: "#F3F1EA",
    formas: (
      <>
        {rango(8).map((i) => {
          const x = i * 15;
          const onda = (x0: number) => `M${f(x0)} 0 q1.6 2.5 0 5${" t0 5".repeat(7)}`;
          return (
            <g key={i}>
              <rect x={x} y={0} width={7.5} height={ALTO} fill="#B7CBDB" />
              <rect x={x + 1.9} y={0} width={0.5} height={ALTO} fill="#8FA6B8" opacity={0.5} />
              <rect x={x + 5} y={0} width={0.5} height={ALTO} fill="#8FA6B8" opacity={0.5} />
              <rect x={x + 7.5} y={0} width={7.5} height={ALTO} fill="#E7E6DF" />
              {[9.4, 11.4, 13.4].map((dx) => (
                <path key={dx} d={onda(x + dx)} fill="none" stroke="#8FA6B8" strokeWidth={0.7} opacity={0.75} />
              ))}
            </g>
          );
        })}
      </>
    ),
  }),

  // Suplex: poliamida con elastano. Punto finísimo de canales verticales, gris azulado y mate, con apenas
  // un brillo. Más claro y sin las bandas de la licra: se lee «deportivo», no «charol».
  suplex: () => ({
    fondo: "#4B5262",
    formas: (
      <>
        {rango(75).map((i) => (
          <rect key={i} x={i * 1.6} y={0} width={0.55} height={ALTO} fill="#2E3340" opacity={0.55} />
        ))}
        <polygon points="62,0 90,0 72,40 44,40" fill="#FFFFFF" opacity={0.08} />
      </>
    ),
  }),

  // «Tela»: el nombre genérico. Un tafetán liso en gris neutro: no dice de qué fibra es porque el nombre
  // tampoco lo dice, y el gris (no el crudo del algodón) evita que parezca otra fibra concreta.
  tela: () => ({
    fondo: "#D5D3CD",
    formas: (
      <>
        {rango(50).map((i) => (
          <rect key={`v${i}`} x={i * 2.4} y={0} width={0.9} height={ALTO} fill="#6F6D66" opacity={0.2} />
        ))}
        {rango(17).map((i) => (
          <rect key={`h${i}`} x={0} y={i * 2.4} width={ANCHO} height={0.9} fill="#6F6D66" opacity={0.2} />
        ))}
      </>
    ),
  }),

  // Aterciopelada: pelo corto y tupido, todo caído en una misma dirección (por eso el color cambia según
  // cómo le da la luz), ciruela profunda con una banda de brillo plana.
  terciopelo: () => {
    const azar = semillaAzar(53);
    return {
      fondo: "#5B3A56",
      formas: (
        <>
          {rango(260).map((i) => {
            const x = azar() * ANCHO;
            const y = azar() * ALTO;
            const clara = i % 3 === 0;
            return <line key={i} x1={f(x)} y1={f(y)} x2={f(x + 2.2)} y2={f(y - 1.2)} stroke={clara ? "#9A6F93" : "#3A2237"} strokeWidth={0.9} strokeLinecap="round" opacity={0.5} />;
          })}
          <polygon points="40,0 70,0 52,40 22,40" fill="#FFFFFF" opacity={0.12} />
        </>
      ),
    };
  },
};

export function MuestraTejido({
  nombre,
  imagenUrl = null,
  className = "aspect-[3/1] w-full",
}: {
  nombre: string;
  /** La foto real que subió un Líder (`imagen_muestra_url`, ADR-0256). Si está, manda sobre el dibujo. */
  imagenUrl?: string | null;
  className?: string;
}) {
  if (imagenUrl) {
    return (
      <div className={`${className} relative overflow-hidden rounded-lg border border-tinta/10 bg-sand/40`}>
        <Image src={imagenUrl} alt={`Muestra del tejido ${nombre}`} fill unoptimized sizes="(max-width: 640px) 100vw, 480px" className="object-cover" />
      </div>
    );
  }

  const familia = familiaDeTejido(nombre);

  // Un nombre nuevo que no reconocemos: se dice claro en vez de dibujar una
  // tela que no es. El Líder lo resuelve subiendo la foto desde el detalle.
  if (!familia) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-lg border border-dashed border-tinta/20 text-[10px] uppercase tracking-wider text-tinta/40`}
        aria-hidden
      >
        Sin muestra
      </div>
    );
  }

  const { fondo, formas } = DIBUJOS[familia]();
  return (
    <div className={`${className} overflow-hidden rounded-lg border border-tinta/10`} style={{ backgroundColor: fondo }} role="img" aria-label={`Muestra del tejido ${nombre}`}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
        {formas}
      </svg>
    </div>
  );
}
