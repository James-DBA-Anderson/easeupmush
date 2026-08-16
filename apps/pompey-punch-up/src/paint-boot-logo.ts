import { paintBootLogo } from "./game/ui/bootLoader";

// Runs as its own module so the chrome wordmark paints before Phaser finishes loading.
function paint(): void {
  paintBootLogo();
}

paint();

// Re-paint after fonts settle (Impact / Arial Black metrics can shift on first load).
if (document.fonts?.ready) {
  void document.fonts.ready.then(() => {
    const loader = document.getElementById("boot-loader");
    if (loader && !loader.classList.contains("is-done")) paint();
  });
}
