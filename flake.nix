{
  description = "Reproducible Modelica SLAM Lab browser and compiler tools";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs = { nixpkgs, rust-overlay, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      environment = system:
        let
          pkgs = import nixpkgs { inherit system; overlays = [ rust-overlay.overlays.default ]; };
          rust = pkgs.rust-bin.stable."1.95.0".default.override {
            targets = [ "wasm32-unknown-unknown" ];
          };
        in { inherit pkgs rust; };
    in {
      packages = forAllSystems (system:
        let
          inherit (environment system) pkgs rust;
          toolchain = pkgs.buildEnv {
            name = "slam-lab-compiler-tools";
            paths = [ pkgs.nodejs_24 rust ];
          };
        in { default = toolchain; inherit toolchain; });
      devShells = forAllSystems (system:
        let
          inherit (environment system) pkgs rust;
          shell = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 rust pkgs.chromium pkgs.git pkgs.pkg-config pkgs.perf pkgs.wasm-tools ];
            CARGO_BUILD_JOBS = "2";
            RUST_TEST_THREADS = "2";
            RAYON_NUM_THREADS = "2";
            CHROMIUM_PATH = toString pkgs.chromium + "/bin/chromium";
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            shellHook = ''
              export CARGO_TARGET_DIR="''${CARGO_TARGET_DIR:-$HOME/scratch/slam_web/build/cargo}"
              export npm_config_cache="''${npm_config_cache:-$HOME/scratch/slam_web/build/npm-cache}"
              export TMPDIR="$HOME/scratch/slam_web/tmp"
              mkdir -p "$CARGO_TARGET_DIR" "$npm_config_cache" "$TMPDIR"
            '';
          };
        in { default = shell; ci = shell; });
      checks = forAllSystems (system:
        let inherit (environment system) pkgs rust;
        in {
          toolchain = pkgs.runCommand "slam-lab-compiler-toolchain-check" {
            nativeBuildInputs = [ pkgs.nodejs_24 rust ];
          } ''
            node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) process.exit(1)'
            cargo --version
            rustfmt --version
            printf '#[unsafe(no_mangle)] pub extern "C" fn add(a: i32, b: i32) -> i32 { a + b }\n' > smoke.rs
            rustc --crate-type=cdylib --target wasm32-unknown-unknown smoke.rs -o smoke.wasm
            node --input-type=module <<'JS'
            import { readFile } from 'node:fs/promises';
            const { instance } = await WebAssembly.instantiate(await readFile('smoke.wasm'));
            if (instance.exports.add(19, 23) !== 42) throw new Error('Compiler WASM ABI check failed');
            JS
            touch "$out"
          '';
        });
    };
}
