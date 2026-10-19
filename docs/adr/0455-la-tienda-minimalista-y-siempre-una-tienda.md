# ADR-0455 — La tienda online, minimalista (A · Muro), y siempre una tienda elegida

- **Fecha:** 2026-10-19 · **Estado:** propuesto (código y pruebas listos; falta el OK de Felipe sobre el precio por tienda y probar «Separar» y el favorito de punta a punta con una cuenta real)
- **Relacionados:** ADR-0408 (la tienda online), ADR-0438 (tienda sin cuenta; cuenta simple; Club al separar), ADR-0446 (letras y logo; actualización 2026-10-19: A completa), ADR-0434 (el probador «Arma el tuyo»), ADR-0136 (movimiento), ADR-0169 (paleta).

## El problema

La tienda tenía la dirección visual «A · Muro» a medias (PR #1195: paleta, letras, Inicio) y todavía mucho texto, dos barras de navegación (la franja negra y «Ver lo que hay en»),
íconos mezclados con palabras, un corazón y un buscador en la cabecera que competían con lo importante, y un «Todas» que mostraba el **mayor precio entre las tiendas**:
un precio que ninguna tienda cobra. Felipe pidió «lo menos posible de texto», «minimalista y entendible con pocas palabras» y «siempre se debe elegir una tienda».

## Lo que se decidió

1. **Cabecera «Una línea»** (elegida mirando 6 opciones, `docs/maquetas/tienda-rediseno-2026-10/cabeceras-minimalistas.html`): en la computadora, Lo nuevo · Ropa · Looks · Ofertas, el logo al centro y a la derecha la tienda (`LIMA ▾`), «Entrar» o «Cuenta» y «Bolsa 2». Con la franja negra de arriba a la vista (la campaña y las frases rotan como siempre), sin la segunda barra de tiendas, sin corazón ni buscador. En el celular, el logo a la izquierda junto al menú y la tienda a la derecha, con los íconos de cuenta y bolsa.
2. **Siempre una tienda** (`lib/sede-elegida.ts: resolverSede`, `lib/sede-servidor.ts: sedeDeLaPagina`): una página del catálogo sin `?sede=` redirige a la que la persona eligió la última vez (cookie `tienda-sede`, un año, del aparato) o, sin ella, a la **primera en orden alfabético** (hoy, Arequipa). Con una sola tienda en la web no hay nada que elegir. El precio es siempre el de esa tienda; **«Todas» (el mayor entre tiendas) ya no se muestra**.
3. **Favoritos dentro de la cuenta:** «Favoritos» es una opción del menú de la cuenta (con o sin sesión), con su número. Al guardar un favorito (ya confirmado por la base), el corazón de la prenda vuela hasta la palabra «Entrar» / «Cuenta» y esta late una vez (`lib/corazon-vuela.ts`; sin vuelo con «reducir movimiento»; si la cabecera no se ve, el corazón sube hasta el borde de arriba).
4. **Buscar solo en el catálogo:** un «Buscar» en la barra de filtros abre el mismo buscador de la cabecera (evento `cayla:buscar`).
5. **Menos texto:** Inicio de 513 a 266 palabras, ficha de 233 a 169, entrar de 86 a 49 (sin franja de promesas, bajadas, cejas, acordeones de ayuda ni la nota de niveles); «Así se separa» como 4 columnas con número en cursiva (formato A); «Más vendidos» sin números ni «NUEVO»; sin la fila de categorías con fotos; el menú «Ropa» solo con texto y columnas alineadas (subgrid).
6. **Nombres de grupo con barra** (`packages/shared/src/categorias-de-la-tienda.ts`): Blusas/Tops, Vestidos/Conjuntos, Pantalones/Faldas, Casacas/Abrigos, Bolsos/Accesorios, Bisutería/Belleza (antes «Arriba», «Abajo», «Encima y más»…).
7. **Menú del celular** igual que la computadora: Lo nuevo, Ropa (se abre), Looks, Ofertas, y al pie la cuenta, Favoritos y la ayuda.
10. **Los avisos (la campanita) dentro de la cuenta:** el ícono de la campana sale de la cabecera; «Avisos» es una fila del menú de la cuenta (entre «Favoritos» y «Cerrar sesión») con su número, que abre su panel dentro del mismo menú (la talla que esperabas y lo nuevo). Si hay algo sin ver, un punto rojo sobre «Cuenta» lo avisa aunque el menú esté cerrado. Solo con sesión.
9. **La bolsa es de UNA tienda, la elegida arriba:** en la bolsa solo sale «Recoges en <tienda>» (ya no la lista de tiendas). Agregar desde otra tienda con prendas en la bolsa no mezcla: «Tu bolsa es de otra tienda.» Cambiar de tienda en la cabecera con prendas en la bolsa muestra «Tu bolsa se vaciará.» con «Cambiar a <tienda>» / «Cancelar»; al confirmar se vacía la bolsa (`vaciarBolsaPorCambioDeTienda`) y se cambia de tienda. La lista para elegir tienda de recojo queda solo para una bolsa vieja sin tienda.
8. **Looks:** «Arma tu look» muestra los looks de CAYLA (lámina con sus números, nombre y precio) y un botón **siempre a la vista**, «Arma tu look personalizado», que lleva al probador; «Arma el tuyo» ya no es un enlace de la cabecera. Entrar y Crear cuenta: cabecera de solo logo, título simple, Google debajo de «Entrar» y sin el panel del Club en el celular.

## Lo que cambia para el negocio (y es de Felipe)

- **El precio que ve el cliente es el de su tienda, nunca el «mayor entre tiendas».** Con tiendas de precio distinto, quien llega sin elegir ve el de Arequipa.
- **El botón «Arma tu look personalizado» ya no se esconde** cuando no hay prendas que probar (ADR-0434 / decisión de Felipe del 2026-10-17: «sin recortes, la entrada no sale»): el probador dice «Pronto podrás armar tu look aquí».
- **La franja negra de arriba se queda a la vista** (Felipe 2026-10-19: «que la barra aparezca, no la ocultes»): la campaña y las frases siguen rotando.

## Descarté

- Un «Todas» con otro nombre («Ambas»): no resuelve que el precio sea de una tienda real.
- Un selector solo en el catálogo o quitarlo del todo: la tienda decide el precio y el stock, y tiene que verse siempre.
- Una redirección en el `proxy`: no conoce la lista de tiendas (está en la base); se hace en cada página con `sedeDeLaPagina`.

## Pruebas

`lib/sede-elegida.test.ts` (resolver y `soloTiendas`, 5 casos nuevos); `pnpm --filter tienda test` (669), typecheck de tienda y web, lint y `pnpm knip`. Medido a 1440, 1200, 390, 360 y 320 px: sin choques entre el logo, la navegación y la tienda. Faltan: «Separar» de punta a punta con una cuenta de la pila de clientes, el vuelo del corazón con un favorito real, y las capturas a 375 px que pide la plantilla del PR.
