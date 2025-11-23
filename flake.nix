{
  description = "BattleCity JS Remake - Nix flake for client/server development";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_20;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            nodejs
            pkgs.esbuild
            pkgs.watchexec
            pkgs.pre-commit
            (pkgs.python311.withPackages (ps: [
              ps.numpy
              ps.matplotlib
            ]))
          ];

          shellHook = ''
            export BATTLECITY_ROOT="$(pwd)"
            export PATH="$BATTLECITY_ROOT/client/node_modules/.bin:$BATTLECITY_ROOT/server/node_modules/.bin:$PATH"
            echo "BattleCity dev shell ready (node $(node --version))."
            echo "Install deps once: (cd client && npm install) && (cd server && npm install)"
            echo "Install git hooks: pre-commit install --install-hooks"
            echo "Run dev servers:"
            echo "  client -> cd client && npm run dev"
            echo "  server -> cd server && npm run dev"
          '';
        };
      });
}
