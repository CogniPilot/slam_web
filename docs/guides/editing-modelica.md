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

**Assistant** connects to an OpenAI-compatible API or a local Ollama endpoint.
Enter its URL, a tool-capable model ID and any required API key. The agent can
read project files and documentation, inspect diagnostics, check the selected
model and its library sources, and propose edits. This check excludes the full
SLAM workspace and other experiment files. Review each diff before accepting it; acceptance uses
the normal editor and saving behavior. **Stop** cancels a request, and **Forget
key & conversation** clears the session. Keys are kept only in page memory.

Source requested by the agent is sent to the provider you choose. That provider
must allow browser requests. Local Ollama needs `OLLAMA_ORIGINS` configured for
the site's origin. ChatGPT account sign-in and Claude's native API are not
currently integrated.
