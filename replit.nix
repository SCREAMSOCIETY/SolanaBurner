{pkgs}: {
  deps = [
    pkgs.binaryen
    pkgs.rustup
    pkgs.wasm-pack
    pkgs.wasm-bindgen-cli
    pkgs.trunk
  ];
}
