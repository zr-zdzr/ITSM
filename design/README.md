# ITMS — Design Diagrams

Graphviz sources for the architecture, navigation and process diagrams that describe
ITMS as it is actually implemented.

Only the `.dot` sources are tracked. The rendered PNG/SVG files and the assembled
`ITMS-Design-Flow.docx` are generated output and are gitignored — regenerate them
locally with the commands below.

## Diagrams

| File                          | Shows                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| `01-architecture.dot`         | The three Docker containers and how requests flow between them  |
| `02-sitemap.dot`              | Every route, grouped as the sidebar groups them                 |
| `03-auth-permission-flow.dot` | Login and the per-request permission decision                   |
| `04-asset-lifecycle.dot`      | Asset states from procurement through to disposal               |
| `05-request-workflow.dot`     | Request fulfilment, and employee offboarding                    |
| `06-delete-recovery-flow.dot` | Delete behaviour per module, and the recycle-bin recovery path   |
| `07-data-model.dot`           | Principal tables and their relationships                        |

## Rendering

Requires Graphviz (`sudo apt install graphviz`).

```bash
# one diagram
dot -Tpng -Gdpi=110 01-architecture.dot -o 01-architecture.png

# all of them, PNG and SVG
for f in *.dot; do
  dot -Tpng -Gdpi=110 "$f" -o "${f%.dot}.png"
  dot -Tsvg "$f" -o "${f%.dot}.svg"
done
```

## Editing notes

Two layout traps, both hit while producing these:

- **Do not use `rank=same` across nodes in different clusters.** It breaks cluster
  containment — in `01-architecture.dot` it ejected the backend container from the
  Docker host box.
- **Avoid one node per item in large diagrams.** A node-per-route sitemap renders
  either very tall (`rankdir=LR`) or very wide (`rankdir=TB`) and becomes illegible
  when scaled onto a page. Group related items into a single node instead, as
  `02-sitemap.dot` does.

## Provenance

These diagrams were reverse-engineered from the source code and document the system
as built. They are not historical design artifacts — no wireframes or design files
were produced during development. Keep them in step with the code when behaviour
changes.
