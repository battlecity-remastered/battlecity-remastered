{
  description = "BattleCity TypeScript monorepo dev shell";

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
          ];

          shellHook = ''
            export BATTLECITY_ROOT="$(pwd)"
            export PATH="$BATTLECITY_ROOT/node_modules/.bin:$PATH"
            echo "BattleCity TypeScript dev shell ready (node $(node --version))."
            echo "Install deps once: npm install"
            echo "Run dev servers: npm run dev"
          '';
        };
      });
}
