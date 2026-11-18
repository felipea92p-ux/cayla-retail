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
- [ ] **Chaos #1 (g2, de Felipe):** un −0,5 % se crea aunque el mensaje dice «El % va de 1 a 70»: `fn_pct_de_descuento` y `pctDeDescuento` aceptan más
  de 0. Propuesta: piso en 1 en los dos lados.
- [ ] **Chaos #2 (g4):** tras una respuesta perdida, la lista sigue mostrando un descuento que la base ya apagó; al reintentar, la base lo dice claro
  pero la pantalla no se rehace. Propuesta: ante `rebaja_descuento_no_esta`, `router.refresh()`.
- [ ] **Formidable, 3 cambios que esperan OK** (`docs/formidable/catalogo-campanas-descuentos.md`): «Negro · todas las tallas», el aviso «Antes tenía
  −20 %» en vez del nombre interno del cajón, y tocar una prenda del panel muestra sus tallas.
- [ ] Probarlo con una colaboradora real (la ciega pasó en 5 toques) y la cámara en un teléfono de verdad.
- [ ] Una integrante CON el módulo mirando un descuento de todas las tiendas (no puede quitar ni agregar ahí): el seed local no la tiene.
