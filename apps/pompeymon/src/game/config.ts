import Phaser from "phaser";
import { GBA_H, GBA_W } from "./constants";
import { AvenueScene } from "./scenes/AvenueScene";
import { BathroomScene } from "./scenes/BathroomScene";
import { BedroomScene } from "./scenes/BedroomScene";
import { BridgeScene } from "./scenes/BridgeScene";
import { DebugScene } from "./scenes/DebugScene";
import { FrontRoomScene } from "./scenes/FrontRoomScene";
import { HallScene } from "./scenes/HallScene";
import { HighStreetScene } from "./scenes/HighStreetScene";
import { HillScene } from "./scenes/HillScene";
import { EncounterScene } from "./scenes/EncounterScene";
import { IslandScene } from "./scenes/IslandScene";
import { KitchenScene } from "./scenes/KitchenScene";
import { LabScene } from "./scenes/LabScene";
import { LandingScene } from "./scenes/LandingScene";
import { RoundaboutScene } from "./scenes/RoundaboutScene";
import { SchoolInScene } from "./scenes/SchoolInScene";
import { SchoolScene } from "./scenes/SchoolScene";
import { TitleScene } from "./scenes/TitleScene";
import { BikeShopScene } from "./scenes/BikeShopScene";
import { JunkShopScene } from "./scenes/JunkShopScene";
import { TakeawayScene } from "./scenes/TakeawayScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GBA_W,
  height: GBA_H,
  backgroundColor: "#0b1c24",
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    TitleScene,
    DebugScene,
    BedroomScene,
    LandingScene,
    BathroomScene,
    HallScene,
    KitchenScene,
    FrontRoomScene,
    AvenueScene,
    RoundaboutScene,
    HillScene,
    BridgeScene,
    HighStreetScene,
    LabScene,
    BikeShopScene,
    JunkShopScene,
    TakeawayScene,
    IslandScene,
    SchoolScene,
    SchoolInScene,
    EncounterScene,
  ],
};
