# Big city

[BigCityWorld](../src/world-big-city.ts) builds an original generic city with 18 buildings, paved avenues, ordinary shop signs, offices, residential façades, a park and street furniture. Geometry is static and shared through `InstancedMesh` batches. Physics, navigation, traffic and pedestrian trajectories remain owned by editable Modelica sources; this helper supplies Three.js scenery.

Three buildings have actual furnished interiors with wall openings, floors and ceilings. The Corner Market has two stocked shelf racks, a checkout and an open central aisle. Daylight Loft has brick walls, large framed glazing, an L-shaped sofa with cushions, woven rug, books, kitchen cabinets/bar, plants, a staircase and a furnished mezzanine beside a double-height atrium. Civic Workspace has a white conference table, ten office chairs, folders/cups, whiteboard, display, wall clock, side bench, a window bank and ceiling grid. Original emissive ceiling panels provide visible warm fixtures; they do not add dynamic lights. Other façades use a small original window-room shader.

The helper borrows the existing `WorldMaterials` metre-scaled brick, plaster, wood and paving PBR materials, including the application's CC0 photographic texture assets. It owns a small original woven cloth/rug texture. All furniture and building geometry is authored here; none of the reference models or their textures are bundled.

`BigCityWorld(materials)` exposes `group`, `ready`, `build(detail)`, `dispose()`, `stats` and `interiors`. `BIG_CITY_INTERIORS` describes roof volumes, entrances and clear indoor routes in east/north/up metres. The store, loft and conference entrances are 3 metres wide and at least 2.8 metres high. The loft route includes vertical travel through the atrium and entry onto the upper mezzanine. Root runtime integration owns the `big-city` environment selection, actor rendering and navigation/roof-volume handling.

All detail settings retain the three interiors, entrances, circulation routes and essential furniture. Low reduces decorative products/books, façade window counts and curved/foliage geometry; medium adds façade sills, street furniture and ceiling grids; high adds roof decoration and chair arms. Viewer resolution, shadows and anisotropy are controlled separately. Changing scene detail changes the sensor's visible scene while camera resolution remains fixed. Quality also supplies sensor-rate defaults; saved custom rates take precedence until explicitly reset.

RGB/depth pairs run at 15/30/60/90 Hz, LiDAR at 5/10/20 Hz, IMU at 30/60/90/180 Hz and GPS at 1/5/10 Hz. Low defaults to 15/10/90/5 Hz, Medium to 30/10/90/5 Hz and High to 90/20/90/10 Hz, in that order. Independent due events use an exact 180 Hz integer clock grid and committed physics timestamps. Each event completes processing before physics advances; slow processing retains every due sample and frame. The viewer targets 30 FPS in wall time. LiDAR is an instantaneous snapshot rather than a rotating scan with per-beam timing.

The **Configuration** tab groups scene/display controls, Flight settings and Sensor rates. **Use quality defaults** restores the selected quality's sensor schedule; custom rates otherwise survive quality changes and save/reload. The **Graphics quality** selector applies these rendering budgets alongside the scene detail:

| Setting | Viewer pixel ratio cap | Sun shadows | Surface normal maps | Anisotropy cap | Photographic texture edge cap |
| --- | ---: | --- | --- | ---: | ---: |
| Low · older laptops | 0.75 | Off | Off | 1 | 256 |
| Medium · balanced | 1 | 512 × 512 | On | 2 | 512 |
| High · showcase | 2 | 1024 × 1024 | On | 4 | 1024 |

Pixel ratio is also capped by the display's device pixel ratio; anisotropy is capped by the GPU's supported value. Textures are never enlarged beyond the source: the current local photographic maps are 512 × 512, so Medium and High retain that resolution. Low downsamples them to 256 × 256 and releases disabled normal maps and shadow targets from GPU storage. The original downloaded bitmaps remain available for returning to High without downloading again; download and source bitmap memory are unchanged. Quality is saved with the local project and restored on reload. Cars and pedestrians have independent toggles for controlling scene motion and SLAM difficulty.

Changing **Graphics quality** pauses at the end of the current lockstep frame and rebuilds the scenery without recompiling the Modelica programs. The simulation time, estimator state, worker instances, trajectories and inspection camera are retained; press **Run** to continue. The dial also works before an executable algorithm has been selected. Pending algorithm or environment edits still require **Apply & reset**.

| Detail | Buildings / enterable | Instances | Render batches per pass | Triangles |
| --- | --- | ---: | ---: | ---: |
| Low | 18 / 3 | 837 | 39 | 10,648 |
| Medium | 18 / 3 | 2,349 | 39 | 31,048 |
| High | 18 / 3 | 2,401 | 39 | 31,672 |

These counts come from constructed geometry, not GPU timing. Additional shadow/LiDAR passes can submit the batches again. [Focused tests](../tests/world-big-city.test.ts) pass offset-ray checks for a 0.8 metre wide, 0.4 metre high swept corridor through all three entries and indoor routes, in every detail setting. They also check essential furnishings, deterministic rebuilds, batching and ownership/disposal of shared resources. Scoped strict TypeScript checks pass. [The verification record](../dev/big-city-verification.json) records source hashes and actual gate results.

The environment is selectable in the running browser. After choosing the available Modelica inertial propagation preset, select **Big city · furnished interiors**, apply, and use **Inspect Big city** to view the market, loft or conference room. Inspection moves only the presentation camera; the drone/sensor pose remains committed to its own flight path. All three interiors have editable [Modelica roof-volume gates](modelica-roof-volumes.md); this demonstrates indoor GPS suppression. The existing straight indoor flight tour targets the original training building, so manual flight is needed to reach the new interiors. Full visual SLAM navigation remains pending.

The default keyboard mode moves the viewer independently in real time: WASD translates, Q/E changes yaw, R/F changes altitude and Shift increases speed. Select **Drone commands**, run the simulation and turn Flight tour off for manual drone commands. Big-city actors use Modelica sidewalk routes centered at north = ±5.8 m and car lanes at ±1.65 m; the separate Main Street scene uses its own geometry and crossings.

Historical RTX 3090/WebGL2 browser checks passed direct/worker RGB and depth parity in all three rooms at low, medium and high detail, synchronized LiDAR/cloud timestamps, fixed sensor dimensions and inspection without sensor-pose changes. A separate barrier test verified that the viewer continued rendering while the estimator held simulation. These records retain their original sampling workload; they do not validate the new independent sensor schedules. The procedural geometry remains a prototype rather than established AAA visual fidelity.

Historical matched 360-frame all-sensor profiles measured Low at 35.57 ms/step (0.312× realtime) and High at 38.63 ms/step (0.287×), with both viewers averaging approximately 30 FPS. Those profiles predate independent sensor rates and retain their original workload: raw depth cloud, 64×1024 LiDAR, RGB-D, the genuine plant and the available inertial baseline, plus profiling overhead on a shared machine. They do not measure the current quality defaults. Full SLAM and the 10× target are not established by these runs. Actual archaic-laptop hardware still needs measurement.

Visual references requested by the user informed broad room arrangements and furnishing choices: [Conference Room](https://sketchfab.com/3d-models/conference-room-da862325a9dd4e8baa638fb72b9b2325) by Zeps3D, [Small apartment](https://sketchfab.com/3d-models/small-apartment-c086a8ba63e84a5a98d458f49b95a441) by Katydid, [Loft (5)](https://sketchfab.com/3d-models/loft-5-interior-for-free-883881f6025646c79c92824fdbc8a0cc) and [The interior (14)](https://sketchfab.com/3d-models/the-interior-14-is-spacious-79262bfc39d54fd2a0edc9d80fafdb6d) by dasy444. These are reference-only Standard/Free Standard assets, with no redistributed files. The rustic-house reference was reviewed as additional inspiration; this implementation prioritizes the three furnished interiors above.
