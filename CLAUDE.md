# Project instructions

## GitHub account

This repo belongs to the `codemavens` GitHub account. The machine-wide active `gh` account is for a different project and is not a collaborator here.

- Do not run `gh auth switch`; it changes the account for every project on the machine.
- Run each `gh` command in this repo as `codemavens` for that command only:
  `GH_TOKEN="$(gh auth token --user codemavens)" gh ...`
- Never print or store the token.
- Git pushes already use the right account through the `github-cm` SSH alias in the remote URL.
