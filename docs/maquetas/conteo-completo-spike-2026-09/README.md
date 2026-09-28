# Spike — Conteo, interfaz completa y funcional (2026-09-28)

Recreación interactiva de `/inventario/conteo` de punta a punta, sobre la pantalla ya rediseñada (ADR-0174):
no es una decisión de negocio, es material para revisar el flujo completo antes de tocar código. Todo corre en el
navegador con un catálogo de 12 variantes de muestra — sin backend, sin Supabase. Abrir `conteo.html` (fuentes por
CDN, sin servidor).

## Qué se puede hacer de verdad
- **Abrir un conteo**: elegir lugar (Piso de venta / Almacén), alcance y responsable; el botón se habilita solo
  cuando falta lo mínimo, igual que `ConteoPanel.tsx:249-254`.
- **Escanear de verdad**: escribe `CMS-0001-BLA-L` (o cualquier SKU de la lista de «Faltan por contar») y Enter —
  suma como lo haría una pistola. Prueba también un código a medias para ver las coincidencias, o uno inventado
  para ver el aviso «Dar de alta esta prenda» (crea una variante nueva y la cuenta, simulando el alta al vuelo).
- **Anotar a mano**: toca cualquier pastilla de talla en «Faltan por contar» — abre el formulario «Escribir
  cantidad», igual que `anotar()` en el componente real.
- **Cámara simulada**: el botón «Cámara» no pide permisos de verdad (no tiene sentido en un spike) — abre una
  bandeja donde «Simular una lectura» cuenta una prenda pendiente al azar, para mostrar el concepto de la lectura
  en ráfaga sin depender de `getUserMedia`.
- **Revisar y cerrar**: recién ahí aparece la cifra del sistema por variante, con la diferencia en unidades y
  soles; las prendas que el sistema tiene pero nadie contó piden una decisión («No está → 0» / «Dejar como está»)
  antes de poder cerrar — el botón queda inhabilitado hasta que todas estén decididas, como en `RevisarCierre`.
  «Recontar las N con diferencia» las manda de vuelta a «Faltan», marcadas en ámbar.
- **Cerrar de verdad** actualiza las tres cifras de arriba (Exactitud, Conviene contar primero, Último conteo) y
  agrega una fila al historial de abajo — el ciclo se puede repetir (abre un Conteo 7, etc.).

## Incluye el spike anterior
Las dos correcciones de `docs/maquetas/conteo-affordances-spike-2026-09/`: el subtítulo fijo bajo «Cómo se anota
la cantidad» y las pastillas de talla con borde firme + «+» — aquí ya no son un toggle antes/después, están
integradas como la propuesta final.

## Cómo revisarlo
La barra de arriba (no es parte de la pantalla) tiene un selector **Momento** que salta directo a «Sin abrir» /
«Contando» / «Cerrado» con datos representativos, sin tener que recorrer el flujo a mano cada vez. «↺ Reiniciar
demo» vuelve todo al estado inicial. Verificado en claro/oscuro y a 375 px (celular): el lateral se pliega, las
tres tarjetas de cifras pasan a una columna, y aparece la barra fija «Escanear con la cámara» abajo — solo
mientras hay un conteo en curso, igual que en la app real.

## Simplificaciones a propósito
- 12 variantes de muestra en vez de las ~130 reales — para que el flujo se pueda recorrer completo en la demo.
- «Sistema» (para la tabla de Revisar) es un número fijo por variante, no viene de `stock` real.
- El alta al vuelo es de un solo paso (nombre genérico «Prenda nueva») — el real (`AltaAlVuelo`) pide marca,
  proveedor, categoría y tallas; ver ADR-0109.
- El lateral, la cabecera y «Conviene contar primero» son contexto, no la propuesta — están para que la pantalla
  se sienta completa, no para revisarlos.

## Pendiente
Sigue esperando el OK de Felipe para llevar las dos correcciones de affordance a `ConteoPanel.tsx`. Este spike no
agrega una decisión nueva sobre la lógica de negocio — confirma que el flujo ya construido (ADR-0174, «Conteo
conectado» del 2026-09-26) se sostiene de punta a punta con las dos mejoras puestas.
