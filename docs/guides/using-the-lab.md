# Using the lab

1. [Open SLAM Lab](https://cognipilot.github.io/slam_web/) and wait for loading to finish.
2. Click **Run**. Manual flight starts with a drone-follow camera and IMU estimation.
3. Open **Configuration** to change the environment, graphics, lighting or sensor rates.

**Pause** holds simulation time. **Step** processes one camera frame and its due
sensor events. **Reset** starts the experiment again. The speed selector changes
the requested simulation speed; processing capacity determines the achieved speed.

## Moving around

Use the toolbar's **Manual flight / Flight tour** button to take control or start
an automatic tour. In **Configuration → Flight**, **Keys control** chooses drone
commands or camera movement. **Camera view** selects fixed-heading follow,
vehicle-heading chase, side, overhead or free view. Press **V** to cycle views.

| Keys | Action |
| --- | --- |
| WASD | Move forward, left, backward and right |
| Q / E | Turn |
| R / F | Move up / down |
| Shift | Move the viewer faster |
| V | Next camera view |

Manual drone commands are the default. Camera movement in follow views adjusts
the camera relative to the drone; free view moves independently.
Moving the viewer camera leaves the simulated drone and sensor pose unchanged.

**Configuration → Flight → Vehicles** enables a second drone. Each drone runs
its own Modelica dynamics, sensors and estimator; both wait at the same lockstep
boundaries. The toolbar's drone selector switches manual control, follow target,
sensor previews and diagnostics. One drone is the default.

The **Plot** pane shows live telemetry. Use **Add series** to select signals from
either drone. It can collapse or fill the screen, like the viewer and editor.

## Native Modelica SLAM

**Configuration → Flight → Estimator** switches from the inertial baseline to
**Native Modelica SLAM**: the complete `D435FastSLAMStep` model, compiled ahead
of time by Rumoca into WebAssembly programs that the site serves. The first
camera image initializes the map; afterwards every held IMU interval is one
evaluation with the current RGB-D image, so a lower IMU rate and the 15 Hz camera
rate keep the run closest to real time. The programs reserve about 1.2 GB of
memory, need the native 848 × 480 camera (hardware rendering, not the software
preview), and are not available on phones. Metrics show the model's own
feature, map and loop-closure results; the status line reports the program
identity and any non-zero evaluation status.

## Scenes and graphics

Choose **Big city · furnished interiors** to explore a market, loft and conference
room. **Inspect Big city** moves the viewer to a room; fly the drone there manually
to change its sensor view. The indoor flight tour uses the original training building.

Start with **Low** on limited hardware. Higher quality adds detail, sharper textures
and shadows. Cars, people, LiDAR and depth points have independent toggles.
Custom sensor rates survive graphics changes; **Use quality defaults** restores the
selected preset's rates. A software-rendering warning means the browser is using
its CPU, with a reduced camera preview.

## Workspace and phones

The viewer and editor can each collapse or fill the screen. On a phone, scroll
below the viewer to reach the editor and configuration. Low graphics and its
15 Hz RGB-D rate are the default everywhere so simulation stays close to real
time; raise them in **Configuration**. See [Editing Modelica](editing-modelica.md)
to keep your work.
