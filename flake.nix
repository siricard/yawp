{
  description = "Yawp dev shell — Phoenix + Ash + React/React Native";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f system);
    in {
      devShells = forEachSystem (system:
        let
          pkgs = import nixpkgs { inherit system; };
          beam = pkgs.beam.packages.erlang_28;
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              android-tools
              beam.elixir_1_19
              beam.erlang
              git
              gnumake
              just
              nodejs_22
              openssl
              openssl.dev
              pkg-config
              pnpm
              watchman
              zulu17
            ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              pkgs.inotify-tools
            ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
              pkgs.cocoapods
            ];

            shellHook = ''
              export ANDROID_HOME="$HOME/Library/Android/sdk"
              export LANG=en_US.UTF-8
              export ERL_AFLAGS="-kernel shell_history enabled"
              mix local.hex --if-missing >/dev/null 2>&1 || true
              mix local.rebar --if-missing >/dev/null 2>&1 || true
            '';
          };
        });
    };
}
