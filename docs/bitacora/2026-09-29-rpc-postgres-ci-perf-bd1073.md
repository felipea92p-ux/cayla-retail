## 2026-09-29 (El CI deja de hacer esperar por una corrida que ya estaba cancelada)
Qué hice: medí por qué «Pruebas de RPC contra Postgres» se sentía tan lento y encontré que una parte grande de la espera no era
la prueba sino una cola: todos los pasos de `ci.yml` llevaban `always()`, que sigue corriendo aunque se cancele la corrida, así
que el push nuevo esperaba a que la corrida «cancelada» terminara sus ~7 minutos. Cambié los 135 `always()` por `!cancelled()`
y le di a cada commit de `main` su propio grupo de ejecución (ADR-0286).
Por qué así: en 12 de 42 corridas la espera (17 s a 5 min) fue igual, al segundo, a lo que le quedaba de vida a la corrida
anterior de la misma rama. Repartir las pruebas en varios jobs o correrlas en paralelo sobre la misma base se descartó: gana
tiempo pero abre riesgo de `40P01` y de tocar 123 scripts.
Felipe se lleva: al volver a pushear a un PR, la corrida nueva arranca en segundos y la vieja se detiene de verdad.
