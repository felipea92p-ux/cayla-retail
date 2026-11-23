# Lo que quedaba de la letra: Finanzas, Clientes, Tienda web, Configuración y el resto — 2026-11-23

Rama `claude/letra-finanzas-y-resto`, sobre `main` (las actividades 1 a 6 ya entraron: PR #1978, #1981, #1984, #1986 y #1988).
Actividad 7 de las ocho mejoras de estética. ADR-0691. Sin migraciones.

## Hecho

- [x] **Letra (TSX):** 285 tamaños a mano de 120 archivos pasaron a la escala: Finanzas, Clientes, Tienda web, Configuración,
      Colaboradores, Producción y Órdenes de insumos, el Inicio (Observatorio e Inicio de almacén), Actividad, Buscar, «Sin acceso» y
      el login.
- [x] **Letra (hojas):** 619 tamaños de 30 hojas pasaron a `var(--text-…)`: las cinco de Finanzas, Estados financieros, el telar, el
      Observatorio, el Inicio de almacén, el club, Tienda web y su configuración, Tráfico, las vistas y vitrinas de Configuración,
      Producción, los rótulos, el perfil, el login y varias de vidrio.
- [x] **La barrera global de error:** sus tamaños van escritos en línea porque no carga las hojas de estilo. Los de 11 px subieron a 13.
- [x] **Letra fija, con su motivo:**
      la letra de los dibujos de los gráficos de Finanzas y de «Qué debes» (va en unidades de su lienzo), las siglas y los vistos dentro
      de un círculo, el número de una parada del Inicio de almacén, la cifra del anillo chico de 40 px, el texto del centro de la dona
      de «Cuentas y dinero», la guía de traslado que se imprime y, como archivo entero, la vista previa de la tienda web en miniatura.
- [x] **La prueba de letra legible de Finanzas** (`lib/finanzas-letra-legible.test.ts`) leía píxeles de la hoja «Qué debes». Ahora
      traduce los escalones de la escala con la misma definición que usa el candado. El título de «En qué se va» pasó de 15 a 16 px.
- [x] **Deuda de letra:** de 971 a 25 (de 154 a 2 archivos). Empezó en 2.583.
- [x] **Texto:** 13 frases.

| Dónde sale | Hoy | Ahora |
|---|---|---|
| Clientes ▸ Fichas, nota | «No reciben novedades»: miembros que aún no las pidieron por WhatsApp; solo les llegan los avisos informativos. | «No reciben novedades»: aún no las pidieron por WhatsApp. |
| Clientes ▸ Avisos, nota | «Enviar» abre WhatsApp Web con el mensaje escrito: aprietas Enter y vuelves. Máximo 2 promociones al mes por miembro, y 1 de cada 5 no las recibe, para medir si sirven. Si alguien responde BAJA, márcalo con «Pidió BAJA». | «Enviar» abre WhatsApp Web con el mensaje escrito. Máximo 2 promociones al mes por miembro; 1 de cada 5 no las recibe, para medir si sirven. Si responde BAJA, márcalo con «Pidió BAJA». |
| Clientes ▸ Cartel del club, nota | Antes de pegarlo, escanéalo con un celular: tiene que abrir la tienda online, cayla.pe. Ahí el cliente crea su cuenta y entra al Club. Al imprimir, papel A4 y, si el navegador pregunta por los márgenes, «Ninguno»: el fondo va hasta el borde de la hoja. | Antes de pegarlo, escanéalo con un celular: tiene que abrir cayla.pe. Al imprimir, papel A4 y márgenes en «Ninguno». |
| Finanzas ▸ Por pagar, nota | «Pagar» abre el mismo pago de Compras o, para lo del Taller, el de Producción: el pago queda en su factura. Un servicio sin papel no tiene fecha: se debe desde que devolvió las prendas. | «Pagar» abre el pago de Compras o, para lo del Taller, el de Producción. Un servicio sin papel se debe desde que devolvió las prendas. |
| Finanzas ▸ Cierre de mes, nota | Cierra y reabre quien tiene el módulo Cierre de mes (el líder, siempre). Reabrir pide motivo y queda en la historia; reabrir una tienda reabre también CAYLA entera. Lo de hoy nunca se bloquea: una devolución o una anulación de hoy sobre una venta de un mes cerrado va al mes de hoy. | Cierra y reabre quien tiene el módulo Cierre de mes. Reabrir pide motivo y reabre también CAYLA entera. Lo de hoy nunca se bloquea: una devolución de hoy sobre una venta de un mes cerrado va al mes de hoy. |
| Producción ▸ Cotizaciones de maquila | Lo que cobraría un taller externo por maquilar cada tipo de prenda — la referencia contra la que se mide el Taller. Una fila por tipo de prenda: la más reciente. Renovar es cargar una cotización nueva; ninguna se edita para "actualizarla". | Lo que cobraría un taller externo por cada tipo de prenda: contra eso se mide el Taller. Para renovar una, carga una nueva. |
| Producción ▸ fuera del Taller | Ahora estás mirando desde «Tienda Lima». Cambia la sede en el selector de arriba y elige el Taller para ver las órdenes y los insumos. | Estás en «Tienda Lima». Elige el Taller en el selector de arriba. |
| Salud del negocio ▸ qué falta para sugerir | Para sugerir qué colgar, trasladar, producir o comprar, cada tienda necesita tres cosas: que al menos 9 de cada 10 prendas vendidas se registren con su prenda durante 14 días seguidos, el piso cuadrado y el almacén contado. | Para sugerir, cada tienda necesita tres cosas: 9 de cada 10 ventas con su prenda durante 14 días seguidos, el piso cuadrado y el almacén contado. |
| Salud del negocio ▸ elegir una sede | CAYLA Global es para ver y decidir sobre toda la empresa. Lo del día —vender, cobrar, contar, recibir— se hace parado en una sede, para que cada movimiento quede anotado donde pasó. ¿En cuál? | Lo del día —vender, cobrar, contar, recibir— se hace desde una sede. ¿En cuál? |
| Sin acceso | Lo que ve cada cuenta lo decide su rol. Si necesitas entrar aquí, pídele a un líder de equipo que lo active en Colaboradores, en la pestaña Roles y accesos. | Si necesitas entrar aquí, pídele a un líder de equipo que lo active en Colaboradores ▸ Roles y accesos. |
| Rótulos de anaquel, nota | Sale en el mismo papel que las etiquetas de precio (62 × 40,1 mm): no hay que cambiar nada en la Brother. Si sale corto, chico o girado, la guía de impresión lo muestra paso a paso. | Sale en el mismo papel que las etiquetas de precio (62 × 40,1 mm). Si sale corto, chico o girado, la guía de impresión lo muestra paso a paso. |
| Tienda web ▸ Conf. Tienda, nota | El WhatsApp de cada tienda es el del QR del club: cambiarlo aquí lo cambia también en el cartel. Por ahora no hay envíos: todo pedido se recoge en tienda. | Cambiar el WhatsApp aquí lo cambia también en el cartel del club. Todo pedido se recoge en tienda. |
| Tienda web ▸ Campañas, nota | Al terminar, la tienda vuelve sola a su diseño. Sin diseño, la campaña sale en la franja de arriba con su cuenta regresiva. | Al terminar, la tienda vuelve sola a su diseño. Sin diseño, la campaña sale en la franja de arriba. |

- [x] Medido en 68 vistas (55 a 1440 × 900 y 13 a 375 × 812). En las 61 comparables: textos bajo 13 px 390 → 114, 0 textos cortados
      nuevos, 0 desbordes. Repetido en oscuro.
- [x] Nada se guardó en la base: las vistas solo abren pantallas.

## Pendiente

- [ ] **Los 25 que quedan en la deuda**, las dos piezas que no se tocaron a propósito:
      el aviso de cierre de caja de la cabecera (`recordatorio-cierre.css`, 14; ninguna tienda local tiene hora de cierre, así que no
      se puede ver) y los ejes y cifras de los gráficos (`graficos-tiempo.css`, 11; su posición se calcula con el tamaño de su letra y
      son piezas que Felipe eligió mirando: piden una lámina).
- [ ] **Retirar el puente** (`app/estilos/letra.css`). Ya no lo usa ninguna clase de la interfaz: solo quedan tamaños a mano dentro
      de la vista previa de la tienda web, que es papel y el puente no toca. Se deja hasta que entren los PR abiertos de otras sesiones
      (#1969, #1980), por si traen un tamaño a mano; después se borra el archivo y la prueba que pide sus cuatro bloques.
- [ ] **Que Felipe revise el tono** de las 13 frases. A mirar: la nota de Cierre de mes (perdió «el líder, siempre» y «queda en la
      historia») y la de Por pagar.
- [ ] **Las frases largas de Finanzas no se tocaron.** Hay unas 80 de 18 palabras o más y casi todas las arma una regla con cifras
      del mes («Tienes S/ 290 y lo que ya tiene dueño suma…»). Son plata: acortarlas es de Felipe, una por una.
- [ ] **El glosario de Comercial** (cinco definiciones de 29 a 58 palabras) y el de Calidad: no se tocaron. Irían mejor detrás del «?».
- [ ] **Sin ver en pantalla:**
      el Inicio de almacén (lo ve la cuenta de almacén; su sesión de prueba estaba vencida), Producción dentro del Taller (la cuenta
      de prueba estaba en Tienda Lima), las hojas y modales de Finanzas, y el «antes» de las siete pantallas de Tienda web (salieron
      redirigidas; su «después» sí se miró).
- [ ] **Dynamic:** queda como tarea allá. Cambiaron siete hojas de `app/estilos/vidrio/` (`estados.css`, `config-vistas.css`,
      `vitrinas-sedes.css`, `ingresos.css`, `pantalla.css`, `inicio.css`, `campos-y-botones.css`): solo el tamaño de la letra, que
      ahora pide la escala. `pantalla.css` y `campos-y-botones.css` son piezas del sistema; sus tamaños no cambiaron de valor (14 →
      14, 13 → 13), salvo un 12 → 13 y un 19 → 18.
