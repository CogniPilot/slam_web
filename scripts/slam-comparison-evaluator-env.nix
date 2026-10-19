let
  overlay = builtins.getFlake "github:lopsided98/nix-ros-overlay/814d97b0b7236c0834fc079effa55acabb269926";
  pkgs = import overlay.inputs.nixpkgs { system = builtins.currentSystem; };
in pkgs.python3.withPackages (ps: [ ps.numpy ps.msgpack ])
