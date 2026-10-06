# claude-mods

Mods propios para Claude Code.

## tablero-consumo

Panel con cinco datos de la sesión en vivo: tokens del último pedido y de la sesión, uso del plan (ventanas de 5 horas y semanal, cuándo se reinician, equivalente en API), contexto lleno, herramientas usadas y tiempo de sesión. Solo lee datos de la sesión y dibuja el panel: no usa red, archivos ni procesos.

Instalarlo:

```
/plugin marketplace add alejoaguilarg/claude-mods
/plugin install tablero-consumo@claude-mods
```

Usarlo: escribe `/consumo` para abrir el panel; otra vez `/consumo` o Esc lo cierra.

Desarrollarlo: `claude plugin validate plugins/tablero-consumo` y `claude plugin test plugins/tablero-consumo`.
