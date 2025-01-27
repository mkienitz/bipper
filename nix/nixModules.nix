{
  flake =
    {
      config,
      inputs,
      ...
    }:
    {
      nixosModules = {
        bipper =
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
              storagePath = mkOption {
                description = ''
                  Path of blob storage.
                  Needs to be writable.'';
                type = types.str;
                default = "/var/lib/bipper";
              };
            };
            config = mkIf cfg.enable {
              nixpkgs.overlays = [
                inputs.self.overlays.default
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
                  WorkingDirectory = cfg.storagePath;
                  StateDirectory = "bipper";
                  StateDirectoryMode = "0750";
                  Restart = "on-failure";
                };
                environment = {
                  HOST = cfg.address;
                  PORT = toString cfg.port;
                  BIPPER_STORAGE_PATH = cfg.storagePath;
                };
              };
            };
          };
        default = config.nixosModules.bipper;
      };
    };
}
