# 2026-11-26 · «Sorpréndeme» junta prendas del mismo estilo

Felipe («¿en qué se basan las combinaciones?» → «ármalo así»): la tarea que ya mide las axilas le pide además a la IA el estilo de cada recorte (básico, casual, oficina, fiesta, deportivo), y «Sorpréndeme» pone primero que el estilo vaya con lo que se queda, después la foto propia y después los colores que combinan. Lo medido antes se vuelve a preguntar solo (migración 20261126210000, solo cambia `recortes_sin_medida_ia`). ADR-0705, actualización (b).
Probado: pruebas de la tienda (130) y de la web; la migración en Postgres local con `begin … rollback` (pide lo sin medida, lo de otro recorte y lo sin estilo; no lo que ya tiene estilo ni los fallos).
