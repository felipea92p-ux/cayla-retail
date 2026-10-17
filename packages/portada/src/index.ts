// La portada de la tienda online en una sola pieza (ADR-0436, actividad 3): la tienda la dibuja para el cliente y el ERP la dibuja en
// la vista previa de Tienda web ▸ Campañas, con la misma estructura, los mismos estilos (`@cayla-retail/portada/heroe.css`) y los
// mismos colores. Si una de las dos cambia el héroe, cambia en las dos.
export { HeroeDePortada, type PiezaDeHeroe } from "./HeroeDePortada";
export { CONTRASTE_MINIMO, contraste, luminancia, mezclar } from "./contraste";
export { PALETAS, PALETA_DE_SIEMPRE, coloresEnTema, paletaPorId, variablesDePaleta, type Colores, type Paleta, type Tema } from "./paletas";
