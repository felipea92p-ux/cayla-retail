## 2026-10-13 (/unificar: ronda 9, las seis que dejaron abiertas las rondas 6–8, decididas y migradas)
Qué hice: traje las herramientas de migración (`unificar:ver`, `unificar:rellenar`, `MIGRAR.md`) y armé una página de elegir con las seis
preguntas que la migración de las rondas 6–8 no podía decidir por regla, con lo de hoy copiado del DOM real del ERP (para que se viera y se
moviera igual) y las propuestas con las clases reales, todo vivo. Felipe eligió P1 · P1 · P1 · P1 · P2 · P2. Construí `ListaSugerencias`
(la lista de todo combo con su fila rica y la tecla «Enter»), los apartados con título en `DesplegablePildora` y el globito de cuántos hay
en los títulos (`cuenta`), y migré: Llegó mercadería, Recibir contra factura y Registrar nota de crédito (la prenda sin foto con
`MiniaturaPrenda`), la planilla de Contar con la cara de la tabla del sistema (y la talla recién contada que respira en verde), Frescura
con píldoras, «Desactivar color» rojo en el pie (y, por pedido de Felipe, la hoja de Proveedor sin su «Desactivar», que ninguna
pantalla mostraba), ocho acciones chicas a botón y doce títulos con su número en el
globito. Deuda de `/unificar`: 4 → 0 en todas las familias. Dos firmas nuevas (desactivar como enlace; un conteo puesto como dato).
Por qué así: «una función, una pieza» (ADR-0358) se decide mirando y tocando, y migrar cambia cómo se ve, nunca qué hace: el Enter de la
pistola sigue tomando la primera, «Desactivar» sigue pidiendo dos toques, la planilla sigue siendo un `<table>` para que cada talla se
redibuje sola con 800 en pantalla. Contar se verificó en una página de ensayo con datos en memoria (la base local no tenía un conteo
abierto y no se crean datos en la base compartida para una foto), borrada antes del commit.
Felipe se lleva: el ERP sin deuda de `/unificar`, las fotos de después en claro y oscuro (`docs/unificar/capturas/*.ronda9.jpg`) y la
suite entera en verde (449 archivos, 158 150 pruebas). Y una alerta de disco: el `next dev` de esta worktree servía un CSS de hace una
semana (Turbopack) y su `.next` creció 4 GB en media hora; Felipe lo borró (18 GB).

## 2026-10-13 (/unificar: el censo de después de las rondas 6–9, rastreado al código, y la ronda 10 armada)
Qué hice: con el disco liberado (Felipe borró el `.next` de esta worktree), corrí el censo completo (Admin, 252 de 277 vistas) y no me
quedé con sus cifras: seguí cada variante hasta su archivo. Encontró lo que las firmas no veían: 10 títulos a mano (la firma de títulos en
sans tenía un `\b` después de `text-[15px]`, que nunca coincide), 4 «Ver … →» en versalitas, 2 casillas con cara propia (`peer-checked`),
5 «+ Agregar …» en versalitas grises y la caja «Producto» de Nueva compra encogida a 78 px (la caja de la ronda 6 se deja encoger y la
columna de «Talla y color» se quedaba con todo). Todo migrado o arreglado, con tres firmas nuevas o corregidas. La auditoría de modo
oscuro de las pantallas tocadas encontró 4 textos del detalle del cierre de Caja (de otra rama) que solo fallaban en oscuro: arreglados.
Las guías de las 22 pantallas tocadas recorren bien (y Cambios, Devoluciones y Apartados a 375 px); dos del plan de compra no tienen datos
en la base local. Y armé la ronda 10 (descargar, filtros, ver en otra pantalla) con ese censo.
Por qué así: una firma del CI solo ve lo que alguien supo describir; el censo ve la pantalla. Cruzar los dos es lo único que encuentra lo
que se escapa, y migrar sin mirar el resultado dejó un campo inservible en Nueva compra que nadie habría visto hasta usarlo.
Felipe se lleva: el ERP más parejo de lo que decía la deuda, Nueva compra usable otra vez y la página de la ronda 10 para elegir.

## 2026-10-13 (/unificar: ronda 10 decidida y migrada, y el censo del mostrador rastreado al código)
Qué hice: Felipe eligió tocándolas las tres P1 de la ronda 10. Construí `<BotonDescargar>` («Descargar» + qué, con el ícono que baja) y
`<BotonVer>` (el secundario con la flecha que avanza), y `<BotonFiltros>` dejó sus dos caras por la de una píldora con su número en el
globito. Migré 17 descargas (Compras, Historial, las seis pestañas de Reportes, Existencias, Movimientos, Clientes, el ajuste de inventario y
el plan de campaña) y 17 «ver en otra pantalla» (seis eran botones negros); la acción de un vacío sigue negra con su `unificar-fijo`. De
paso, la caja del «+» dentro de `<Boton>` hacía crecer el botón 3,5 px sobre sus vecinos (43 contra 40 en la misma cabecera): pasó a `flex`.
Después rastreé al código el censo del mostrador (cuenta del terminal de ventas): encontró en Caja frases grises sueltas que la ronda 5 ya
prohibía, y al buscarlas en todo el ERP eran 49 en 40 archivos («Sin ventas todavía.», «No hay tickets en espera.»…). Pasaron a `<Vacio>`,
con una firma nueva que las ve, y tres «Ver todos →» de Caja pasaron a `<EnlaceVer>`. En la vista rápida del proveedor, «Desactivar» pasó a
rojo como en la del producto.
Por qué así: «Descargar» se entiende antes que «Exportar»; un botón negro dice «esto es lo principal de aquí», y llevar a otra pantalla casi
nunca lo es. Clientes a 375 px pedía sus tres botones en una fila: «Descargar» a secas y 8 px entre ellos (342 de 343 px).
Felipe se lleva: tres familias más con una sola pieza (25 de 41), deuda 0 en todas, la firma de vacíos que ya no deja pasar una frase gris, y
las fotos de antes y después en `docs/unificar/capturas/accion.*.jpg`. Verificado: modo oscuro de 15 pantallas tocadas (0 hallazgos solo en
oscuro; los 4 heredados ya fallaban en claro), 25 guías recorridas en verde a 1440 px (las de Producción, con la cuenta del Taller) y
Vender, Historial y Clientes a 375 px con la cuenta del mostrador; suite entera, tipos y lint en verde en cada commit.

## 2026-10-14 (/unificar: ronda 11 — cancelar, limpiar e imprimir — armada, decidida y migrada)
Qué hice: un censo nuevo de las tres familias (Admin y el terminal del mostrador) rastreado al código, y una página de elegir con demos vivas.
Felipe eligió P1 · P2 · P1. Construí el pie de una hoja (`pie-acciones` / `<PieAcciones>`: «Cancelar» a su medida antes del botón que guarda,
los dos a la derecha, lo que borra a la izquierda, mitades en el celular), `<FiltroPuesto>` y `<BotonLimpiar>` (la píldora de los vacíos y
«Limpiar todo» punteado) y `<BotonImprimir>` (la impresora, «Imprimir» + qué, la hoja que sale al pasar el mouse). Migré 116 pies en 86
archivos, 8 filtros puestos, 11 «Limpiar» y 24 botones de imprimir; tres «Cancelar» que iban después de «Guardar» pasaron antes; «Cancelar
conteo» pasó a rojo (anula); el secundario del flujo del mostrador habla en letra normal con sus 48 px.
Por qué así: la colaboradora busca «Cancelar» siempre en el mismo lugar; un pie a media fila hacía que «Cancelar» pesara tanto como guardar.
La regla del pie va sin `@layer` para mandar sobre los `flex-1` de antes: la migración cambió cajas, no cientos de botones.
Felipe se lleva: tres familias más con una pieza (28 de 41), deuda 0, y verificado en claro, oscuro y a 375 px (Vender, Historial, Cambios,
Devoluciones, Apartados), 15 guías en verde y la suite entera (475 archivos).
