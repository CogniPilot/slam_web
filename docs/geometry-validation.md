# RGB-D geometry and localization evidence

These are historical results from the retired reference estimator. Python execution and its test runner are removed. The geometry, independent fixtures and numerical acceptance requirements remain obligations for the complete Modelica replacement; this document does not claim that replacement is integrated or passing.

The retired reference estimator used actual RGB-D observations against frozen
reference keyframes. Stable RGB feature registration supplies pose observations;
otherwise bounded projective point-to-plane registration uses at most 600 depth
samples and six iterations. Reference surfaces keep their original body geometry,
pose, and uncertainty between keyframes. Reference covariance includes the
position/attitude lever arm and the change of local attitude basis.

Depth lifting samples bilinear **inverse axial depth** on the continuous RGB
bearing, then applies the calibrated camera mount. This exactly reproduces
noise-free tilted planes. Only positive-weight neighbors contribute; invalid
contributors and clear depth discontinuities are rejected. The historical Python and Rust implementations shared
the same gate and optional explicit stereo-noise model. The replacement must preserve those numerical contracts.

A statistically verified single planar overlap uses one fitted plane normal.
This prevents noisy finite-difference normals from inventing tangent translation
or rotation-about-normal information. The corresponding registration has three
observable modes and large covariance in the three unsupported modes. Multiple
surfaces retain their measured normals; general scene observability is still a
prototype approximation.

## Recorded sensor replay

Both captures contain 450 actual browser-rendered noisy RGB-D/body-IMU frames
covering 45 simulated seconds. The same raw observations were replayed before
and after the estimator change. Simulation truth is used only to evaluate error,
never as an estimator observation or input. Older captures lacking noise metadata
were given their known capture calibration: disparity standard deviation 0.08 px,
native focal length `848/(2*tan(87°/2))`, and existing stereo baseline.

| Capture | Previous ATE / final error | Corrected ATE / final error |
| --- | --- | --- |
| Original city | 26.812 m / 64.238 m | 1.344 m / 1.693 m |
| Textured city | 52.352 m / 119.655 m | 0.443 m / 0.948 m |

The corrected textured-city replay accepted 225 visual corrections, retained
57 keyframes, and mapped all 450 frames. Final filter position trace standard
deviation was 0.233 m. An independent 250-frame actual-browser flight reported
ATE 0.203 m and 125 visual corrections. These are specific capture results,
not a guarantee for other environments or hardware.

Neither recorded trajectory accepted a loop closure. In the textured capture,
43 appearance-qualified candidates failed distinctive mutual landmark support:
mean support 20.7%, best 41.4%, below the retained 55% verification requirement.
The sensor-only synthetic closed-room trajectory also accepted no closure
(best support 54%). Independent landmark fixtures exercise genuine SE(3) graph
optimization and map correction, but do not prove city relocalization.

## Retained acceptance checks and limits

The retired executable checks are unavailable. Their independent analytic geometry, observability and rejection cases must be carried into actual Modelica/browser numerical gates without reducing the workloads or weakening thresholds.

The historical projection and visual-tracking tests covered
analytic planes, arbitrary mounts, foreground boundaries, noisy-plane unsupported
modes, six-direction surface correction, sensor-only closed motion, and rejected
valid clouds that must not add phantom map points. The 120-frame closed-room
fixture achieved ATE 0.048 m and final error 0.097 m. The historical browser visual-tracking
test ran the same source/fixture in actual Pyodide/NumPy. That result is evidence for the removed implementation, not an accepted Modelica estimator.

Mapping bootstraps once, then requires consistent visual geometry, a correction
within 0.5 s, and position trace standard deviation no greater than 0.75 m.
Prediction and visible uncertainty continue during loss. The 15-state filter
uses a conservative frozen-keyframe correlation approximation, not joint landmark
VIO: global map/filter correlations, general relocalization, hardware alignment,
noise/timing calibration, and robust place recognition remain limitations.
