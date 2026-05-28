{
  description = "Yawp dev shell — Phoenix + Ash + React/React Native";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        beam = pkgs.beam.packages.erlang_28;
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            android-tools
            beam.elixir_1_19
            beam.erlang
            git
            gnumake
            just
            nodejs_22
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
}
