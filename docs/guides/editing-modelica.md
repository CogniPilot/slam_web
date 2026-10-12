# Editing Modelica

Choose an example from **Run model**, then open **Files** to browse its source.
The default inertial example is runnable. Responsive and smoothed examples change
the IMU filter response. Selecting a file to edit does not select a different model
to run.

Rumoca supplies completion, highlighting, hover information and live diagnostics.
After changing executable source, click **Apply & reset** to compile and restart it.
The initial project is prepared automatically; a new visitor only needs **Run**.

## Saving your project

Edits and settings are saved in this browser. **Save project** saves immediately.
**Download** exports a project file; **Open project** restores it on this or another
computer. Export a project before clearing browser storage or switching devices.
Saved source is retained when the website's defaults change.

## Exploring SLAM

**SLAM sources** exposes feature detection, RGB-D matching, filtering, mapping,
visual vocabulary and pose-graph correction. The library is maintained in
[CogniPilot Modelica Models](https://github.com/CogniPilot/modelica_models).
Compose components through a Modelica entry model; no visual node graph is needed.

Full SLAM execution remains pending. **Check WASM build** checks the edited source
with the browser compiler and reports errors; it does not activate the estimator.
**Cancel build** stops that check. Editing during a check requires a fresh check
for the new source. The running demo continues to use its selected inertial model.

## Documentation and agent help

**Docs** browses the loaded Modelica packages, their help annotations and
components. Search for a class, follow related-class links, or choose **Open
source** to edit it. **Refresh** includes your latest edits.

**Assistant** can read files and documentation, edit Modelica, check compilation,
and inspect a short simulation. Requested edits apply through the editor with
an **Undo edit** button; suggested changes appear as diffs for review.
For example: “Start in the store and fly around inside.” The assistant can look
up room coordinates, select Big city, and edit the Modelica starting pose and
trajectory. Physics, controllers and SLAM stay in Modelica. Inspect generated
missions; camera viewpoints and aisle references are not collision guarantees.

Choose OpenAI (Responses API), a compatible endpoint or local Ollama. Source
requested by tools is sent to that provider, which must allow browser requests.
Ollama needs `OLLAMA_ORIGINS` set to the site's origin. Credentials stay in page
memory; ChatGPT subscriptions do not include API billing.

**WebLLM** runs a small model on this device without API billing. It needs WebGPU
and about 1–2 GB of GPU memory. The first Send loads the WebLLM runtime from
the esm.run CDN and downloads and caches weights; inference runs in a worker. Small edits work best. Simulation pauses while the
assistant works; **Unload local model** releases its worker and GPU resources.

**Stop** cancels a request; an in-flight simulation frame finishes normally.
Analysis runs stop after at most 30 frames per request and a wall-time budget.
Requested flight uses normal playback after preparation. Compilation checks
report their scope: the selected example or a named component, never an
unaccepted proposal. These tools do not enable the pending full SLAM runtime.
**Forget key & conversation** clears the session and unloads the local model;
cached weights and project source remain.
