## 2026-10-31 (El CI de cada PR, de ~9 a ~5 min)
Qué hice: el CI de cada PR corre ahora tipos, lint y pruebas a la vez (antes en fila) y las pruebas de Postgres en 6 tandas en vez de 4, con las duraciones medidas de nuevo.
Por qué así: la regla «rama al día» hace correr el CI de 7 a 10 veces por rama mientras otras sesiones fusionan; cada vuelta más corta es la fila entera más corta, sin quitar ni una prueba.
Qué se rompería sin esto: con ~6 fusiones por hora y 9 min por vuelta, un PR podía esperar horas en verde-atrasado-verde (el #1500 tardó 8 h); los checks obligatorios conservan su nombre, así que el ruleset sigue igual.
