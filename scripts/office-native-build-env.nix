# Separate pinned compiler environment; the application's CI shell stays intact.
let
  app = builtins.getFlake (toString ../.);
  system = builtins.currentSystem;
  pkgs = import app.inputs.nixpkgs {
    inherit system;
    overlays = [ app.inputs.rust-overlay.overlays.default ];
  };
  rust = pkgs.rust-bin.nightly."2026-02-27".default;
in pkgs.mkShell {
  packages = [ pkgs.nodejs_24 pkgs.git pkgs.pkg-config rust ];
  buildInputs = [ pkgs.openssl pkgs.zlib ];
  CARGO_BUILD_JOBS = "4";
  RUSTFLAGS = "-C linker-features=-lld";
}
