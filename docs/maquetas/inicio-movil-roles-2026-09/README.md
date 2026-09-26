# Inicio por rol, computadora y celular: demo + spike (2026-09-26)

Esta carpeta tiene dos archivos:

- **`inicio-spike.html`** es el spike final, con lo que Felipe eligió. Su barra oscura solo cambia el rol, la hora y si
  hay algo urgente.
- **`demo.html`** es el demo comparativo con el que se eligió.

Los dos son autocontenidos: el isotipo va incrustado.

## Decisiones de Felipe tras el demo (2026-09-26)

| Tema | Decisión | Qué cambia respecto de hoy o del #389 |
|---|---|---|
| Accesos | Avisos tocables, fila de accesos rápidos del rol y «Vender» fijo abajo en celular (en computadora, «Vender» va en la cabecera) | Se reabre «el Inicio no lleva a módulos» del #389. Solo hay avisos y accesos de módulos que el rol ve (ADR-0161) |
| Orden en celular | **C**: el mismo orden para todos. Cifras del día → Te toca → Accesos → Equipo de hoy | En celular «Te toca» muestra 3 avisos y «Ver N más», pero lo urgente siempre queda arriba del corte |
| Actividad reciente | Se reemplaza por **«Equipo de hoy»**: quién está, desde qué hora y su última acción (`retail.actividad`, ADR-0207) | La vendedora ve nombres y solo su propia acción. La líder ve las ventas de cada una |
| Urgente (no se puede ocultar) | SUNAT atascado y caja con diferencia (**siempre**: candado en lugar de interruptor), apartado que vence hoy, factura de proveedor vencida, prendas sin regularizar por más de 2 días y orden de taller atrasada | El resto de los avisos se puede ocultar en «Ajustar» |
| Filtro personal | Arranca con lo recomendado para el rol y se guarda **por cuenta**. Es modal en computadora y hoja desde abajo en celular | Decidido por Claude: las terminales que venden no llegan al Inicio (`aterrizajeDe`), así que el filtro sigue a la persona |

**Lo que no cambia:** ADR-0206 (en celular el menú es el ☰; el botón fijo es una acción de esta pantalla, no una barra de
navegación), ADR-0169 (tokens), y que cada bloque falle por separado.

---

# Demo comparativo

`demo.html` es un archivo autocontenido: se abre en el navegador y el isotipo va incrustado. Los datos son
inventados. **No es el spike final ni una implementación**: no toca `app/(app)/page.tsx`, `AppShell.tsx` ni la base.
Sirve para elegir, con la barra oscura, entre las opciones abiertas. Las dos vistas se dibujan juntas.

## El pedido (Felipe, 2026-09-26)

Sumar al Inicio las pantallas nuevas (Apartados, Posventa, Compras, Finanzas, Conteo, Producción) y que funcione bien
en el celular, que es donde la mayoría de las trabajadoras pasa el día. Antes de hacer el spike, Felipe pidió cuatro
cosas:

1. Investigar cómo resuelven el celular otros sistemas de venta (3 a 5).
2. Un filtro personal de avisos, con valores por defecto por rol y sin poder ocultar lo urgente. Se afina con preguntas.
3. Un demo de qué ve primero la vendedora en su teléfono.
4. Probar las 3 opciones de «Actividad reciente» y la combinación de la 1 con la 3.

## Controles del demo

| Control | Opciones |
|---|---|
| Ver como | Líder de tienda · Vendedora · Almacén · Taller |
| Hora | 9:30 a. m., sin ventas (cómo se ve el Inicio vacío) · 5:40 p. m. |
| Algo urgente | Enciende SUNAT atascado, caja con diferencia, apartado que vence hoy y factura vencida |
| Celular: qué va primero | A · Su día + Vender · B · Lo que le toca · C · Igual que la líder |
| Actividad reciente | 1 · De turno ahora · 2 · Quitar · 3 · Actividad útil (`retail.actividad`, ADR-0207) · 1+3 · Equipo de hoy |
| Accesos | Sin accesos (#389) · Avisos tocables + Vender fijo · más accesos rápidos del rol |
| «Ajustar» (en «Te toca») | Hoja del filtro personal, en **borrador** |

## Lo que se respeta

- **ADR-0206:** en el celular no hay barra inferior de navegación. «Vender» + escáner fijos abajo son una acción de
  esta pantalla, igual que la `BarraFija` de otras pantallas.
- **ADR-0161:** solo aparecen avisos de módulos que el rol ve, así que un aviso tocable nunca lleva a «Sin acceso».
- **ADR-0169:** tokens de `globals.css`. El rojo solo marca lo urgente.
- **#389:** la vendedora ve solo lo suyo, nunca las cifras de la tienda ni las de sus compañeras.

## Investigación: 5 referentes

Estos cinco son los que tienen documentación pública suficiente. Lightspeed, Clover, Odoo, Zoho y Loyverse solo
tienen material de marketing sobre su inicio móvil.

| Sistema | Vendedor ve primero | Gerente ve primero | Navegación | Personaliza | Urgente |
|---|---|---|---|---|---|
| Shopify POS | Cuadrícula para vender | Cifras + tareas + «acciones urgentes» | Barra inferior + **carrito fijo** | Por sede o plantilla, con permiso | Destacado en Home |
| Square | Su turno / cobrar | Ventas + **«Who's working»** | Barra, máx. 4 herramientas elegidas | Cada usuario elige herramientas | Notificaciones no se quita (foro, no oficial) |
| Toast | **Su turno y lo suyo** | Cifras → equipo → bitácora | 5 pestañas | Por permisos | Punto rojo |
| Dynamics 365 Commerce | Mosaico Tareas | Asignar tareas | Cuadrícula + campana | **Por rol + ajuste por usuario** | Contador en el botón + destello |
| Zebra Workcloud | **Lista ya priorizada** | Paneles de cumplimiento | ☰ hamburguesa | Fijar tareas | Priorización |

Fuentes:
[Shopify smart grid](https://help.shopify.com/en/manual/sell-in-person/getting-started/smart-grid) ·
[Shopify carrito fijo](https://changelog.shopify.com/posts/keep-the-cart-in-view-on-mobile-pos) ·
[Square Dashboard app](https://squareup.com/help/us/en/article/5618-get-started-with-the-square-dashboard-app) ·
[Square permisos](https://squareup.com/help/us/en/article/5822-employee-permissions) ·
[Toast Now](https://support.toasttab.com/en/article/Get-Started-with-the-Toast-Now-App) ·
[MyToast Home](https://support.toasttab.com/en/article/The-MyToast-App-Today) ·
[D365 tareas en POS](https://learn.microsoft.com/en-us/dynamics365/commerce/task-mgmt-pos) ·
[D365 notificaciones](https://learn.microsoft.com/en-us/dynamics365/commerce/notifications-pos) ·
[Zebra Workcloud](https://www.zebra.com/us/en/software/workcloud-solutions/workcloud-enterprise-collaboration-suite/workcloud-task-management.html)

**Patrones que se repiten:**

1. El rol decide la pantalla sin preguntarle nada a la persona.
2. La vendedora ve «lo mío y lo siguiente»; el encargado ve cifras de la sede y quién está.
3. El contador va en el acceso mismo y abre la lista ya filtrada, en lugar de un feed.
4. Lo urgente va por un canal que no se apaga o queda fijado arriba.
5. La acción principal queda siempre a mano.
6. La personalización tiene límites: se eligen cosas dentro de lo permitido, lo crítico nunca se oculta.
7. Ninguno de los 5 documenta un feed automático de actividad en el inicio.

**Lo que no se copia, por escala** (3 tiendas + 1 taller):

- Apps separadas por rol, como Toast.
- Priorización con IA, como Zebra.
- Un diseñador de pantallas por perfil desde la central, como D365.

Alcanza con valores por defecto por rol en código y un «Ajustar» liviano.

## Lecturas que necesitaría la implementación

Ya existen en `lib/`: `getApartadosAbiertos`, `getDevolucionesPendientes`, `getPedidosNoAtendidos`,
`getTrasladosPorAtender`, `getConteoAbierto`, `contarVencidas`, `getDeudaPorVencimiento`, `contarComprobantesAtascados`,
`getAperturasPorRevisar` y `retail.actividad` (ADR-0207).

Faltan: mercadería por recibir, efectivo sin depositar, estado del cierre de mes, próximo vencimiento de impuestos,
órdenes de producción atrasadas, insumos bajo mínimo, cifras del día de almacén y taller, ventas por persona de turno, y
dónde se guarda el filtro personal (preferencia por cuenta).
