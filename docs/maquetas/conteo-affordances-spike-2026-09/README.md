# Spike — affordances de Conteo (2026-09-28)

Dos correcciones puntuales a `apps/web/components/ConteoPanel.tsx`, sobre la pantalla ya rediseñada (ADR-0174).
No es una decisión de negocio ni cambia información en pantalla — es un ajuste visual sobre piezas que ya existen.
Abrir `conteo.html` (fuentes por CDN, sin servidor).

## Qué compara
1. **Subtítulo bajo «Cómo se anota la cantidad»** (`ConteoPanel.tsx:870-882`): hoy la diferencia entre «Suma por
   escaneo» y «Escribir cantidad» solo se explica en el cuadro vacío de abajo, después de elegir. Se agrega una
   línea fija que dice qué hace el modo elegido, antes de escanear la primera prenda.
2. **Pastillas de talla en «Faltan por contar»** (`ConteoPanel.tsx:1122-1134`): hoy tienen el mismo peso visual que
   una etiqueta informativa; la única pista de que se tocan está en un párrafo de texto arriba. Se les da borde más
   firme en reposo y un «+» que dice qué hacen sin depender de ese párrafo.

## Pendiente
Esperando OK de Felipe para llevarlo a `ConteoPanel.tsx`. Sin decisión sobre el punto 3 mencionado en el chat
(borde rojo de «Responsable» al abrir la pantalla) — es un patrón del sistema (`ComboResponsable`, ADR-0161/0162),
no algo propio de esta pantalla.
