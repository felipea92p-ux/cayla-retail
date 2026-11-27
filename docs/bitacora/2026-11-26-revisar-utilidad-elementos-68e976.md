## 2026-11-26 (Existencias sin ruido: cada cosa se dice una vez)
Qué hice: analicé Existencias pieza por pieza (`docs/pantallas/inventario.md`), armé la maqueta antes/después
(`docs/maquetas/existencias-sin-ruido-2026-11/`) y, con el OK de Felipe, saqué las repeticiones: un solo aviso del piso (la banda del barrido; la
franja lleva al barrido y se calla con uno abierto), sin botón de barrido duplicado, «691 según el sistema» sin «de 480» hasta el cuadre, sin la
fila «Gestión» del panel, sin «Por colgar» en pausa, sin «Se acaban»/«Sin ventas», sin el anillo ni «Pendientes de hoy», el sonido y el resumen por
categoría al pie de la lista y el valor a costo bajo las cifras (ADR-0709).
Por qué así: casi todo servía; estorbaban las repeticiones, y dos salidas («Sumarme» y «Cuadrar el piso») para la misma tarea.
Felipe se lleva: en TRU, con el barrido abierto, una sola banda que dice que terminarlo cuadra el piso; y la primera fila de prendas a la vista.

## 2026-11-26, noche (Existencias sin ruido: verificado con base)
Qué hice: lo vi con base (una pila Supabase propia, Trujillo con un barrido abierto y Lima sin cuadre), arreglé tres cosas que solo se veían con
datos (el valor a costo abierto rompía la cabecera, «Por colgar» parpadeaba, el pie apretado) y corrí `/milimetro`, `/formidable`, `tema:auditar`
y `guias:recorrer`. Por qué así: la base compartida no tiene el barrido. Felipe se lleva: el PR listo, y 3 cambios de `/formidable` para decidir.
