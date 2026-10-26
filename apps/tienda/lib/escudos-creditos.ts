// De dónde salió cada escudo de `public/escudos/` y bajo qué licencia (Wikimedia Commons, bajados el 2026-10-26). Las tres licencias exigen
// mencionar al autor, decir la licencia y avisar que se cambió algo: aquí se reducen a 120 px de ancho (la miniatura PNG que Commons genera
// del mismo archivo). Las dos CC BY-SA piden además compartir igual lo que se derive del dibujo: el escudo reducido sigue bajo esa licencia.
// El pie de la tienda (`components/Pie.tsx`) los muestra en toda página; la prueba exige un crédito por cada escudo anotado.

export type CreditoDeEscudo = {
  /** La tienda, con la clave de `ESCUDOS_DE_TIENDA`. */
  clave: string;
  ciudad: string;
  autor: string;
  licencia: string;
  /** La página de la licencia. */
  hrefLicencia: string;
  /** La página del archivo en Commons (autor, historia y licencia de ese archivo). */
  hrefArchivo: string;
};

export const CREDITOS_DE_ESCUDOS: readonly CreditoDeEscudo[] = [
  {
    clave: "arequipa",
    ciudad: "Arequipa",
    autor: "HansenBCN",
    licencia: "CC BY-SA 4.0",
    hrefLicencia: "https://creativecommons.org/licenses/by-sa/4.0/",
    hrefArchivo: "https://commons.wikimedia.org/wiki/File:Escudo_de_Arequipa.svg",
  },
  {
    clave: "lima",
    ciudad: "Lima",
    autor: "Huhsunqu",
    licencia: "CC BY 3.0",
    hrefLicencia: "https://creativecommons.org/licenses/by/3.0/",
    hrefArchivo: "https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_Lima.svg",
  },
  {
    clave: "trujillo",
    ciudad: "Trujillo",
    autor: "Martin Flavio Tito Lavi",
    licencia: "CC BY-SA 3.0",
    hrefLicencia: "https://creativecommons.org/licenses/by-sa/3.0/",
    hrefArchivo: "https://commons.wikimedia.org/wiki/File:Escudo_de_Trujillo_(Per%C3%BA).svg",
  },
];
