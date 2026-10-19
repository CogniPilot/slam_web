# Isolated benchmark environment; no profile or live-console installation.
let
  overlay = builtins.getFlake "github:lopsided98/nix-ros-overlay/814d97b0b7236c0834fc079effa55acabb269926";
  pkgs = import overlay.inputs.nixpkgs {
    system = builtins.currentSystem;
    overlays = [ overlay.overlays.default ];
  };
  ros = pkgs.rosPackages.jazzy;
in ros.buildEnv {
  name = "slam-comparison-ros2-jazzy";
  paths = with ros; [
    ros-core rclpy cv-bridge sensor-msgs nav-msgs geometry-msgs
    rosgraph-msgs tf2-ros rtabmap-odom rtabmap-slam
  ];
}
