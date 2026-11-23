---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.1.0"
  argument-hint: <file-or-pattern>
---

> **Nota de CAYLA (no es del autor; es lo único que cambia del original).** En este repositorio esta skill **se consulta, no manda**
> (`.claude/rules/diseno.md`, «Skills de diseño de afuera»). Para auditar una pantalla del ERP la obligatoria es `/milimetro auditar`;
> esta es una segunda mirada. Si una regla de `references/command.md` choca con el repo, gana el repo, y apartarse de una decisión
> escrita no es un hallazgo. En especial:
> - **Textos:** en español, con mayúscula solo al inicio (nunca «Title Case») y comillas latinas «»; los ejemplos de un campo siguen
>   `/sugerir` y el resto, `/textos`.
> - **Guardar:** el botón que confirma no se apaga por lo que falta y, mientras guarda, dice «Guardando…» con su hilo, sin rueda
>   (`<Boton confirma cargando>`).
> - **Piezas:** `<Modal>`, `Desplegable` y las demás de «Una función, una pieza» (`.claude/rules/unificar.md`); nunca un `<select>` nativo.
> - **Hover y movimiento:** el `:hover` va dentro de `@media (hover: hover)`; el movimiento sigue ADR-0136 y ADR-0625 (apagado de fábrica).
> - **Estado en la URL:** donde el repo ya lo hace (`?q=`, `?sede=`, `?mes=`); que no esté en otro lado no es un hallazgo.

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the bundled guidelines at [references/command.md](references/command.md)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules are bundled with this skill in the [references/command.md](references/command.md) file. Read that file before each review. Do not fetch rules from the network.

The snapshot is pinned to a specific upstream commit:

Source: https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md

SHA-256: `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`

The file contains all the rules and output format instructions.
Where it says `$ARGUMENTS`, use the files or pattern the user asked to review.

## Updating the Guidelines

To update the snapshot to a newer upstream version:

1. Get the latest commit SHA: `gh api repos/vercel-labs/web-interface-guidelines/commits/main --jq .sha`
2. Download it: `curl -fsSL https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/<SHA>/command.md -o references/command.md`
3. Review the changes, then update the Source URL and SHA-256 above (`shasum -a 256 references/command.md`)
4. Regenerate `skills/web-design-guidelines.zip` so it matches the updated folder

## Usage

When a user provides a file or pattern argument:
1. Read [references/command.md](references/command.md)
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
