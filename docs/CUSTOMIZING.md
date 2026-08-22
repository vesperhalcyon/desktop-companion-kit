# Customizing a character

The public defaults live in `config/character.json`. For a personal character, copy that file to `config/character.local.json`; the local file overrides public values and is ignored by Git.

Choose:

- display name, panel label, title, and greeting;
- accent colors as six-digit hex values;
- idle and click lines;
- short responses for hello, movement, quiet, thanks, affection, help, and fallback;
- one asset filename under `assets/`.

The profile loader strips control characters, bounds line lengths and array sizes, validates colors, and reduces the asset path to a basename.

A neutral SVG is included as `assets/mascot.svg`. Private or generated art should remain uncommitted unless you hold distribution rights.
