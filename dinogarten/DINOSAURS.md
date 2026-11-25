# The cast

Every animal the game plans to include, who it is, and where its 3D model comes from. Lessons are handed out to these characters over time; there are more lessons planned than animals, so several will teach more than one.

Each one tells the player three things about itself before its lesson: its name, how to say it, and what it eats.

## Status

- **In the game**: walking around the world today.
- **Ready**: a matching model exists; it needs colours, eyes and a place to stand.
- **To build**: no free model matches the style, so it will be made from one we have (see [Where the models come from](#where-the-models-come-from)).

## Land dinosaurs

| Animal | Say it | Eats | Character and home | Model | Status |
| --- | --- | --- | --- | --- | --- |
| Tyrannosaurus rex | tie-RAN-uh-SORE-us rex | meat | The player: a toddler T. rex | Quaternius T-Rex | In the game |
| Triceratops | try-SAIR-uh-tops | plants | Meadow | Quaternius Triceratops | In the game |
| Stegosaurus | STEG-uh-SORE-us | plants | Meadow, near the pond | Quaternius Stegosaurus | In the game |
| Apatosaurus | uh-PAT-uh-SORE-us | plants | Meadow | Quaternius Apatosaurus | Ready |
| Parasaurolophus | pair-uh-sore-OL-uh-fus | plants | Meadow | Quaternius Parasaurolophus | Ready |
| Velociraptor | veh-LOSS-ih-RAP-tor | meat | Meadow. About the size of a turkey | Quaternius Velociraptor | Ready |
| Brachiosaurus | BRAK-ee-uh-SORE-us | plants | Among the tallest trees | Apatosaurus, reshaped: longer front legs, neck held high | To build |
| Giganotosaurus | jig-uh-NOT-uh-SORE-us | meat | Volcano country | T-Rex, reshaped: longer head and arms | To build |
| Allosaurus | AL-uh-SORE-us | meat | Forest edge | T-Rex, reshaped, with small brow horns added | To build |
| Spinosaurus | SPY-nuh-SORE-us | fish | Old and cranky. Lives in a rocky inlet on the beach (in the meadow until the beach exists) | T-Rex, reshaped: long snout, bigger arms, no teeth, with a sail added along the back | In the game |
| Dilophosaurus | dy-LOH-fuh-SORE-us | meat | Forest | Velociraptor, with twin head crests added | To build |
| Ankylosaurus | an-KY-luh-SORE-us | plants | Meadow | Stegosaurus without its plates, with armour and a tail club added | To build |
| Microraptor | MY-kroh-RAP-tor | meat | A whole flock of them, in the trees. Crow-sized, with four wings | Velociraptor, tiny, with wing feathers added | To build |

## Not dinosaurs (and the game says so)

| Animal | Say it | Eats | What it is | Character and home | Model | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Quetzalcoatlus | KET-sul-koh-AT-lus | meat | Flying reptile, as tall as a giraffe | Cliffs and sky | Converted from a public-domain pterosaur, reshaped: long neck and beak | To build |
| Pterodactyl | TAIR-uh-DAK-til | fish | Flying reptile. Its full name is Pterodactylus | Cliffs and sky | Converted from a public-domain pterosaur | To build |
| Mosasaurus | MOH-zuh-SORE-us | fish | Sea reptile | Waits for the player in the sea off the beach | Built in code | To build |

## Places these characters need

- **Meadow and forest**: the world as it is today.
- **Beach with a rocky inlet**: the Spinosaurus's home.
- **Shallow sea**: the T. rex can run down the beach, along the sea floor and swim a little, then run back up. The game stops him before it gets deep. The Mosasaurus waits out there.
- **Cliffs and sky**: somewhere for the fliers to perch and circle.
- **Volcanoes**: lots, all along the horizon, some smoking, some running with lava, some erupting. These are in the game today.

## Where the models come from

The first six animals come from one free, public-domain set by Quaternius (see [CREDITS.md](CREDITS.md)). They match each other, come with skeletons and animations, and can be committed to this public repo.

A search in November 2026 found no free set that matches them for the other ten. What exists is a scattering of one-off models in clashing styles, many of them unanimated, and many uploaded by people who do not appear to be the original authors. Store-bought packs cannot be used at all, because their licences forbid putting the files in a public repo.

So the rest are built from what we have, which also keeps the whole cast in one style:

- **Reshape**: start from the closest model in the set and change it when it loads: new colours, different proportions, and extra parts made in code (a sail, crests, armour, a tail club, feathers) pinned to its skeleton so they move with it. The animal keeps the walk and idle animations of the model it started from.
- **Convert**: the two fliers start from a public-domain animated pterosaur on OpenGameArt ([Low Spec Pterosaur](https://opengameart.org/content/low-spec-pterosaur)). It ships as a Blender file, so it has to be converted first.
- **Build in code**: the Mosasaurus has nothing to start from. A swimming body is the simplest shape to build and animate in code.

The Spinosaurus was the first one made this way, and its settings file (`content/dinos/spinosaurus/dino.json`) is the example to copy.

The honest limit of reshaping: a Giganotosaurus made from a T. rex will have the right size, colour and head shape, but keeps the T. rex's two-fingered hands. These are friendly cartoon versions, not museum models.
