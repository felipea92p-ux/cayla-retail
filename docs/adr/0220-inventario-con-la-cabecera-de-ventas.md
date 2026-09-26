# ADR-0220 — Inventario usa la cabecera de Ventas (`EncabezadoPagina`)

**Fecha:** 2026-09-26
**Estado:** Construido (pedido de Felipe: «que el header de todos los módulos de inventario tome como referencia los de
Caja, Historial, Postventa»). `pnpm typecheck` y `eslint` limpios. Se miró en el navegador con una ruta temporal sin
sesión que dibuja las cabeceras con las mismas props que cada pantalla, más los componentes reales de Conteo y del
detalle de Conteo con datos de muestra, a 1440 y a 375 px. **No se miró con sesión real contra la base.**
**Afecta:** `apps/web/app/(app)/inventario/{page,movimientos,traslados,resumen,bajar,mover}`, `traslados/[id]/page.tsx`,
`resumen/loading.tsx`, `components/ConteoVista.tsx`, `components/ConteoDetalleVista.tsx`, `components/ui/EncabezadoPagina.tsx`
(título y frase aceptan más que texto). No toca la base.
**Reemplaza en parte:** ADR-0216 (la cabecera de Inventario; lo de las fotos sigue en pie) y el punto 4 de ADR-0169
(«el orden oficial de una pantalla» empieza con `CabeceraPantalla`).

## Contexto

El ERP tenía dos cabeceras para el mismo trabajo, y el mismo día (ADR-0216) Inventario había quedado entero en una:

- `EncabezadoPagina` (Atelier, ADR-0123): Caja, Historial, Cambios, Devoluciones, Comprobantes, Pedidos no atendidos. Arriba
  la sede y la fecha con el hilo taupe que se dibuja; título de 46 px con el nombre de la pantalla; una frase; a la
  derecha las cifras (`ResumenSede`) o el reloj de Caja; las acciones bajo la frase.
- `CabeceraPantalla` (ADR-0169): Inventario, Finanzas y cuatro pantallas sueltas. Sobretítulo rojo, título de 30 px (en
  Existencias y Movimientos, la sede), bajada y acciones a la derecha.

ADR-0169 dejaba las dos conviviendo «hasta que Ventas pase a la guía oficial». Felipe eligió lo contrario para la
cabecera: la de Ventas es la que manda, y Inventario pasa a ella.

## Decidí

Las 9 pantallas de Inventario usan `EncabezadoPagina`, con las mismas reglas que ya siguen las de Ventas:

- **La sede va arriba, nunca de título.** El título es el nombre de la pantalla tal como lo dice el menú: Existencias,
  Movimientos, Traslados, Conteo, Análisis. Las subpantallas conservan el suyo (Bajar prendas al piso, Mover mercadería,
  Traslado 12, Conteo 4 · Almacén de tienda).
- **Las acciones van bajo la frase (`pie`)**, como «Registrar movimiento» y «Cerrar caja» en Caja. «← Traslados»,
  «← Conteos» y «← Existencias» (Bajar al piso, que antes era un enlace suelto sobre el sobretítulo) son botones del pie.
- **Existencias no lleva reloj vivo:** `sinHora` y, en la línea de arriba, «vista de las 10:21». Su stock es una foto del
  momento en que se cargó (la app no sincroniza en segundo plano); un reloj que corre encima haría creer que está al
  minuto. Se pierde «— recarga para ver lo último», que pedía una acción que la pantalla no ofrece
  (`docs/pantallas/inventario.md`, tarea #11).
- **La insignia del detalle de Traslado** va en la línea del título en un `inline-flex` con `align-middle`: suelta, en la
  serif de 46 px colgaba bajo la línea base (medido: su centro, 3 px por debajo con `inline-block`; con `inline-flex`,
  9,6 px por encima, la mitad de la «x»). Antes iba pegada al número, sin espacio.
- El esqueleto de carga de Análisis copia la silueta nueva (título de 46 px), para que no salte al cargar.

## Descarté

- **Mover las cifras de Inventario a la caja de la derecha (`ResumenSede`)**, como Cambios e Historial: esa caja lleva
  número, etiqueta e ícono, y las tarjetas de Inventario dicen más por cifra (el desglose por tipo en Movimientos,
  «153 uds disponibles en almacén para bajar al piso» en Existencias, la tarjeta que filtra la tabla). Moverlas perdía
  esa información o obligaba a ensanchar `ResumenSede`. Las cifras siguen donde estaban.
- **Dejar las acciones a la derecha**, como en `CabeceraPantalla`: en la cabecera de Ventas la derecha es de las cifras o
  del reloj. Botones a la derecha era mezclar las dos cabeceras en una.
- **Conservar «Traslados entre sedes», «Conteo físico» y «Análisis de inventario»**: en Ventas el título es la palabra del
  menú (Caja, Historial, Comprobantes). Lo que se tocó en el menú es lo que se lee en grande.
- **Cambiar los botones a los de Caja (`Boton`, en versalitas)**: el resto de cada pantalla de Inventario usa `btn-cayla`;
  cambiar solo los de la cabecera dejaba dos botones distintos en la misma pantalla.

## Números

Medidos en la ruta temporal a 1440 px (contenido de 993 px):

- La cabecera de Existencias pasa de 114 px a 184 px: «Prioridades de hoy» baja 70 px. ADR-0216 la había bajado de
  225 a ~80 px esa misma mañana, así que queda entre las dos.
- Movimientos, 130 px; detalle de Traslado, 162 px. A 375 px no hay desborde horizontal: la línea de sede y fecha se
  parte en dos, igual que en Cambios.

## Lo que no se tocó, a propósito

- **Recibir mercadería (`/recibir`) e Ingreso sin comprobante (`/inventario/recibir`)**: tienen una tercera cabecera
  (sobretítulo + título de 24 px, sin componente), `/recibir` la comparte con Compras y su frase cambia por vista y pasa
  de 200 caracteres. Van en otra ronda, si Felipe quiere.
- **Finanzas sigue con `CabeceraPantalla`**: su diseño es un spike aprobado (ADR-0195).

## Se rompe si

- Una pantalla nueva de Inventario sigue la regla vieja («pantalla nueva: `CabeceraPantalla`»). Por eso CLAUDE.md ahora
  dice que la cabecera es la del módulo.
- Una pantalla vuelve a poner la sede de título: la sede ya está en la línea de arriba y se leería dos veces.
- Alguien le agrega un refresco automático a Existencias sin volver a leer la hora de carga: «vista de las» mentiría. Hoy
  la hora se calcula en el servidor en cada render, así que un `router.refresh()` la actualiza sola.

## Queda abierto (decisión de Felipe)

El ERP sigue con tres cabeceras: `EncabezadoPagina` (Ventas, Inventario), `CabeceraPantalla` (Finanzas, Actividad, Parte
de compra, Nuevo producto, Etiquetas) y la escrita a mano (Catálogo, Compras, Producción, Colaboradores, Clientas,
Comercial, Recibir, Inicio). Cuál manda para las que no son de Ventas, Inventario ni Finanzas no se decidió aquí.
