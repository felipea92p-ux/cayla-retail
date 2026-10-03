## 2026-10-02 (Se completan las familias de color y cada color dice qué transmite y con qué se combina)
Qué hice: medí dónde faltaban colores en cada familia y busqué, entre los 2.310 Pantone TCX, 16 que caen en esos huecos sin confundirse con
ninguno de los 67 que ya existen ni entre sí (Rosado 3→6, Naranja 4→7, Rojo 5→7, Amarillo 5→7, Verde +3, Azul +2, Morado +1). A cada uno
le confirmé el hex en dos fuentes. Escribí a mano, con criterio de estilismo, la descripción y con qué combina bien cada uno de los 91
colores, y Atributos las muestra en cada tarjeta y las deja editar. Salieron dos cosas que no esperaba: un par de colores nuevos quedaba a
2,8° y 4,2° del corte entre dos gamas (lo cazó mi propia prueba, moví los cortes) y otra rama tuya (#742) toca la misma carta.
Por qué así: la descripción y las combinaciones viven en la base, no en el código, para que un Líder las corrija sin deploy; un disparador
hace imposible que una combinación apunte a un color que no existe. Entran 16 y no 19 porque en Neutro, Azul pálido y Naranja pálido el
espacio ya está ocupado: llenar por llenar habría partido las cuentas de tendencias.
Felipe se lleva: dos partes de SQL ensayadas (en este orden: `20261003190000` y `20261003190100`) que él pega **antes** de fusionar —el PR
va en borrador por eso—, la lista de los 16 colores para aprobar, y dos decisiones suyas: qué hacer con los 4 colores creados a mano (ya
tienen 23 variantes; por eso no se recomiendan como compañeros) y en qué orden fusionar este PR y el #742.
Estado al cierre: Felipe pegó las dos partes de SQL y las verifiqué contra producción (91 colores, 91 fichas, cero combinaciones rotas, huella idéntica a la del repo). Queda la web en borrador (#749) y las dos decisiones suyas.
