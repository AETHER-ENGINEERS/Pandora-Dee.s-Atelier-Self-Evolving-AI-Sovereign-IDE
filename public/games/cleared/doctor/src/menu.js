export function showMenu(room) {
  const menus = ["selector", "checkup", "surgery"];
  for (const key of menus) {
    const el = document.getElementById(`menu-${key}`);
    if (!el) continue;
    el.classList.toggle("hidden", key !== room);
  }

  const exitBtn = document.getElementById("btnExitRooms");
  if (exitBtn) exitBtn.classList.toggle("hidden", room === "selector");
}

export function initMenuSelector({
  btnToCheckup,
  btnToSurgery,
  btnBackToSelector,
  btnExitRooms,
  onPickRoom,
}) {
  btnToCheckup?.addEventListener("click", () => onPickRoom("checkup"));
  btnToSurgery?.addEventListener("click", () => onPickRoom("surgery"));
  btnBackToSelector?.addEventListener("click", () => onPickRoom("selector"));
  btnExitRooms?.addEventListener("click", () => onPickRoom("selector"));
}