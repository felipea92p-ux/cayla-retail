## 2026-10-02 (La carta de colores tiene 11 familias en orden de espectro y una sola escala)
Qué hice: medí los 75 colores de producción (matiz, intensidad y claridad) y encontré que el orden de claro a oscuro casi no
fallaba; lo que fallaba eran las familias: el naranja vivía dentro de Amarillo, el rosado dentro de Rojo, y la lista de familias
estaba escrita en tres sitios. Sumé Rosado y Naranja, puse las filas en el orden del espectro, hice un solo orden calculado del
color (gama y claridad) para Nuevo producto y Atributos, saqué el campo «Orden» que ya no hacía nada y mejoré la carta (círculos
de 32 px, borde del propio tono, respiro entre gamas, metal creíble, y un pie con el Pantone y con qué otro color se confunde).
Por qué así: «Azul medio» y «Azul Intermedio» son nombres de un escalón de la escala, no de un color: sin una escala visible la
gente inventa colores. Un orden que sale del color no se desordena cuando alguien agrega uno; el número guardado a mano sí.
Medí también la captura de Felipe: el círculo ya pinta el color exacto (0,9 de 255 de diferencia); lo apagado era su perfil
Wide Gamut.
Felipe se lleva: una migración lista y ensayada (`20261002180000`) que él pega en producción **antes** de fusionar la web, y tres
ajustes de familia que puede revertir color por color (Coral, Mora, Salmón). El ADR es el 0312 porque el 0310 ya lo reclaman dos
ramas. Los 4 colores creados a mano no se tocan: ya tienen 23 variantes con stock.
