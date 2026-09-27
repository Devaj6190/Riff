# Riff — glossary

- **Riff**: the product, and also one two-person chat that players create and share by link or 4-letter code (`riffs` table, `/r/<code>`). Shown as a **chat** in the UI. Never "room".
- **Player**: one of the two people in a riff, sitting in **seat** `A` (creator) or `B` (joiner).
- **Nudge**: an AI pop-up at the top of the chat (a text prompt, an image, an audio clip or a mini game) of one **kind**, with a countdown. There are no rounds.
- **Mini game**: a nudge played with taps on its card, in **stages** (Guess their pick: play → reveal; Two truths and a lie: write → guess → reveal), scored by rules. A **play** is one player's taps for it (`nudge_plays`).
- **Answer**: what a player texts while a nudge's timer runs. The only thing that earns points.
- **Template**: a JSON seed the AI rewrites into a nudge for this pair.
- **Bonus mode**: when one player trails by 25+, the next 2 or 3 nudges lean toward their interests so they can answer better. Scoring is unchanged.
- **Depth**: how personal a nudge is, 1 (light) to 3 (deep). Rises over the riff.
- **Connection points**: scorer points for follow-ups and callbacks.
- **Match**: one run to the target score inside a riff. A new match resets nudges and scores; the chat is kept.
