import { normalizarNombre } from "./patron-visual";
import { familiaDeTejido, type FamiliaTejido } from "./tejido-visual";

// Lo que se lee al pasar el mouse por un tejido en Nuevo producto: de qué tela se trata, cómo se comporta y para qué
// prendas sirve, en palabras de la tienda. Es el gemelo de `etiqueta-ayuda.ts` (mismo molde: «qué es» + datos).
//
// CONTRATO
//   PROMETE: para cualquier tejido que el sistema sabe dibujar, una frase de «qué es» (nunca vacía) y dos datos
//            para decidir al elegirlo: «Ideal para» y «Cuidado». Se lee al pasar el mouse y, en celular, bajo la fila.
//   ASUME:   el nombre es lo único estable del vocabulario (un líder puede agregar tejidos): la frase se elige con la
//            MISMA regla que el dibujo (`familiaDeTejido`), así lo que se ve y lo que se lee nunca se contradicen. Un
//            nombre que no se reconoce devuelve `null` y la tarjeta queda sin ayuda, como queda «Sin muestra»: callar
//            es más honesto que describir otra tela.
//   NO HACE: no lee la base ni guarda nada. Las frases son conocimiento general de la tela, no la ficha técnica de un
//            proveedor: la composición exacta de una pieza (qué porcentaje de licra lleva) es de la etiqueta que
//            trae. Lo durable sería una columna `descripcion` editable por un líder en Atributos ▸ Tejidos (decisión
//            de Felipe, igual que la de etiquetas): mientras no exista, este archivo es el único lugar donde viven.
//
// POR QUÉ HAY «ESPECÍFICAS» ADEMÁS DE LA FAMILIA: el dibujo agrupa por textura (Algodón alicrado y Mix de algodón y
// poliéster se dibujan como algodón y poliéster), pero la descripción no puede agruparse igual: «algodón con licra» no
// se cuida ni se usa como el algodón liso, y «Satín» no es seda. Esas pocas reglas van primero y se explican una a una.

export type AyudaTejido = {
  /** Qué es y cómo se siente, en una o dos frases. */
  queEs: string;
  /** «Ideal para: …» y «Cuidado: …» (y, en un nombre genérico, un «Ojo: …»). */
  datos: string[];
};

function ficha(queEs: string, idealPara: string, cuidado: string): AyudaTejido {
  return { queEs, datos: [`Ideal para: ${idealPara}`, `Cuidado: ${cuidado}`] };
}

// Nombres que contienen la palabra de OTRA tela pero no son esa tela. Van antes que la familia; el orden importa.
const ESPECIFICAS: ReadonlyArray<readonly [RegExp, AyudaTejido]> = [
  [
    // «Algodón alicrado», «algodón con licra», «algodón elastizado».
    /\b(alicrad[oa]s?|elastizad[oa]s?)\b|\balgodon\b.*\b(licra|lycra|elastano)\b/,
    ficha(
      "Algodón con un poco de licra: la suavidad y la frescura del algodón, más elasticidad para ajustar al cuerpo sin deformarse.",
      "bodys, tops, leggings y polos ajustados.",
      "agua fría y del revés; sin secadora ni lejía, que gastan el elástico.",
    ),
  ],
  [
    // «Mix Algodón & Poliéster»: la fibra de poliéster le gana a la de algodón en el dibujo, pero se comporta como mezcla.
    /\balgodon\b.*\b(poliester|polyester)\b|\b(poliester|polyester)\b.*\balgodon\b/,
    ficha(
      "Mezcla de algodón y poliéster: la frescura del algodón con la resistencia del poliéster. Se arruga y encoge menos y seca más rápido que el algodón solo.",
      "camisas, blusas, uniformes y polos de uso diario.",
      "agua tibia y plancha baja: es más fácil de cuidar que el algodón puro.",
    ),
  ],
  [
    // El dibujo agrupa «lana» con la alpaca (ambas son pelo); la lana de oveja no es alpaca.
    /\blana\b/,
    ficha(
      "Fibra de oveja: abrigadora, elástica y resistente al frío. Algunas calidades pican en piel sensible.",
      "chompas, abrigos, bufandas y ropa de invierno.",
      "a mano con agua fría; el calor y el roce la encogen y la apelmazan.",
    ),
  ],
  [
    /\b(cachemira|cashmere)\b/,
    ficha(
      "Fibra finísima de cabra: la más suave y liviana de las abrigadoras, pero delicada.",
      "chompas finas, bufandas y chales.",
      "a mano con agua fría y jabón suave; secar tendida.",
    ),
  ],
  [
    // El dibujo de «Satín» es el de la seda (brillo plano), pero el satín es un tejido que casi siempre es de poliéster.
    /\b(satin|raso)\b/,
    ficha(
      "Tejido de acabado satén: una cara lisa y brillante, otra mate, de caída fluida y tacto frío. Suele ser de poliéster; si es de seda natural, elige Seda.",
      "blusas, vestidos, lencería y prendas de fiesta.",
      "agua fría y ciclo delicado; planchar del revés con plancha baja, el calor marca brillos.",
    ),
  ],
];

const POR_FAMILIA: Readonly<Record<FamiliaTejido, AyudaTejido>> = {
  algodon: ficha(
    "Fibra natural, suave y fresca que deja respirar la piel. Absorbe bien la humedad, se arruga con facilidad y puede encoger al primer lavado.",
    "polos, camisas, vestidos y ropa de uso diario.",
    "agua fría o tibia; no secar al calor fuerte.",
  ),
  pima: ficha(
    "Algodón de fibra extra larga: más suave, más fino y más resistente que el común, y conserva mejor su color y su forma.",
    "polos y básicos de mejor calidad, piel sensible.",
    "agua fría y del revés; sin secadora.",
  ),
  alpaca: ficha(
    "Fibra del camélido andino: muy abrigadora y liviana, suave al tacto; regula el calor y no retiene olores.",
    "chompas, chalecos, ponchos y abrigos.",
    "a mano con agua fría y jabón suave; secar tendida, nunca colgada.",
  ),
  denim: ficha(
    "Algodón en sarga (hilos en diagonal): grueso y resistente, se ablanda y toma la forma del cuerpo con el uso.",
    "jeans, casacas, faldas y shorts.",
    "lavar del revés, con agua fría y poco: suelta color al inicio.",
  ),
  drill: ficha(
    "Algodón (a veces con poliéster) en sarga gruesa y firme: resiste el roce y mantiene la forma de la prenda.",
    "pantalones, bermudas, casacas y ropa de trabajo.",
    "agua tibia; planchar del revés.",
  ),
  franela: ficha(
    "Tela cepillada por una cara: blanda, abrigadora y de tacto afelpado. Con el uso suelta pelusa.",
    "buzos, joggers, pijamas y camisas de invierno.",
    "agua fría y del revés; la secadora caliente la hace soltar más pelusa.",
  ),
  gabardina: ficha(
    "Sarga muy fina y tupida, de caída elegante, buen cuerpo y poca arruga. Se ve formal y tiene un leve brillo.",
    "pantalones de vestir, faldas, sacos y gabardinas.",
    "lavado suave o en seco según la etiqueta; plancha a temperatura media.",
  ),
  gasa: ficha(
    "Tela transparente, muy liviana y fluida, de trama abierta: da volumen y movimiento, pero se ve a través.",
    "blusas, vestidos y mangas; suele llevar forro.",
    "a mano o en bolsa de malla: se enreda y se deshilacha con facilidad.",
  ),
  hilo: ficha(
    "Tejido de punto hecho con hilo de algodón: textura de puntos visible, cae suelto y se siente fresco. Se estira poco.",
    "chalecos, capas, cardigans y chompas ligeras.",
    "a mano o ciclo delicado; secar tendido, colgado se alarga.",
  ),
  jersey: ficha(
    "Tela de punto liso, suave y elástica: se adapta al cuerpo y casi no se arruga. Los bordes cortados tienden a enrollarse.",
    "polos, vestidos, tops y pijamas.",
    "agua fría y del revés; secar tendido, colgado pesado se deforma.",
  ),
  licra: ficha(
    "Tela elástica y lisa que se estira y vuelve a su forma, ajustada al cuerpo sin apretar.",
    "leggings, bodys, tops y ropa deportiva o de baño.",
    "agua fría, sin lejía ni secadora: el calor le quita la elasticidad.",
  ),
  lino: ficha(
    "Fibra natural muy fresca, de textura rústica con «nudos» visibles. Se arruga (es parte de su gracia) y se suaviza con cada lavado.",
    "camisas, vestidos, pantalones y conjuntos de verano.",
    "agua fría o tibia; planchar húmedo.",
  ),
  macrame: ficha(
    "Trabajo de cuerdas anudadas que forma una malla con relieve y, a veces, flecos. Es decorativo, abierto y se ve a través.",
    "blusas, chalecos y detalles aplicados.",
    "a mano y secar tendido: los nudos se enganchan en la máquina.",
  ),
  mojado: ficha(
    "Tela elástica y fluida de acabado brillante que se pega al cuerpo y marca la silueta, como si estuviera mojada.",
    "blusas ajustadas, tops y prendas de fiesta con amarres.",
    "a mano con agua fría, sin retorcer ni secadora; plancha baja por el revés.",
  ),
  oxford: ficha(
    "Tejido plano en «canasta» (dos hilos por cruce): firme, algo rugoso al tacto, respira bien y dura mucho.",
    "camisas, pantalones y uniformes.",
    "agua tibia; se arruga, planchar húmedo.",
  ),
  pana: ficha(
    "Tela con canales verticales de pelo corto: abrigada, de aspecto retro y buen cuerpo.",
    "pantalones, casacas, faldas y camisas gruesas.",
    "lavar del revés con agua fría; no planchar sobre el cordón, que se aplasta.",
  ),
  pique: ficha(
    "Punto con relieve de panal o pequeños rombos: fresco, firme y que no se pega al cuerpo.",
    "polos tipo polo, camisetas deportivas y uniformes.",
    "agua tibia; secar a la sombra para que no encoja.",
  ),
  polar: ficha(
    "Tela sintética afelpada (fleece): liviana, muy abrigadora, casi no absorbe humedad y seca rápido.",
    "casacas, chompas térmicas y buzos.",
    "agua fría, sin suavizante ni plancha: el calor la apelmaza.",
  ),
  poliester: ficha(
    "Fibra sintética resistente: casi no se arruga ni encoge y seca rápido, pero es menos fresca que las naturales.",
    "blusas, vestidos, ropa deportiva y forros.",
    "máquina con agua tibia; plancha baja o ninguna.",
  ),
  popelina: ficha(
    "Tejido plano, fino y firme, de superficie lisa y fresca. Mantiene la forma de la prenda.",
    "camisas, blusas, vestidos y uniformes.",
    "agua tibia; planchar apenas húmeda.",
  ),
  rib: ficha(
    "Punto canalé: columnas finas muy elásticas a lo ancho. Se pega al cuerpo y recupera su forma.",
    "tops, bodys, vestidos ajustados, puños y cuellos.",
    "agua fría y secar tendido; colgado se alarga.",
  ),
  sastre: ficha(
    "Tela de vestir de cuerpo firme y caída estructurada: mantiene el corte de la prenda. Suele ser mezcla de poliéster y viscosa; confirma la composición con el proveedor.",
    "pantalones, chalecos, sacos y faldas.",
    "según la etiqueta: en seco o suave a máquina; planchar con paño a temperatura media.",
  ),
  seda: ficha(
    "Fibra natural delicada, de brillo suave y caída muy fluida; fresca en verano y tibia en invierno.",
    "blusas, vestidos, pañuelos y prendas de fiesta.",
    "a mano con agua fría y jabón suave, o en seco; no retorcer ni dejar al sol.",
  ),
  seersucker: ficha(
    "Tela con franjas lisas y franjas fruncidas en relieve. El fruncido la separa de la piel: es fresca y casi no necesita plancha.",
    "camisas, blusas, shorts y vestidos de verano.",
    "agua fría; el fruncido es del tejido, no una arruga: no hace falta plancharlo.",
  ),
  suplex: ficha(
    "Tela de poliamida con elastano: muy elástica, de tacto suave y secado rápido; sujeta el cuerpo sin deformarse.",
    "bodys, tops, leggings y ropa deportiva o de baile.",
    "agua fría o ciclo delicado; sin lejía ni plancha caliente.",
  ),
  tela: {
    queEs: "Es un nombre genérico: no dice de qué fibra es.",
    datos: [
      "Ojo: si conoces la fibra, elige o agrega el tejido específico (Algodón, Poliéster, Viscosa…) para que la prenda quede bien descrita.",
      "Cuidado: el de la etiqueta del proveedor.",
    ],
  },
  terciopelo: ficha(
    "Acabado de pelo corto, suave como el terciopelo y de brillo profundo que cambia con la luz. Abriga y se ve elegante.",
    "blusas, vestidos, chalecos y prendas de fiesta.",
    "ciclo delicado, sin escurrir; planchar solo por el revés o con vapor: el pelo se aplasta.",
  ),
  viscosa: ficha(
    "Fibra artificial de celulosa: suave, muy fresca y de caída fluida, parecida a la seda pero más económica. Se arruga y encoge con facilidad.",
    "blusas, vestidos y faldas fluidas.",
    "agua fría y sin escurrir (mojada es frágil); plancha tibia.",
  ),
};

/** La ayuda del tejido por su nombre, o `null` si el nombre no se reconoce (la tarjeta queda sin tooltip). */
export function ayudaDeTejido(nombre: string): AyudaTejido | null {
  const limpio = normalizarNombre(nombre);
  for (const [regla, ayuda] of ESPECIFICAS) {
    if (regla.test(limpio)) return ayuda;
  }
  const familia = familiaDeTejido(nombre);
  return familia ? POR_FAMILIA[familia] : null;
}
