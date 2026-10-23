let
  models = builtins.getFlake (toString ../models/Libraries/CogniPilot);
  system = builtins.currentSystem;
  pkgs = models.inputs.nixpkgs.legacyPackages.${system};
  omc = models.inputs.openmodelica.packages.${system}.default;
in pkgs.mkShell {
  packages = [ pkgs.nodejs omc ];
  OMC_BIN = "${omc}/bin/omc";
}
