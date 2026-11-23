// El registro de lo que cada página le dice a Google (ADR-0696, T6 de la auditoría de SEO del 2026-11-23). Toda `page.tsx` de la tienda
// está aquí: `indexa` (tiene su frase y su dirección canónica, y las fijas van en el mapa del sitio) o `no` (lleva `noindex`, con el
// motivo). `lib/seo-paginas.test.ts` abre cada archivo y lo comprueba, y falla si una página nueva nace sin declararse: antes, casi
// todas heredaban la frase del layout y nadie lo notaba.

export type SeoDeLaPagina = { indexa: true } | { indexa: false; motivo: string } | { redirige: string };

/** @internal Lo lee solo su prueba: es el tablero de las páginas, como `guia-de-foco-pantallas.ts` en el ERP. */
export const SEO_DE_LAS_PAGINAS: Record<string, SeoDeLaPagina> = {
  "/": { redirige: "el proxy la manda al Inicio con su tienda; la página es la red por si no" },
  "/inicio": { indexa: true },
  "/catalogo": { indexa: true },
  "/catalogo/[id]": { indexa: true },
  "/looks": { indexa: true },
  "/looks/[id]": { indexa: true },
  "/looks/arma": { indexa: true },
  "/tiendas": { indexa: true },
  "/como-separar": { indexa: true },
  "/cambios-y-devoluciones": { indexa: true },
  "/preguntas-frecuentes": { indexa: true },
  "/club": { indexa: true },
  "/libro-de-reclamaciones": { indexa: true },
  "/privacidad": { indexa: true },
  "/terminos-del-club": { indexa: true },
  "/looks/guardado/[id]": { indexa: false, motivo: "el look guardado de UNA persona" },
  "/tu-look": { indexa: false, motivo: "un look compartido por WhatsApp: uno por cada combinación posible" },
  "/bolsa": { indexa: false, motivo: "la bolsa de cada persona" },
  "/bolsa/separado/[numero]": { indexa: false, motivo: "la confirmación de un pedido" },
  "/entrar": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/crear-cuenta": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/olvide-mi-contrasena": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/nueva-contrasena": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/restablecer-acceso": { indexa: false, motivo: "una puerta de la cuenta, sin contenido de la tienda" },
  "/cuenta": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/club": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/correo": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/eliminar": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/pedidos": { indexa: false, motivo: "la cuenta de cada persona" },
  "/cuenta/pedidos/[numero]": { indexa: false, motivo: "la cuenta de cada persona" },
  "/notificaciones": { indexa: false, motivo: "los avisos de cada persona" },
  "/recomendaciones": { indexa: false, motivo: "se escriben con el nombre de cada persona" },
  "/libro-de-reclamaciones/hoja/[id]": { indexa: false, motivo: "la hoja de reclamación de una persona" },
  "/vista-previa/[llave]": { indexa: false, motivo: "una vista previa interna del ERP, con llave" },
};
