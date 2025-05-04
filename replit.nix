{pkgs}: {
  deps = [
    pkgs.jq
    pkgs.udev
    pkgs.binaryen
    pkgs.rustup
    pkgs.wasm-pack
    pkgs.wasm-bindgen-cli
    pkgs.trunk
  ];
}
