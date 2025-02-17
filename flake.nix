{
  description = "HTMX + Hono + Deno";

  inputs = {
    devshell = {
      url = "github:numtide/devshell";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    pre-commit-hooks = {
      url = "github:cachix/pre-commit-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];

      imports = [
        inputs.devshell.flakeModule
        inputs.flake-parts.flakeModules.easyOverlay
        inputs.pre-commit-hooks.flakeModule
        inputs.treefmt-nix.flakeModule
        ./nix/nixModules.nix
      ];

      perSystem =
        {
          pkgs,
          config,
          lib,
          ...
        }:
        {
          devshells.default = {
            devshell.startup.pre-commit.text = config.pre-commit.installationScript;
            packages = [
              pkgs.nil
              pkgs.nodejs_22
              pkgs.sqlite
              pkgs.nodePackages."@tailwindcss/language-server"
              pkgs.nodePackages.tailwindcss
              pkgs.nodePackages.typescript-language-server
              pkgs.nodePackages.svelte-language-server
            ];
            env = [
              {
                name = "BIPPER_STORAGE_DIR";
                value = ".";
              }
              {
                name = "BIPPER_MAX_FILE_SIZE";
                value = "500";
              }
            ];
          };

          pre-commit.settings.hooks.treefmt.enable = true;

          packages.default = pkgs.buildNpmPackage {
            pname = "bipper";
            version = "0.0.1";
            src = ./.;
            npmDepsHash = "sha256-iSTKrpuDIEPNsxqdaqEoo5X9JATYM9a8s/hIAkXKPWI=";
            nativeBuildInputs = [ pkgs.makeWrapper ];
            installPhase = ''
              runHook preInstall
              mkdir -p $out/bin $out/share
              cp -R build $out/share/
              makeWrapper ${lib.getExe pkgs.nodejs_22} $out/bin/bipper \
                --set BODY_SIZE_LIMIT Infinity \
                --add-flags $out/share/build
              runHook postInstall
            '';
            meta = {
              description = "A simple file storage service that encrypts and decrypts files on the client";
              mainProgram = "bipper";
            };
          };

          overlayAttrs.bipper = config.packages.default;

          treefmt = {
            projectRootFile = "flake.nix";
            programs = {
              deadnix.enable = true;
              statix.enable = true;
              nixfmt.enable = true;
              prettier.enable = true;
            };
          };
        };

    };
}
