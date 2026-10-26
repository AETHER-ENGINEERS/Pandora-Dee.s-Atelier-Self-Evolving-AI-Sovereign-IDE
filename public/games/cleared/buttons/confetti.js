/* Local stand-in for the confetti the button asked for. No network. */
function confetti(opts) {
  const count = Math.min(80, opts && opts.particleCount ? opts.particleCount : 40);
  const texts = opts && opts.shapeOptions && opts.shapeOptions.text && opts.shapeOptions.text.value;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999";
  document.body.appendChild(host);
  for (let i = 0; i < count; i += 1) {
    const bit = document.createElement("span");
    const raw = Array.isArray(texts) ? texts[i % texts.length] : "✦";
    const label = raw && typeof raw === "object" ? raw.value : raw;
    bit.textContent = typeof label === "string" && label ? label : "✦";
    bit.style.cssText = "position:absolute;left:" + (38 + Math.random() * 24) + "%;top:58%;font-size:" + (14 + Math.random() * 18) + "px;transition:transform .9s cubic-bezier(.2,.7,.2,1),opacity .9s";
    host.appendChild(bit);
    requestAnimationFrame(function () {
      const x = (Math.random() - 0.5) * 320;
      const y = -140 - Math.random() * 240;
      bit.style.transform = "translate(" + x + "px," + y + "px) rotate(" + (Math.random() - 0.5) * 90 + "deg)";
      bit.style.opacity = "0";
    });
  }
  setTimeout(function () { host.remove(); }, 1000);
}
