// Generated from CogniPilot/modelica_models f367ef4cff7ce8bf2628662a695598106ff7f17c; edit the canonical packages there.
// Native common D435 stream mode. RGB and depth keep separate optical
// calibrations; this package specifies array extents, not alignment.
// RGB supports60 Hz, depth90 Hz; paired acquisitions use at most60 Hz.
package D435ImageProfile
  constant Integer width = 848;
  constant Integer height = 480;
  constant Integer colorChannels = 3;
  constant Real depthUnits = 0.001 "Default SDK scale, meters per Z16 unit";
end D435ImageProfile;
