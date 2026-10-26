import { showMenu, initMenuSelector } from "./menu.js";
import { initCheckupRoom } from "./rooms/checkupRoom.js";
import { initSurgeryRoom } from "./rooms/surgeryRoom.js";

const menus = {
  selector: document.getElementById("menu-selector"),
  checkup: document.getElementById("menu-checkup"),
  surgery: document.getElementById("menu-surgery"),
};

showMenu("selector");

initMenuSelector({
  btnToCheckup: document.getElementById("btnToCheckup"),
  btnToSurgery: document.getElementById("btnToSurgery"),
  btnBackToSelector: document.getElementById("btnBackToSelector"),
  btnExitRooms: document.getElementById("btnExitRooms"),
  onPickRoom: (room) => showMenu(room),
});

initCheckupRoom({
  menuEl: menus.checkup,
  patientEmojiEl: document.getElementById("checkupPatientEmoji"),
  patientPickerEl: document.getElementById("patientPicker"),
  toolRowEl: document.getElementById("checkupToolRow"),
});

initSurgeryRoom({
  menuEl: menus.surgery,
  canvas: document.getElementById("surgeryCanvas"),
  spawnLayer: document.getElementById("spawnLayer"),
  trayEl: document.getElementById("tray"),
  statusTextEl: document.getElementById("surgeryStatusText"),
  toolRowEl: document.getElementById("surgeryToolRow"),
  skinTonePickerEl: document.getElementById("skinTonePicker"),
  resetBtnEl: document.getElementById("btnResetSurgery"),
});