// Para que la prueba lea `heroe.css` como texto con `?raw` (lo resuelve vitest), sin traer los tipos de Node al paquete.
declare module "*.css?raw" {
  const texto: string;
  export default texto;
}
