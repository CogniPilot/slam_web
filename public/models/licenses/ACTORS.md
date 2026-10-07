# Dynamic actor credits

`pedestrian-hoodie.glb`: **Hoodie Character** by **Quaternius**, released February 22, 2022 under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). [Creator's model listing](https://poly.pizza/m/gKLBoRsyKe), [original GLB](https://static.poly.pizza/bcd66ec5-5e81-4901-a222-47abc875fe2a.glb).

`pedestrian-casual.glb`: **Casual Character** by **Quaternius**, released February 22, 2022 under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). [Creator's model listing](https://poly.pizza/m/kZ3DmIoGip), [original GLB](https://static.poly.pizza/90a9e2d4-053f-42f1-99a2-8f5e1180ea7f.glb).

Both humans retain the original authored `Walk` (37 animation channels, 1.333 seconds) and `Idle` clips, all skin bindings and geometry. Other animations and their unused buffers were removed; the retained clips were renamed from `CharacterArmature|Walk` and `CharacterArmature|Idle`. Runtime instances use independent skeletons, metre-scale placement and nonmetallic skin/clothing materials. These licenses are the explicit CC0 releases on the linked model pages, independent of later licenses on the creator's website.

`traffic-hatchback.glb`: **Car Hatchback** by **Kay Lousberg**, released February 3, 2024 under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). [Creator's model listing](https://poly.pizza/m/BG0KAhmGDt), [original GLB](https://static.poly.pizza/7dc33135-12c6-4de4-b5f9-cf445fd35994.glb). The original geometry and embedded colour-palette texture are retained: 1,194 triangles.

`traffic-sedan.glb`: **Car** by **Quaternius**, released August 15, 2021 under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). [Creator's model listing](https://poly.pizza/m/Cz6yDaUcM9), [original GLB](https://static.poly.pizza/59a67a6c-490e-472e-bae6-5a4d2541f1c7.glb). The original four-door sedan geometry and separate body, glazing, lamp and tyre materials are retained: 2,954 triangles.

`traffic-van.glb`: **Generic Van** by **PuKkBuMXDD**, released July 10, 2023 under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). [Creator's model listing and attribution source](https://poly.pizza/m/BbRojf2v3H), [original GLB](https://static.poly.pizza/233b6797-9ce6-4369-8458-0b7fe16444ef.glb). The original delivery-van geometry and materials are retained: 2,465 triangles.

The three ordinary vehicles replace the previous sports car. Source GLBs are unmodified; runtime instances face the route, scale to 4.0 m (hatchback), 4.5 m (sedan) and 5.0 m (van), adjust material roughness and rotate their authored wheel groups around their axle centres. The sedan's rear wheels share an authored mesh and rotate together around one axle. Traffic and pedestrians can be disabled independently; hidden actors skip animation work and seek to current simulation time when reenabled.

The complete CC0 and CC-BY 3.0 legal texts are bundled alongside this file. The asset manifest records original sources, local hashes and geometry/animation counts. Model geometry and animations are authored assets; route motion is computed from simulation timestamps and never passed to SLAM as a measurement.
