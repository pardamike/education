# The cast

Every animal the game plans to include, who it is, and where its 3D model comes from. Lessons are handed out to these characters over time; there are more lessons planned than animals, so several will teach more than one.

Each one tells the player three things about itself before its lesson: its name, how to say it, and what it eats.

## Status

- **In the game**: walking around the world today.
- **To build**: no free model matches the style, so it will be made from one we have (see [Where the models come from](#where-the-models-come-from)).

## Land dinosaurs

| Animal | Say it | Eats | Character and home | Model | Status |
| --- | --- | --- | --- | --- | --- |
| Tyrannosaurus rex | tie-RAN-uh-SORE-us rex | meat | The player: a toddler T. rex | Quaternius T-Rex | In the game |
| Triceratops | try-SAIR-uh-tops | plants | Meadow | Quaternius Triceratops | In the game |
| Stegosaurus | STEG-uh-SORE-us | plants | Meadow, to the north | Quaternius Stegosaurus | In the game |
| Apatosaurus | uh-PAT-uh-SORE-us | plants | By the pond. Too big to turn round, so it stands still | Quaternius Apatosaurus | In the game |
| Parasaurolophus | pair-uh-sore-OL-uh-fus | plants | Meadow, east side | Quaternius Parasaurolophus | In the game |
| Velociraptor | veh-LOSS-ih-RAP-tor | meat | Meadow, west side. About the size of a turkey | Quaternius Velociraptor | In the game |
| Brachiosaurus | BRAK-ee-uh-SORE-us | plants | The tallest animal in the meadow, at its west edge. Too big to turn round, so it stands still | Apatosaurus, reshaped: body tipped back, longer front legs, neck held high | In the game |
| Giganotosaurus | jig-uh-NOT-uh-SORE-us | meat | The biggest meat-eater. East side of the meadow | T-Rex, reshaped: longer head and arms, with a ridge of spines added down the neck and back | In the game |
| Allosaurus | AL-uh-SORE-us | meat | West side of the meadow, by the trees | T-Rex, reshaped: slimmer, longer arms, with brow horns added | In the game |
| Spinosaurus | SPY-nuh-SORE-us | fish | Old and cranky. Lives in a rocky inlet on the beach | T-Rex, reshaped: long snout, bigger arms, longer teeth, slimmed body, angry brows, with a sail added along the back | In the game |
| Dilophosaurus | dy-LOH-fuh-SORE-us | meat | South side of the meadow | Velociraptor, with a bigger head and twin head crests added | In the game |
| Ankylosaurus | an-KY-luh-SORE-us | plants | Middle of the meadow | Stegosaurus, stretched wide and low, its plates shrunk to flat armour, with studs, side spikes, head horns and a tail club added | In the game |
| Microraptor | MY-kroh-RAP-tor | meat | A whole flock of them, in the trees. Crow-sized, with four wings | Velociraptor, tiny, with wing feathers added | To build |

## Not dinosaurs (and the game says so)

| Animal | Say it | Eats | What it is | Character and home | Model | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Quetzalcoatlus | KET-sul-koh-AT-lus | meat | Flying reptile, as tall as a giraffe | Cliffs and sky | Converted from a public-domain pterosaur, reshaped: long neck and beak | To build |
| Pterodactyl | TAIR-uh-DAK-til | fish | Flying reptile. Its full name is Pterodactylus | Cliffs and sky | Converted from a public-domain pterosaur | To build |
| Mosasaurus | MOH-zuh-SORE-us | fish | Sea reptile | A little scary: long jaws full of teeth. Patrols the deep water and swims over to look at the player | Built in code (`src/renderer/src/world/Mosasaur.ts`) | In the game |
| Plesiosaurus | PLEE-zee-uh-SORE-us | fish | Sea reptile with a long neck and four flippers | The deep water, sharing it with the Mosasaurus | Built in code, like the Mosasaurus | To build, last of all. The whole underwater world gets another pass at the same time |

## Places

- **Meadow and forest**: in the game. The round meadow where the player starts, covered in ferns, with horsetails round the pond. See [Land plants](#land-plants).
- **Beach with a rocky inlet**: in the game, along the north side of the meadow. The Spinosaurus stands in a pool in the inlet.
- **The sea**: in the game. The T. rex wades down the beach, then the sea floor drops away to a deep underwater world where he swims along just above the bottom, blowing bubbles. The Mosasaurus lives down there. See [Sea life](#sea-life) for what grows and swims around them.
- **Volcanoes**: in the game. They rise out of the sea all along the horizon, some smoking, some running with lava, some erupting.
- **Cliffs and sky**: still to come. Somewhere for the fliers to perch and circle.

## Sea life

Everything in the underwater scenery lived in the seas of the dinosaurs' time, alongside the Mosasaurus in the Late Cretaceous. It is all built in code (`src/renderer/src/world/seabed.ts`).

| In the game | What it is |
| --- | --- |
| Seagrass meadows | The oldest known seagrass fossils are Late Cretaceous |
| Sea lilies | Crinoids: animals that look like flowers on stalks |
| Rudist reefs | Clams shaped like ice-cream cones, standing on their points. They built the reefs of this era |
| Platter clams | Inoceramid clams, which lay flat on the mud and grew up to two metres across |
| Coral heads | Stony corals |
| Sea urchins | Spiny, as now |
| Ammonites | Relatives of squid in shells, both coiled and straight (baculites). Empty shells lie on the sand too |
| Shoals of fish | Bony fish, the Mosasaurus's usual meal |

There is no kelp, on purpose. Kelp forests look right to us but the earliest secure kelp fossils are about 32 million years old, more than 30 million years after the last dinosaurs.

Animals from the same seas that would make good additions: the giant turtle Archelon, the big predatory fish Xiphactinus, and the toothed diving bird Hesperornis.

Sources: [Berkeley News on the age of kelp](https://news.berkeley.edu/2024/01/15/pacific-kelp-forests-are-far-older-than-we-thought/), [Utrecht University on Late Cretaceous seagrass](https://research-portal.uu.nl/en/publications/seagrass-stems-with-attached-roots-from-the-type-area-of-the-maas/), [Kansas Geological Survey on the Niobrara Chalk's inoceramids, crinoids and rudists](https://www.kgs.ku.edu/Publications/Bulletins/225/05_bios.html), [American Museum of Natural History on the Western Interior Seaway](https://www.amnh.org/research/paleontology/invertebrate-paleontology/western-interior-seaway), [Britannica on Cretaceous ammonites](https://www.britannica.com/science/Cretaceous-Period/Paleoclimate).

## Land plants

There is no grass, on purpose. Grasses were rare in the dinosaurs' time and did not form grasslands until long afterwards; ferns were the ground cover instead. So the meadow is mossy ground covered in ferns, with horsetails in the damp ground round the pond. The trees are conifers and cycads, the main trees of the era, with some broad-leaved ones. Flowering plants, small flowers and broad-leaved trees alike, only arrived in the Cretaceous. It is all built in code (`src/renderer/src/world/scenery.ts`).

Sources: [University of Maryland, GEOL 104, on Mesozoic ground cover](https://www.geol.umd.edu/~tholtz/G104/lectures/104angio.html), [Smithsonian Magazine on how the dinosaurs' world looked](https://www.smithsonianmag.com/science-nature/five-ways-the-world-of-the-dinosaurs-looked-different-from-ours-beyond-the-presence-of-the-terrible-lizards-180989521/), [Enchanted Learning on the plants dinosaurs ate](https://www.enchantedlearning.com/subjects/dinosaurs/plants/).

## Where the models come from

The first six animals come from one free, public-domain set by Quaternius (see [CREDITS.md](CREDITS.md)). They match each other, come with skeletons and animations, and can be committed to this public repo.

A search in November 2026 found no free set that matches them for the other ten. What exists is a scattering of one-off models in clashing styles, many of them unanimated, and many uploaded by people who do not appear to be the original authors. Store-bought packs cannot be used at all, because their licences forbid putting the files in a public repo.

So the rest are built from what we have, which also keeps the whole cast in one style:

- **Reshape**: start from the closest model in the set and change it when it loads: new colours, different proportions, a different stance, longer teeth or spikes, a slimmer or broader body, and extra parts made in code (a sail, horns, crests, armour, a tail club, feathers) pinned to its skeleton so they move with it. The animal keeps the walk and idle animations of the model it started from.
- **Convert**: the two fliers start from a public-domain animated pterosaur on OpenGameArt ([Low Spec Pterosaur](https://opengameart.org/content/low-spec-pterosaur)). It ships as a Blender file, so it has to be converted first.
- **Build in code**: the Mosasaurus has nothing to start from. A swimming body is the simplest shape to build and animate in code.

The Spinosaurus was the first one made this way, and its settings file (`content/dinos/spinosaurus/dino.json`) is the example to copy.

The honest limit of reshaping: a Giganotosaurus made from a T. rex will have the right size, colour and head shape, but keeps the T. rex's two-fingered hands. These are friendly cartoon versions, not museum models.
