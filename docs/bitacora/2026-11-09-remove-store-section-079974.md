# 2026-11-09 · Tienda web: el crédito de los escudos sale del pie

Qué hice: el pie de la tienda web queda solo con «© 2026 CAYLA»; el crédito de los escudos de las ciudades (Wikimedia Commons, CC BY / CC BY-SA) pasa al final de «Nuestras tiendas» (`components/NuestrasTiendas.tsx`), en letra chica.
Por qué así: Felipe pidió quitarlo del pie, pero las tres licencias exigen nombrar al autor y la licencia mientras los escudos se usen; «Nuestras tiendas» está enlazada desde el pie y es donde se habla de las ciudades, un lugar razonable para la atribución.
Qué se rompería sin esto: borrar el crédito del todo dejaría tres imágenes ajenas sin cumplir su licencia (y `lib/escudo-de-tienda.test.ts` exige un crédito por escudo). Si algún día se quiere la web sin ningún crédito, el camino limpio es reemplazar los escudos por dibujos propios.
