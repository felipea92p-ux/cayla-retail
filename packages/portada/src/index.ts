// La portada de la tienda online en una sola pieza (ADR-0436, actividad 3): la tienda la dibuja para el cliente y el ERP la dibuja en
// la vista previa de Tienda web ▸ Campañas, con la misma estructura, los mismos estilos (`@cayla-retail/portada/heroe.css`) y los
// mismos colores. Si una de las dos cambia el héroe, cambia en las dos.
export { HeroeDePortada, type PiezaDeHeroe } from "./HeroeDePortada";
export { CejaDeCampana } from "./CejaDeCampana";
export { paletasDeLasPrendas, type PrendaConColores } from "./colores-de-prendas";
export { CuentaDeCampana } from "./CuentaDeCampana";
export { fechaCorta, fechaLarga, finDeCampana, partesCuenta, partirTitulo, pctTexto } from "./textos";
export { CONTRASTE_MINIMO, contraste, luminancia, mezclar } from "./contraste";
export {
  ACOMODOS,
  COLOR_PROPIO_DE_PARTIDA,
  DISENO_DE_SIEMPRE,
  ESTILOS,
  FONDOS,
  FRASE_MAX,
  INTENSIDADES,
  PATRONES,
  PRENDAS_MAX,
  SELLOS,
  TAMANOS,
  aplicarEstilo,
  colorQueSeLee,
  coloresDelDiseno,
  estiloDelDiseno,
  leerDiseno,
  mismoDiseno,
  paletaDePrenda,
  paletaDelDiseno,
  paletaPropia,
  type Acomodo,
  type ColoresPropios,
  type DisenoDeCampana,
  type Estilo,
  type Fondo,
  type Intensidad,
  type Patron,
  type Sello,
  type Tamano,
} from "./diseno";
export { disenoParaPintar, fondoDelTexto, revisarDiseno, seLee, type Aviso, type ContextoRevision, type Tono } from "./revision";
export {
  PALETAS,
  PALETA_DE_SIEMPRE,
  coloresEnTema,
  paletaPorId,
  variablesDeLosDosTemas,
  variablesDePaleta,
  type Colores,
  type Paleta,
  type Tema,
} from "./paletas";
