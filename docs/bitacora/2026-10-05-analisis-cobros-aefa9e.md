## 2026-10-05 (De qué eran los cobros de GitHub, y el CI deja de repetirse en `main`)
Qué hice: miré de dónde salían los $45 de «uso medido» de GitHub: son minutos de Actions del CI del repo (privado), ~6.770 en
los primeros 5 días de octubre. Recorté lo más seguro: el push a `main` ya no repite lo que el PR corrió sobre el mismo árbol
(`scripts/ci/alcance.mjs`, `ci.yml`, ADR-0345). Medido sobre los 111 commits reales de `main`: ~1.020 minutos menos en 5 días.
Por qué así: `main` ya exige la rama al día (`strict: true`), así que repetir tipos, lint y pruebas —y Postgres, salvo si el PR
era «solo web»— no agregaba señal. Descarté saltarse pruebas en PR de solo documentos (seis pruebas leen documentos) y publicar el repo.
Felipe se lleva: el recorte vale ~$50 de ~$330 al mes; el 64 % del gasto está en los PR (varios pushes por rama) y ahí lo que
queda es decisión tuya (ver backlog). Y que apagar «up to date» en el ruleset rompe la premisa de este cambio.
