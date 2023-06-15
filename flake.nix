{
  description = "Shardus core";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    utils.url = "github:numtide/flake-utils";
    shardus-cli.url = "git+https://gitlab.com/shardus/tools/shardus-cli?ref=nix-flake";
  };

  outputs = {
    self,
    nixpkgs,
    shardus-cli,
    utils,
  }: let
    appName = "shardus-core";
    out =
      utils.lib.eachDefaultSystem
      (system: let
        pkgs = import nixpkgs {
          inherit system;
        };
        buildNodeJs = pkgs.callPackage "${nixpkgs}/pkgs/development/web/nodejs/nodejs.nix" {python = pkgs.python3;};
        custom-nodejs = buildNodeJs {
          enableNpm = true;
          version = "18.16.0";
          sha256 = "067ijdh9073wyvqb7rlxjy8lbl08j0hg5954vnd50ni37qiimn1k";
        };

        nativeBuildInputs = with pkgs; [
          custom-nodejs
        ];
        buildInputs = with pkgs; [];
      in {
        # `nix develop` or direnv
        devShell = pkgs.mkShell {
          packages =
            nativeBuildInputs
            ++ buildInputs
            ++ (with pkgs; [
              nodePackages.typescript-language-server
              nodePackages.vscode-langservers-extracted
              nodePackages.prettier

              shardus-cli.packages.${system}.default
            ]);
        };
      });
  in
    out
    // {
      overlay = final: prev: {
        ${appName} = self.defaultPackage.${prev.system};
      };
    };
}
