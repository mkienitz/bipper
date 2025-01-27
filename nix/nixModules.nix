{
  flake =
    {
      config,
      ...
    }:
    let
      flakeConfig = config;
    in
    {
      nixosModules.bipper =
        {
          config,
          lib,
          pkgs,
          ...
        }:
        let
          inherit (lib)
            mkOption
            mkEnableOption
            mkPackageOption
            types
            mkIf
            ;
          cfg = config.services.bipper;
        in
        {
          options.services.bipper = {
            enable = mkEnableOption "bipper";
            package = mkPackageOption pkgs "bipper" { };
            address = mkOption {
              description = "Address to listen on";
              type = types.str;
              default = "127.0.0.1";
              example = "[::1]";
            };
            port = mkOption {
              description = "Port to listen on";
              type = types.port;
              default = 8000;
            };
            storageDir = mkOption {
              description = ''
                Path to blob storage.
                Needs to be writable.'';
              type = types.str;
              default = "/var/lib/bipper";
            };
            storageDuration = mkOption {
              description = ''
                How long to store encrypted blobs.
                The periodic cleanup is achieved using systemd tmpfiles.
              '';
              type = types.str;
              default = "1d";
              example = "1d";
            };
          };
          config = mkIf cfg.enable {
            nixpkgs.overlays = [
              flakeConfig.overlays.default
            ];
            systemd.services.bipper = {
              description = "Bipper";
              after = [
                "network.target"
              ];
              wantedBy = [ "multi-user.target" ];
              serviceConfig = {
                ExecStart = lib.getExe cfg.package;
                User = "bipper";
                Group = "bipper";
                DynamicUser = true;
                WorkingDirectory = cfg.storageDir;
                StateDirectory = "bipper";
                StateDirectoryMode = "0750";
                Restart = "on-failure";
              };
              environment = {
                HOST = cfg.address;
                PORT = toString cfg.port;
                BIPPER_STORAGE_DIR = cfg.storageDir;
              };
            };
            systemd.tmpfiles.settings."10-bipper"."${cfg.storageDir}/store".e.age = cfg.storageDuration;
          };
        };
      nixosModules.default = config.nixosModules.bipper;

    };
}
