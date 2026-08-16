import { paintBootLogo } from "./game/ui/bootLoader";

// Runs as its own module so the chrome wordmark paints before Phaser finishes loading.
paintBootLogo();
