{
  description = "Pinned official runtime releases for Devbox";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/d3b13ad75cc492690728f9307e443dec9ef9a20e";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ];
      eachSystem = nixpkgs.lib.genAttrs systems;
      packagesFor = system:
        let
          pkgs = import nixpkgs { inherit system; };
          fetchurl = pkgs.fetchurl;
          denoVersion = "2.9.8";
          bunVersion = "1.4.4";
          temurinVersion = "21.0.13";
          denoSources = {
            aarch64-darwin = fetchurl {
              url = "https://github.com/denoland/deno/releases/download/v${denoVersion}/deno-aarch64-apple-darwin.zip";
              sha256 = "9f0bf660393da2eaff044cdc7444cb08c73f235849b61d224d825a194ce7c98e";
            };
            x86_64-linux = fetchurl {
              url = "https://github.com/denoland/deno/releases/download/v${denoVersion}/deno-x86_64-unknown-linux-gnu.zip";
              sha256 = "e890975bc2549807bbcc0b584ffafda72cc7c93349dd99c80483dd784f6c4609";
            };
            aarch64-linux = fetchurl {
              url = "https://github.com/denoland/deno/releases/download/v${denoVersion}/deno-aarch64-unknown-linux-gnu.zip";
              sha256 = "d49596c20b9788cf8f5d8ddf644103d4bde56ed239753f0bdb92ba9361d51905";
            };
          };
          bunSources = {
            aarch64-darwin = fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-darwin-aarch64.zip";
              sha256 = "c240d7f0ccb90c263a849fcdb09b7ee62630d921348ed6aafda86b9d577bc510";
            };
            x86_64-linux = fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-linux-x64-baseline.zip";
              sha256 = "e0446eb55995772eb9894bebae9a6be368d985a8b9271ee124486f9946eedd76";
            };
            aarch64-linux = fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-linux-aarch64.zip";
              sha256 = "baa6bb36f51d6e58561e02bbea825038a9df454f673d6d776e8bbf86f8c7850e";
            };
          };
          temurinAssets = {
            aarch64-darwin = {
              url = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.13_9.tar.gz";
              sha256 = "bf036b35b071bfb2f54f2c0af8ee8d88afa95ee6eb3dce02c0f94cfc2524d04a";
            };
            x86_64-linux = {
              url = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.13_9.tar.gz";
              sha256 = "d7f5d5cf865a2902b70ff549b97586a7d3f234e016f041ab447ea740c7d66d1c";
            };
            aarch64-linux = {
              url = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.13_9.tar.gz";
              sha256 = "e3522e707fc7dbe2a72c30746b1e7068301a0213ecd213d4491f35a14eb55578";
            };
          };
          deno = pkgs.stdenvNoCC.mkDerivation {
            pname = "deno";
            version = denoVersion;
            src = denoSources.${system};
            nativeBuildInputs = [ pkgs.unzip ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
            buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.stdenv.cc.cc.lib ];
            sourceRoot = ".";
            dontStrip = true;
            dontConfigure = true;
            dontBuild = true;
            installPhase = ''
              runHook preInstall
              install -Dm755 deno $out/bin/deno
              runHook postInstall
            '';
            meta = {
              description = "A modern JavaScript and TypeScript runtime";
              mainProgram = "deno";
              platforms = systems;
            };
          };
          bun = (pkgs.bun.overrideAttrs (old: {
            version = bunVersion;
            src = bunSources.${system};
          }));
          temurin = (pkgs.temurin-bin-21.overrideAttrs (old: {
            version = temurinVersion;
            src = fetchurl temurinAssets.${system};
          }));
        in {
          inherit deno;
          bun = bun;
          temurin-bin-21 = temurin;
        };
    in {
      packages = eachSystem (system: packagesFor system);
    };
}
