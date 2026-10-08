# Using the lab

1. [Open SLAM Lab](https://cognipilot.github.io/slam_web/) and wait for loading to finish.
2. Click **Run**. The default example flies the quadrotor and estimates motion from its IMU.
3. Open **Configuration** to change the environment, graphics, lighting or sensor rates.

**Pause** holds simulation time. **Step** processes one camera frame and its due
sensor events. **Reset** starts the experiment again. The speed selector changes
the requested simulation speed; processing capacity determines the achieved speed.

## Moving around

The **Keys control** selector chooses between the viewer camera and drone commands.

| Keys | Action |
| --- | --- |
| WASD | Move forward, left, backward and right |
| Q / E | Turn |
| R / F | Move up / down |
| Shift | Move the viewer faster |

For manual flight, select **Drone commands**, turn off **Flight tour**, then run.
Moving the viewer camera leaves the simulated drone and sensor pose unchanged.

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
below the viewer to reach the editor and configuration. Low graphics is the mobile
default. See [Editing Modelica](editing-modelica.md) to keep your work.
