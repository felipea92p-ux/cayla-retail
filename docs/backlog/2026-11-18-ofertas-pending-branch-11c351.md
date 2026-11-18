# Campañas y ofertas, más simple (ADR-0677) · pendientes

- [ ] **Pegar en producción ANTES de fusionar el PR, con el OK de Felipe y en este orden** (solo funciones: ni tablas ni columnas; la web nueva ya
  no trae el escáner viejo, así que sin ellas la tienda se queda sin «Poner un %»), después de las de ADR-0669 que ya están:
  `20261118001000_campanas_descuentos`, `20261118010000_campanas_rebaja_de_variantes`, `20261118030000_descuentos_crear_cambiar_desactivar`.
  Mientras no estén, la lista de descuentos no se dibuja y `pnpm datos:comparar` avisa que la pantalla llama a funciones que producción no tiene.
  Después: `pnpm datos:generar:produccion` y regenerar los tipos (para quitar `lib/rebaja-rapida.ts`, que las llama sin tipo).
- [ ] **Actividades 6 a 8 de la maqueta** (`docs/maquetas/campanas-simple-2026-11/`), en el PR siguiente: abrir una campaña como la fila de un
  descuento (el pase con nombre, tres chips, las ofertas como carteles y sus prendas; «Más» con imprimir, ver en la web y desactivar; arreglar
  «sin prendas»; quitar «vendidas en 30 días» y «en las tiendas»), la hoja de ofertas en una sola hoja sin «Regalo» ni «Club», y la compra de
  ejemplo en vivo con la regla de Vender.
- [x] **Chaos #1 y #2 y los 3 cambios de Formidable**, hechos el 2026-11-18 con el OK de Felipe («Sí, los cinco»), cada uno con su prueba.
- [ ] `poner_rebaja` (ADR-0669, en producción) acepta un % mayor que 0 aunque su mensaje dice «de 1 a 70». Desde la pantalla nueva solo recibe el %
  de un descuento que ya existe, así que no se alcanza; cerrarlo del todo es un reemplazo anclado en producción: decisión de Felipe.
- [ ] Repetir la prueba ciega de Formidable después de los tres cambios.
- [ ] Probarlo con una colaboradora real (la ciega pasó en 5 toques) y la cámara en un teléfono de verdad.
- [ ] Una integrante CON el módulo mirando un descuento de todas las tiendas (no puede quitar ni agregar ahí): el seed local no la tiene.
