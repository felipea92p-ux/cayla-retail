# Cómo se le muestra a Felipe

Corto, con números y con la imagen. Felipe decide mirando capturas, no leyendo tablas de huellas.

## El mensaje del censo (paso 3)

```
Inventario tiene 14 familias de piezas; 6 se ven de más de una forma.  (censo de 77 pantallas + 24 modales, rama X @ abc123)

1. Botón «Cancelar» — 3 formas en 11 pantallas. En Caja es rojo y en Inventario es gris: en Caja parece peligroso. [imagen]
2. Pestañas — 4 formas en 19 pantallas: SegmentoDeslizante (17), TabsSubrayado (2), dos a mano. [imagen]
3. Insignias de estado — 3 formas: la de Por pagar no tiene punto y mide 2 px más. Accidente: se junta sola. [imagen]
…
Decididas a propósito (no las toco sin que lo digas): la cabecera de Finanzas (ADR-0195).
No cubierto: 6 modales sin escenario (lista), Recibir mercadería exige guardar para verse.

Lámina completa: <url de unificar-laminas>/<carpeta>/lamina.html
¿Cuáles quieres decidir ahora? Te propongo empezar por 1, 2 y 3. Para esas dibujo una propuesta nueva.
```

- **Una línea por familia**, de la que más confunde a la que menos (ver `criterio.md` §5). Máximo 8; el resto, «y N más en la lámina».
- **La imagen** de cada familia va con `SendUserFile` (`comparativas/<familia>.png`), con un pie que dice qué mirar: «la A y la C difieren en el
  color: mira el fondo».
- **«Qué le cuesta a la persona»** en palabras de tienda: aprender dos veces, dudar de si es peligroso, no encontrar el botón porque cambió de
  lado. Nunca «inconsistencia visual».
- **Lo decidido a propósito** y **lo no cubierto** siempre van, aunque sea una línea.

## La pregunta de la elección (paso 5)

Una pregunta por familia en `AskUserQuestion`. `header`: el nombre corto de la familia («Cancelar», «Pestañas»). Opciones:

1. Tu recomendación, con «(Recomendado)» al final del label. En la descripción: por qué, y cuántos archivos hay que migrar.
2. Las otras 1–2 formas más usadas (A, B…), cada una con su componente y cuántas pantallas la usan hoy.
3. «Propuesta nueva», si la dibujaste.

Felipe puede responder «Otra» (por ejemplo, «la B pero con el icono de la propuesta»): eso es una propuesta nueva; dibújala y vuelve a preguntar.

## Después de decidir

Una línea por familia: *«Pestañas: la B (SegmentoDeslizante) es la única desde hoy. Deuda: 6 archivos en 3 módulos. La prueba del CI ya no deja
dibujar pestañas a mano. ¿Migro ahora, módulo por módulo, empezando por Inventario?»*
