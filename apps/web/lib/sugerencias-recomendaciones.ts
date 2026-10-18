// Formas de empezar la respuesta a una recomendación, y el texto de ayuda de su caja, que siguen lo que el cliente escribió (skill
// `/sugerir`, CLAUDE.md «Sugerencias coherentes», ADR-0290; actividad 4 de la hoja nueva, Felipe 2026-10-17).
//
// El problema: la caja decía «Escribe una respuesta corta y cálida…» igual para un elogio que para una queja de calidad, y la respuesta
// que salía era «Lo tendremos en cuenta»: lo que un cliente lee como «no». Un buen comienzo saluda por su nombre y dice qué se va a
// hacer con lo que contó; aquí se escribe ese comienzo según el tema y deja el resto a quien responde.
//
// De dónde sale cada texto, en este orden: el TEMA de lo que escribió (`temasDe`), con el DATO del catálogo cuando lo hay (si hay o no
// su talla), y si no hay tema, un comienzo neutro que solo agradece. Nunca promete lo que la tienda no hace (envío, apartar, avisar de
// un descuento) ni afirma un dato que no se leyó: sin catálogo, una talla no se da por agotada.
//
// Ninguna PREGUNTA: la respuesta es una sola y el cliente no puede contestarla en la misma conversación (ADR-0408), así que «¿qué prenda
// buscabas?» lo dejaría sin salida. Se dice qué se hará, o se lo invita a escribir de nuevo o a pasar por la tienda.
//
// Todo es una función pura y determinista: mismo texto y mismo catálogo, mismas sugerencias (sin azar ni red).

import { MAX_RESPUESTA } from "./recomendaciones-reglas";
import type { DatosCatalogo, Tema, TemaId } from "./recomendaciones-temas";

export type Inicio = { etiqueta: string; texto: string };

type Contexto = {
  /** El primer nombre del cliente («Lucía»), o null si su ficha se anonimizó (entonces ya no se le responde). */
  nombre: string | null;
  /** Sobre qué tienda escribió («Tienda Trujillo»), o null si es sobre CAYLA en general. */
  tienda: string | null;
  datos: DatosCatalogo | null;
};

const hola = (n: string | null) => (n ? `Hola, ${n}.` : "Hola.");

/** Los comienzos de un tema: dos maneras distintas de responder lo mismo. */
function iniciosDelTema(tema: Tema, c: Contexto): Inicio[] {
  const h = hola(c.nombre);
  switch (tema.id) {
    case "tallas": {
      const t = tema.talla;
      const modelos = t && c.datos ? (c.datos.modelosPorTalla[t] ?? 0) : null;
      const cual = t ? `en ${t}` : tema.rango === "grandes" ? "en talla grande" : tema.rango === "pequenas" ? "en talla pequeña" : "en tu talla";
      const contar =
        modelos === 0
          ? `${h} Gracias por escribirnos. Hoy no tenemos ${t}: se lo vamos a contar al taller para los próximos modelos.`
          : modelos !== null && modelos > 0
            ? `${h} Gracias por escribirnos. Hoy tenemos ${t} en ${modelos} ${modelos === 1 ? "modelo" : "modelos"}: pregunta por ${modelos === 1 ? "él" : "ellos"} en ${c.tienda ?? "cualquiera de nuestras tiendas"}.`
            : `${h} Gracias por contarnos: se lo vamos a pasar al taller para los próximos modelos.`;
      return [
        { etiqueta: "Contar qué haremos", texto: contar },
        {
          etiqueta: "Invitar a contar qué prenda",
          texto: `${h} Gracias por contarnos. Si nos escribes de nuevo qué prenda buscabas ${cual}, se la pedimos al taller con el modelo exacto.`,
        },
      ];
    }
    case "colores": {
      const total = c.datos?.colores.total ?? null;
      return [
        { etiqueta: "Tenerlo en cuenta en el pedido", texto: `${h} Gracias por escribirnos: lo vamos a tener en cuenta al elegir los colores del próximo pedido.` },
        {
          etiqueta: "Contar qué colores hay",
          texto: total
            ? `${h} ¡Gracias! Hoy tenemos ${total} colores en el catálogo; si buscas uno en especial, escríbenos de nuevo y te contamos si lo tenemos.`
            : `${h} ¡Gracias! Si buscas un color en especial, escríbenos de nuevo y te contamos si lo tenemos.`,
        },
      ];
    }
    case "envio":
      return [
        {
          etiqueta: "Contar cómo funciona hoy",
          texto: `${h} Gracias por escribirnos. Hoy la tienda online es solo con recojo en tienda; el envío todavía no lo tenemos, y tu mensaje nos ayuda a decidirlo.`,
        },
        {
          etiqueta: "Agradecer sin prometer fecha",
          texto: `${h} Gracias por contarnos. Lo estamos evaluando y no queremos darte una fecha que no podamos cumplir: si llega el envío, lo verás aquí.`,
        },
      ];
    case "precio":
      return [
        { etiqueta: "Agradecer y tenerlo en cuenta", texto: `${h} Gracias por decírnoslo: lo vamos a revisar al poner los precios de la próxima temporada.` },
        {
          etiqueta: "Invitar a contar qué prenda",
          texto: `${h} Gracias por escribirnos. Si nos cuentas en otra recomendación qué prenda te interesaba, revisamos ese precio en particular.`,
        },
      ];
    case "horario":
      return [
        { etiqueta: "Pasarlo a la tienda", texto: `${h} Gracias por contarnos: se lo pasamos a ${c.tienda ?? "la tienda"} para revisar el horario.` },
        { etiqueta: "Decir que lo revisaremos", texto: `${h} Gracias por escribirnos: vamos a revisar si podemos abrir en el horario que nos cuentas.` },
      ];
    case "calidad":
      return [
        {
          etiqueta: "Invitar a revisarlo en tienda",
          texto: `${h} Lamentamos lo que pasó. Acércate a ${c.tienda ?? "la tienda"} con la prenda y, si la tienes, la boleta: lo revisamos contigo.`,
        },
        { etiqueta: "Pasarlo al taller", texto: `${h} Gracias por avisarnos: se lo pasamos al taller para revisar esa prenda.` },
      ];
    case "atencion":
      return [
        {
          etiqueta: "Disculparse",
          texto: `${h} Lamentamos cómo te atendimos. Lo vamos a conversar con el equipo de ${c.tienda ?? "la tienda"} para que no se repita.`,
        },
        { etiqueta: "Agradecer el aviso", texto: `${h} Gracias por decírnoslo: así podemos mejorar. Lo vamos a conversar con el equipo.` },
      ];
    case "elogio":
      return [
        {
          etiqueta: "Agradecer",
          texto: `¡Gracias${c.nombre ? `, ${c.nombre}` : ""}! Se lo vamos a contar al equipo de ${c.tienda ?? "la tienda"}: les va a alegrar el día.`,
        },
        {
          etiqueta: "Invitar a volver",
          texto: `Gracias por escribirnos${c.nombre ? `, ${c.nombre}` : ""}. Qué bueno que encontraste lo que buscabas: te esperamos otra vez.`,
        },
      ];
  }
}

/** Sin tema reconocido: un comienzo que agradece y deja el resto a quien responde (nunca uno de otro tema). */
const NEUTRO = (c: Contexto): Inicio[] => [
  { etiqueta: "Agradecer", texto: `${hola(c.nombre)} Gracias por escribirnos y por tomarte el tiempo de contarnos.` },
];

/** Las formas de empezar para el tema elegido en «Lo que pide» (o, sin temas, la neutra). Cada una cabe en una respuesta. */
export function iniciosDe(tema: Tema | null, c: Contexto): Inicio[] {
  return (tema ? iniciosDelTema(tema, c) : NEUTRO(c)).filter((i) => [...i.texto].length <= MAX_RESPUESTA);
}

const GUIA: Record<TemaId, string> = {
  tallas: "dile si hay su talla o qué harán con su pedido",
  colores: "dile qué harán con los colores que pidió",
  envio: "cuéntale cómo entrega hoy la tienda online",
  precio: "dile qué harán con lo que contó del precio",
  horario: "dile si lo van a revisar con la tienda",
  calidad: "dile cómo lo van a revisar con la prenda",
  atencion: "discúlpate y dile qué harán para que no se repita",
  elogio: "agradécele y cuéntale que se lo dirás al equipo",
};

/** El texto de ayuda de la caja: qué conviene decir en ESTE caso. Sin tema, uno que vale para cualquiera. */
export function ayudaDeLaCaja(tema: Tema | null, nombre: string | null): string {
  const a = nombre ? `Escribe tu respuesta para ${nombre}: ` : "Escribe tu respuesta: ";
  return a + (tema ? GUIA[tema.id] : "agradece y dile qué harás con lo que contó") + ".";
}
