{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    crane = {
      url = "github:ipetkov/crane";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    devshell = {
      url = "github:numtide/devshell";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs = inputs @ {
    self,
    crane,
    devshell,
    fenix,
    flake-utils,
    nixpkgs,
    ...
  }:
    {
      nixosModules.bipper = import ./nix/module.nix inputs;
      nixosModules.default = self.nixosModules.bipper;
      overlays.default = final: prev: {
        bipper = self.packages.${prev.stdenv.hostPlatform.system}.default;
      };
    }
    // flake-utils.lib.eachDefaultSystem
    (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            devshell.overlays.default
            fenix.overlays.default
          ];
        };
        # Crane build
        rustToolchain = pkgs.fenix.complete.withComponents [
          "cargo"
          "clippy"
          "rustfmt"
          "rust-src"
          "rustc"
        ];
        craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchain;
        migrationsFilter = path: _type: builtins.match ".*/migrations/.*$" path != null;
        cargoFilter = craneLib.filterCargoSources;
        srcFilter = path: type: builtins.any (f: f path type) [cargoFilter migrationsFilter];
        src = nixpkgs.lib.cleanSourceWith {
          src = ./.;
          filter = srcFilter;
        };
        commonArgs = {
          inherit src;
          buildInputs =
            [
              # Add additional build inputs here
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
              # Additional darwin specific inputs can be set here
              pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
              pkgs.darwin.apple_sdk.frameworks.CoreFoundation
              pkgs.libiconv
              # pkgs.SDL2
            ];
        };
        bipper = craneLib.buildPackage commonArgs;
        # fpkgs = fenix.packages.${system};
      in {
        # nix flake check
        checks = {
          inherit bipper;
        };
        nixosTests.bipper = import ./nix/tests.nix {inherit pkgs self;};
        packages.default = bipper;
        packages.bipper-docker = pkgs.dockerTools.buildLayeredImage {
          name = "bipper";
          config.Cmd = ["${bipper}/bin/bipper"];
        };
        formatter = pkgs.alejandra;
        devShells.default = pkgs.devshell.mkShell {
          language.rust.enableDefaultToolchain = false;
          imports = [
            "${devshell}/extra/language/rust.nix"
            "${devshell}/extra/language/c.nix"
          ];
          packages = with pkgs;
            [
              nil
              rustToolchain
              rust-analyzer
            ]
            ++ commonArgs.buildInputs;
          env = [
            {
              name = "RUST_SRC_PATH";
              value = "${rustToolchain}/lib/rustlib/src/rust/library";
              # value = "/Users/max/.rustup/toolchains/nightly-aarch64-apple-darwin/lib/rustlib/src/rust/library";
            }
          ];
        };
      }
    );
}
