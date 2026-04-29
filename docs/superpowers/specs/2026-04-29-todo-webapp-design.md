# Todo Webapp — Design Spec
**Data:** 2026-04-29

## Contesto

Sostituzione personale di Walling: troppo pesante, troppo lento. Si vuole una webapp leggera, senza distrazioni, con la stessa organizzazione visiva (card dump + griglia colonne), accessibile da Mac e tablet con sync realtime.

## Stack

| Ruolo | Tool | Costo |
|-------|------|-------|
| Hosting | Netlify (deploy da GitHub) | Gratis |
| Database + realtime | Supabase (Postgres + Realtime) | Gratis |
| Frontend | Vanilla JS + HTML/CSS | Zero dipendenze |

## Struttura dati (Supabase)

```
workspaces      — id, name, position
lists           — id, workspace_id, name, position, is_dump (bool), width_cols (1-4)
tasks           — id, list_id, text, status (pending/in_progress/waiting/review/done), position
```

## Layout

- **Tabs in alto** — uno per workspace (progetto). Clic per cambiare, + per aggiungerne uno.
- **Card dump** — prima card, sempre a tutta larghezza, per il "dump" rapido di todo.
- **Griglia 4 colonne** — sotto la dump card, le liste progetto. Ogni card è ridimensionabile orizzontalmente (1-4 colonne).
- **Tema**: solo light. Sfondo caldo beige (#f0ebe0), card bianche, ombre sottili.

## Funzionalità v1

- [ ] Aggiungere/rinominare/eliminare workspace (tab)
- [ ] Aggiungere/rinominare/eliminare liste (card)
- [ ] Aggiungere/completare/eliminare task con checkbox
- [ ] Etichette stato: `in corso` (blu) · `in attesa` (ambra) · `revisione` (viola)
- [ ] Drag & drop task tra liste
- [ ] Sync realtime Supabase (aggiornamento immediato cross-device)
- [ ] Modifica inline testo task e titolo lista
- [ ] Card ridimensionabile (larghezza 1-4 colonne)

## Fuori scope v1

- Autenticazione (app personale, accesso libero con URL)
- Dark mode
- Upload file/immagini
- Collaborazione multi-utente

## Estetica

- Font: system-ui (-apple-system)
- Sfondo: `#f0ebe0`
- Card: `#ffffff`, `border-radius: 10px`, `box-shadow: 0 1px 4px rgba(0,0,0,0.07)`
- Checkbox completati: testo barrato, colore grigio
- Animazioni: transizioni CSS semplici (100-150ms ease), nessun overhead pesante

## Verifica (come testare)

1. Aprire `netlify.app` URL su Mac e su tablet contemporaneamente
2. Aggiungere una task su un dispositivo → deve apparire sull'altro entro 1-2 secondi
3. Completare una task → checkbox si aggiorna, testo barrato
4. Drag & drop task → posizione salvata su Supabase
5. Aggiungere un workspace → appare nuovo tab
